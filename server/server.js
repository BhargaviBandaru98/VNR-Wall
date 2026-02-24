require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const { extendSchema } = require('./database/extendSchema');
const { verifyMessageWithAI, groq } = require('./services/aiVerificationService');
const { scrapeUrl } = require('./services/firecrawlService');
const { searchOfficialSite, extractCompanyName } = require('./services/searchService');
const { checkUrlSafety } = require('./services/webRiskService');
const { sendAdminAlert, verifyConnection } = require('./services/emailService');
console.log('[DIAGNOSTIC] Services loaded.');
const app = express();
const PORT = process.env.PORT || 6105;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3105';

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

// Connect to SQLite database
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) return console.error("❌ Failed to connect:", err.message);
  console.log('✅ Connected to SQLite database.');
  extendSchema(db, () => {
    console.log('✅ AI schema extension complete.');
    verifyConnection(); // Verify SMTP at startup
  });
});

// Create users table
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    roll TEXT,
    branch TEXT,
    year TEXT,
    contact TEXT
  )
`, (err) => {
  if (err) console.error("❌ Error creating users table:", err.message);
  else console.log("✅ Users table ready.");
});

// Create datacheck table
db.run(`
  CREATE TABLE IF NOT EXISTS datacheck (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    roll TEXT,
    branch TEXT,
    year TEXT,
    dateReceived TEXT,
    platform TEXT,
    sender TEXT,
    contact TEXT,
    category TEXT,
    flags TEXT,
    responded TEXT,
    personalDetails TEXT,
    genuineRating TEXT,
    message TEXT,
    status TEXT
  )
`, (err) => {
  if (err) console.error("❌ Error creating datacheck table:", err.message);
  else console.log("✅ Datacheck table ready.");
});

// Insert complaint data
app.post('/api/user-check-data', (req, res) => {
  const {
    name, roll, branch, year, dateReceived,
    platform, sender, contact, category,
    flags, responded, personalDetails,
    genuineRating, message
  } = req.body;

  const flagsString = JSON.stringify(flags);

  const sql = `
    INSERT INTO datacheck (
      name, roll, branch, year, dateReceived,
      platform, sender, contact, category,
      flags, responded, personalDetails, genuineRating, message, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    name, roll, branch, year, dateReceived,
    platform, sender, contact, category,
    flagsString, responded, personalDetails, genuineRating, message, 'null'
  ];

  db.run(sql, params, function (err) {
    if (err) {
      console.error("❌ DB Insert Error:", err.message);
      return res.status(500).send(err.message);
    }
    const newId = this.lastID;
    console.log("✅ Data inserted, ID:", newId);

    // Send response immediately — AI runs in background after this
    res.json({ success: true, id: newId });

    // Triple-Layer Defense Pipeline — runs after response, never blocks the request
    setImmediate(async () => {
      try {
        console.log('\n====== PIPELINE START: ID', newId, '======');
        let investigationPath = [];
        const submissionData = { id: newId, name, roll, branch, message, category, platform, sender };

        // ─── STAGE 0: Google Web Risk — Instant URL Block ─────────────────────
        console.log('[Stage 0] Google Web Risk check...');
        const webRisk = await checkUrlSafety(message);

        if (webRisk.isUnsafe) {
          investigationPath.push(`Web Risk BLOCKED (${webRisk.threatType})`);
          const evidence = `BLOCKED: URL flagged by Google Web Risk as ${webRisk.threatType}. URL: ${webRisk.url} | Investigation: ${investigationPath.join(' → ')}`;
          db.run(
            `UPDATE datacheck SET ai_score=100, ai_result='FAKE', ai_confidence='HIGH', ai_evidence=?, ai_checked=1, ai_last_checked=datetime('now'), status='Fake' WHERE id=?`,
            [evidence, newId],
            (e) => e ? console.error('[Stage 0] DB update failed:', e.message) : console.log('[Stage 0] ✅ Blocked & saved for ID:', newId)
          );
          console.log('====== PIPELINE END (WEB RISK BLOCK): ID', newId, '======\n');
          return; // Skip all further API calls
        }

        investigationPath.push('Web Risk Pass');
        console.log('[Stage 0] ✅ URL clean — proceeding to AI investigation.');

        // ─── STAGE A: Extract company name ────────────────────────────────────
        console.log('[Stage A] Extracting company name...');
        const companyName = await extractCompanyName(message, groq);
        console.log('[Stage A] Company:', companyName || 'not found');

        // ─── STAGE B: Serper + Firecrawl in parallel ──────────────────────────
        console.log('[Stage B] Serper + Firecrawl (parallel)...');
        const [officialLinks, pageContent] = await Promise.all([
          companyName ? searchOfficialSite(companyName) : Promise.resolve([]),
          scrapeUrl(message),
        ]);
        console.log('[Stage B] Official links:', officialLinks.length, '| Page chars:', pageContent.length);

        // ─── STAGE C: Groq AI with all 3 evidence sources ────────────────────
        console.log('[Stage C] Groq AI with all evidence...');
        const aiResult = await verifyMessageWithAI(message, pageContent, officialLinks);
        console.log('[Stage C] Fake Score:', aiResult.fake_score, '| Genuine Score:', aiResult.genuine_score, '| Result:', aiResult.result, '| Confidence:', aiResult.confidence);
        console.log('[Stage C] Fake Evidence:', aiResult.evidence);
        console.log('[Stage C] Genuine Evidence:', aiResult.genuine_evidence);
        investigationPath.push('AI Investigated');

        // ─── STAGE D: Determine status & save ─────────────────────────────────
        const fakeScore = aiResult.fake_score;
        const genuineScore = aiResult.genuine_score || 0;
        let finalStatus = 'null'; // In Review by default

        // Branch 1: Genuine score dominates → auto-mark Genuine
        if (genuineScore > fakeScore) {
          finalStatus = 'Genuine';
          investigationPath.push('Auto-marked Genuine');
          console.log('[Stage D] ✅ Genuine dominates — auto-marking Genuine. Score:', genuineScore, '>', fakeScore);

          // Branch 2: High fake score → auto-mark Fake
        } else if (fakeScore >= 80) {
          finalStatus = 'Fake';
          investigationPath.push('Auto-marked Fake');

          // Branch 3: Borderline fake → In Review + admin alert
        } else if (fakeScore >= 60) {
          finalStatus = 'null'; // Keep as In Review
          investigationPath.push('Admin Notified');
        }
        // Branch 4: Low fake score, genuine not dominant → In Review (no action)

        // Build final evidence string — include both scores and genuine evidence
        const finalEvidence = genuineScore > fakeScore
          ? `GENUINE: ${aiResult.genuine_evidence} | Fake Score: ${fakeScore} | Genuine Score: ${genuineScore} | Path: ${investigationPath.join(' → ')}`
          : `${aiResult.evidence} | Fake Score: ${fakeScore} | Genuine Score: ${genuineScore} | Path: ${investigationPath.join(' → ')}`;

        // Save AI results to DB
        db.run(
          `UPDATE datacheck SET ai_score=?, ai_result=?, ai_confidence=?, ai_evidence=?, ai_checked=1, ai_last_checked=datetime('now') WHERE id=?`,
          [fakeScore, aiResult.result, aiResult.confidence, finalEvidence, newId],
          (updateErr) => {
            if (updateErr) {
              console.error('[Stage D] DB update failed:', updateErr.message);
              return;
            }
            console.log('[Stage D] ✅ AI results saved for ID:', newId);

            // Auto-mark Genuine if genuine score dominates
            if (genuineScore > fakeScore) {
              db.run(`UPDATE datacheck SET status = 'Genuine' WHERE id = ?`, [newId], (e) => {
                if (e) console.error('[Stage D] Auto-mark GENUINE failed:', e.message);
                else console.log('[Stage D] ✅ Auto-marked GENUINE for ID:', newId, '(genuine', genuineScore, '> fake', fakeScore + ')');
              });
            }

            // Auto-mark Fake if score >= 80
            if (fakeScore >= 80 && genuineScore <= fakeScore) {
              db.run(`UPDATE datacheck SET status = 'Fake' WHERE id = ?`, [newId], (e) => {
                if (e) console.error('[Stage D] Auto-mark FAKE failed:', e.message);
                else console.log('[Stage D] ✅ Auto-marked FAKE (>=80) for ID:', newId);
              });
            }

            // Send admin alert if fake score is 60-79 and not dominated by genuine score
            if (fakeScore >= 60 && fakeScore < 80 && genuineScore <= fakeScore) {
              const alertResult = { ...aiResult, evidence: finalEvidence };
              sendAdminAlert(submissionData, alertResult, investigationPath.join(' → '))
                .then(() => console.log('[Stage D] ✅ Admin alert sent for ID:', newId))
                .catch(e => console.error('[Stage D] Admin alert failed:', e.message));
            }
          }
        );

        console.log('====== PIPELINE END: ID', newId, '| Fake:', fakeScore, '| Genuine:', genuineScore, '| Status:', finalStatus, '======\n');


      } catch (error) {
        console.error('Pipeline failed for ID:', newId, '—', error.message);
      }
    });
  });
});

// Get all datacheck entries
app.get('/api/datas', (req, res) => {
  db.all('SELECT * FROM datacheck', (err, rows) => {
    if (err) return res.status(500).send(err.message);
    res.json(rows);
  });
});

// Get all users
app.get('/api/users', (req, res) => {
  db.all('SELECT * FROM users', (err, rows) => {
    if (err) return res.status(500).send(err.message);
    res.json(rows);
  });
});

// Add user
app.post('/api/users', (req, res) => {
  const { name, roll, branch, year, contact } = req.body;

  const sql = `
    INSERT INTO users (name, roll, branch, year, contact)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.run(sql, [name, roll, branch, year, contact], function (err) {
    if (err) return res.status(500).send(err.message);
    res.json({ success: true, id: this.lastID });
  });
});

// Update status
app.put('/api/update-status/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const sql = `UPDATE datacheck SET status = ? WHERE id = ?`;
  db.run(sql, [status, id], function (err) {
    if (err) {
      console.error("❌ Error updating status:", err.message);
      return res.status(500).send(err.message);
    }
    console.log(`✅ Status updated for ID ${id} to ${status}`);
    res.json({ success: true });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
