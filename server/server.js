require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const { extendSchema } = require('./database/extendSchema');
const { verifyMessageWithAI, groq } = require('./services/aiVerificationService');
const { scrapeUrl } = require('./services/firecrawlService');
const { searchOfficialSite, extractCompanyName } = require('./services/searchService');
const { checkUrlSafety } = require('./services/webRiskService');
const { sendAdminAlert, sendUserNotification, verifyConnection } = require('./services/emailService');
console.log('[DIAGNOSTIC] Services loaded.');
const app = express();
const PORT = process.env.PORT || 6105;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3105';

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

// ─── DEV ONLY BYPASS ─────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/dev/login', (req, res) => {
    const { email } = req.body;
    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) {
        // mock a generic user for the audit
        const mockUser = {
          id: 9999,
          name: "Dev User",
          email: email,
          picture: "",
          is_profile_complete: 1,
          user_role: email.includes('admin') ? 'Admin' : 'Student',
          year_of_study: '4',
          college_name: 'VNRVJIET',
          branch: 'CS',
          roll: 'DEV-01'
        };
        return res.json({ success: true, user: mockUser });
      }
      res.json({ success: true, user: row });
    });
  });
}

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
    flags, responded, personalDetails, responseDetails,
    genuineRating, message, userEmail, send_email_notification
  } = req.body;

  const flagsString = JSON.stringify(flags);
  const notifyFlag = send_email_notification ? 1 : 0;

  const sql = `
    INSERT INTO datacheck (
      name, roll, branch, year, dateReceived,
      platform, sender, contact, category,
      flags, responded, personalDetails, response_details, genuineRating, message, status, user_email, send_email_notification
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    name, roll, branch, year, dateReceived,
    platform, sender, contact, category,
    flagsString, responded, personalDetails, responseDetails, genuineRating, message, 'null', userEmail, notifyFlag
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
        const submissionData = { id: newId, name, roll, branch, message, category, platform, sender };

        // ─── Phase 6d: Deduplication (Cache) Layer ────────────────────────────
        console.log('[Deduplication] Checking for existing identical message...');
        const duplicateCheckSql = `
          SELECT id, status, ai_score, ai_result, ai_confidence, ai_evidence, genuine_evidence, risk_level, protective_guidance, is_expired
          FROM datacheck 
          WHERE message = ? AND ai_checked = 1 AND id != ?
          LIMIT 1
        `;

        const existingResult = await new Promise((resolve) => {
          db.get(duplicateCheckSql, [message, newId], (err, row) => {
            if (err) {
              console.error('[Deduplication] Error:', err.message);
              resolve(null);
            } else {
              resolve(row);
            }
          });
        });

        if (existingResult) {
          console.log('[Deduplication] ♻️  Matching message found (ID: ' + existingResult.id + '). Using cached result.');
          const cachedEvidence = `[CACHED RESULT] ${existingResult.ai_evidence}`;

          await new Promise((resolve) => {
            db.run(
              `UPDATE datacheck SET status = ?, ai_score = ?, ai_result = ?, ai_confidence = ?, ai_evidence = ?, genuine_evidence = ?, risk_level = ?, protective_guidance = ?, is_expired = ?, ai_checked = 1, ai_last_checked = datetime('now') WHERE id = ?`,
              [
                existingResult.status, existingResult.ai_score, existingResult.ai_result,
                existingResult.ai_confidence, cachedEvidence, existingResult.genuine_evidence,
                existingResult.risk_level, existingResult.protective_guidance, existingResult.is_expired, newId
              ],
              (err) => {
                if (err) console.error('[Deduplication] Cache update failed:', err.message);
                resolve();
              }
            );
          });

          console.log('====== PIPELINE END (CACHED): ID', newId, '======\n');
          return; // Skip all API calls
        }

        let investigationPath = [];
        // ─── STAGE 0: Google Web Risk — Instant URL Block ─────────────────────
        console.log('[Stage 0] Google Web Risk check...');
        const webRisk = await checkUrlSafety(message);

        if (webRisk.isUnsafe) {
          investigationPath.push(`Web Risk BLOCKED (${webRisk.threatType})`);
          const evidence = `BLOCKED: URL flagged by Google Web Risk as ${webRisk.threatType}. URL: ${webRisk.url} | Investigation: ${investigationPath.join(' → ')}`;
          db.run(
            `UPDATE datacheck SET ai_score=100, ai_result='SCAM', ai_confidence='HIGH', ai_evidence=?, ai_checked=1, ai_last_checked=datetime('now'), status='Scam' WHERE id=?`,
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

        let combinedDetails = personalDetails;
        if ((personalDetails === 'Yes' || personalDetails === 'Mention') && responseDetails) {
          combinedDetails = `${personalDetails} - ${responseDetails}`;
        }

        const aiResult = await verifyMessageWithAI(message, pageContent, officialLinks, combinedDetails, dateReceived);
        console.log('[Stage C] Scam Score:', aiResult.scam_score, '| Genuine Score:', aiResult.genuine_score, '| Result:', aiResult.result, '| Confidence:', aiResult.confidence);
        console.log('[Stage C] Scam Evidence:', aiResult.evidence);
        console.log('[Stage C] Genuine Evidence:', aiResult.genuine_evidence);
        investigationPath.push('AI Investigated');

        // ─── STAGE D: Determine status & save ─────────────────────────────────
        const scamScore = aiResult.scam_score;
        const genuineScore = aiResult.genuine_score || 0;
        let finalStatus = 'null'; // In Review by default

        // Branch 1: Genuine score dominates → auto-mark Genuine
        if (genuineScore > scamScore) {
          finalStatus = 'Genuine';
          investigationPath.push('Auto-marked Genuine');
          console.log('[Stage D] ✅ Genuine dominates — auto-marking Genuine. Score:', genuineScore, '>', scamScore);

          // Branch 2: High scam score → auto-mark Scam
        } else if (scamScore >= 80) {
          finalStatus = 'Scam';
          investigationPath.push('Auto-marked Scam');

          // Branch 3: Borderline scam → In Review + admin alert
        } else if (scamScore >= 60) {
          finalStatus = 'null'; // Keep as In Review
          investigationPath.push('Admin Notified');
        }
        // Branch 4: Low fake score, genuine not dominant → In Review (no action)

        // Build final evidence string — include both scores, genuine evidence, risk level, and guidance
        const riskPrefix = aiResult.risk_level ? `[${aiResult.risk_level.toUpperCase()}] ` : '';
        const guidanceSuffix = (aiResult.protective_guidance && aiResult.protective_guidance.length > 0)
          ? ` | Guidance: ${aiResult.protective_guidance.join('; ')}`
          : '';

        const finalEvidence = genuineScore > scamScore
          ? `${riskPrefix}GENUINE: ${aiResult.genuine_evidence} | Scam Score: ${scamScore} | Genuine Score: ${genuineScore}${guidanceSuffix} | Path: ${investigationPath.join(' → ')}`
          : `${riskPrefix}${aiResult.evidence} | Scam Score: ${scamScore} | Genuine Score: ${genuineScore}${guidanceSuffix} | Path: ${investigationPath.join(' → ')}`;

        // Save AI results to DB
        const guidanceStr = (aiResult.protective_guidance && aiResult.protective_guidance.length > 0)
          ? JSON.stringify(aiResult.protective_guidance)
          : null;

        db.run(
          `UPDATE datacheck SET ai_score=?, ai_result=?, ai_confidence=?, ai_evidence=?, genuine_evidence=?, risk_level=?, protective_guidance=?, is_expired=?, ai_checked=1, ai_last_checked=datetime('now') WHERE id=?`,
          [scamScore, aiResult.result, aiResult.confidence, finalEvidence, aiResult.genuine_evidence, aiResult.risk_level, guidanceStr, aiResult.is_expired ? 1 : 0, newId],
          (updateErr) => {
            if (updateErr) {
              console.error('[Stage D] DB update failed:', updateErr.message);
              return;
            }
            console.log('[Stage D] ✅ AI results saved for ID:', newId);

            // Auto-mark Genuine if genuine score dominates
            if (genuineScore > scamScore) {
              db.run(`UPDATE datacheck SET status = 'Genuine' WHERE id = ?`, [newId], (e) => {
                if (e) console.error('[Stage D] Auto-mark GENUINE failed:', e.message);
                else {
                  console.log('[Stage D] ✅ Auto-marked GENUINE for ID:', newId, '(genuine', genuineScore, '> scam', scamScore + ')');
                  if (notifyFlag && userEmail) {
                    sendUserNotification(userEmail, { id: newId, status: 'Genuine', ai_score: scamScore, ai_result: aiResult.result, ai_confidence: aiResult.confidence, ai_evidence: finalEvidence, genuine_evidence: aiResult.genuine_evidence, risk_level: aiResult.risk_level, protective_guidance: guidanceStr });
                  }
                }
              });
            }

            // Auto-mark Scam if score >= 80
            if (scamScore >= 80 && genuineScore <= scamScore) {
              db.run(`UPDATE datacheck SET status = 'Scam' WHERE id = ?`, [newId], (e) => {
                if (e) console.error('[Stage D] Auto-mark SCAM failed:', e.message);
                else {
                  console.log('[Stage D] ✅ Auto-marked SCAM (>=80) for ID:', newId);
                  if (notifyFlag && userEmail) {
                    sendUserNotification(userEmail, { id: newId, status: 'Scam', ai_score: scamScore, ai_result: aiResult.result, ai_confidence: aiResult.confidence, ai_evidence: finalEvidence, genuine_evidence: aiResult.genuine_evidence, risk_level: aiResult.risk_level, protective_guidance: guidanceStr });
                  }
                }
              });
            }

            // Send admin alert if scam score is 60-79 and not dominated by genuine score
            if (scamScore >= 60 && scamScore < 80 && genuineScore <= scamScore) {
              const alertResult = { ...aiResult, evidence: finalEvidence };
              sendAdminAlert(submissionData, alertResult, investigationPath.join(' → '))
                .then(() => console.log('[Stage D] ✅ Admin alert sent for ID:', newId))
                .catch(e => console.error('[Stage D] Admin alert failed:', e.message));
            }
          }
        );

        console.log('====== PIPELINE END: ID', newId, '| Scam:', scamScore, '| Genuine:', genuineScore, '| Status:', finalStatus, '======\n');


      } catch (error) {
        console.error('Pipeline failed for ID:', newId, '—', error.message);
      }
    });
  });
});

// Get all datacheck entries
app.get('/api/datas', (req, res) => {
  db.all('SELECT * FROM datacheck ORDER BY id DESC', (err, rows) => {
    if (err) return res.status(500).send(err.message);
    res.json(rows);
  });
});

app.get('/api/datas/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM datacheck WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).send(err.message);
    if (!row) return res.status(404).send('Not found');
    res.json(row);
  });
});

// Get all users
app.get('/api/users', (req, res) => {
  db.all('SELECT * FROM users', (err, rows) => {
    if (err) return res.status(500).send(err.message);
    res.json(rows);
  });
});

app.get('/api/admin/analytics', (req, res) => {
  const analytics = {};

  // 1. Role Distribution
  db.all('SELECT user_role, COUNT(*) as count FROM users GROUP BY user_role', (err, roleRows) => {
    if (err) return res.status(500).send(err.message);
    analytics.roles = roleRows;

    // 2. Unique College Tracking
    db.all('SELECT DISTINCT college_name FROM users WHERE college_name IS NOT NULL', (err, collegeRows) => {
      if (err) return res.status(500).send(err.message);
      analytics.colleges = collegeRows.map(c => c.college_name);
      analytics.uniqueCollegesCount = collegeRows.length;

      // 3. User Demographics (Year of Study)
      db.all('SELECT year_of_study, COUNT(*) as count FROM users GROUP BY year_of_study', (err, yearRows) => {
        if (err) return res.status(500).send(err.message);
        analytics.demographics = yearRows;

        // 4. Total User Count
        db.get('SELECT COUNT(*) as total FROM users', (err, countRow) => {
          if (err) return res.status(500).send(err.message);
          analytics.totalUsers = countRow.total;

          // 5. Workflow Tracking (Datacheck stats)
          db.all('SELECT status, ai_score, genuineRating FROM datacheck', (err, cases) => {
            if (err) return res.status(500).send(err.message);

            let totalInvestigations = cases.length;
            let pendingManual = 0;
            let completedManual = 0;
            let autoVerifications = 0;

            cases.forEach(c => {
              const status = (c.status || 'null').toLowerCase();
              if (status === 'null' || status === 'inreview') {
                pendingManual++;
              } else if (status === 'genuine' || status === 'scam') {
                // Determine if it was auto-marked based on our backend logic rules
                const scamScore = parseInt(c.ai_score) || 0;
                const genuineScore = parseInt(c.genuineRating) || 0;
                if ((genuineScore > scamScore) || (scamScore >= 80 && genuineScore <= scamScore)) {
                  autoVerifications++;
                } else {
                  completedManual++;
                }
              }
            });

            analytics.investigations = {
              total: totalInvestigations,
              pendingManual,
              completedManual,
              manualRequests: pendingManual + completedManual,
              autoVerifications
            };

            res.json(analytics);
          });
        });
      });
    });
  });
});

// Update user profile
app.post('/api/update-profile', (req, res) => {
  const { email, name, collegeName, role, yearOfStudy } = req.body;

  const sql = `
    UPDATE users 
    SET college_name = ?, user_role = ?, year_of_study = ?, is_profile_complete = 1, name = ?
    WHERE email = ?
  `;

  db.run(sql, [collegeName, role, yearOfStudy, name, email], function (err) {
    if (err) return res.status(500).send(err.message);
    res.json({ success: true });
  });
});

// Get user by email (for login check)
app.get('/api/users/:email', (req, res) => {
  const { email } = req.params;
  db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
    if (err) return res.status(500).send(err.message);
    res.json(row || null);
  });
});

// Upsert user (initial login)
app.post('/api/users/upsert', (req, res) => {
  const { email, name, collegeName, role, yearOfStudy } = req.body;

  db.get('SELECT id, is_profile_complete FROM users WHERE email = ?', [email], (err, row) => {
    if (err) return res.status(500).send(err.message);

    if (row) {
      // If user exists but has no profile (e.g. from older login flow), update them if new data provided
      if (row.is_profile_complete === 0 && collegeName && role) {
        db.run(
          'UPDATE users SET college_name = ?, user_role = ?, year_of_study = ?, is_profile_complete = 1 WHERE email = ?',
          [collegeName, role, yearOfStudy, email],
          (updateErr) => {
            if (updateErr) return res.status(500).send(updateErr.message);
            return res.json({ success: true, id: row.id });
          }
        );
      } else {
        return res.json({ success: true, id: row.id });
      }
    } else {
      // New user creation - now marks profile complete instantly since data is gathered at login
      // If missing data for some reason, we can still fall back to 0
      const isComplete = (collegeName && role) ? 1 : 0;

      db.run(
        'INSERT INTO users (email, name, college_name, user_role, year_of_study, is_profile_complete) VALUES (?, ?, ?, ?, ?, ?)',
        [email, name, collegeName, role, yearOfStudy, isComplete],
        function (insertErr) {
          if (insertErr) return res.status(500).send(insertErr.message);
          res.json({ success: true, id: this.lastID });
        }
      );
    }
  });
});

// Update status
app.put('/api/update-status/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const sql = `UPDATE datacheck SET status = ? WHERE id = ? `;
  db.run(sql, [status, id], function (err) {
    if (err) {
      console.error("❌ Error updating status:", err.message);
      return res.status(500).send(err.message);
    }
    console.log(`✅ Status updated for ID ${id} to ${status} `);

    // Fetch row to check if email notification is requested
    db.get(`SELECT * FROM datacheck WHERE id = ?`, [id], (fetchErr, row) => {
      if (!fetchErr && row && row.send_email_notification === 1 && row.user_email && (status === 'Scam' || status === 'Genuine')) {
        sendUserNotification(row.user_email, row);
      }
    });

    res.json({ success: true });
  });
});

// Enable Notification for In-Review submissions
app.put('/api/notify-request/:id', (req, res) => {
  const { id } = req.params;
  const sql = `UPDATE datacheck SET send_email_notification = 1 WHERE id = ?`;
  db.run(sql, [id], function (err) {
    if (err) {
      console.error("❌ Error updating notification request:", err.message);
      return res.status(500).send(err.message);
    }
    console.log(`✅ Notification enabled for ID ${id}`);
    res.json({ success: true });
  });
});

// Get User Stats for Dashboard
app.get('/api/user-stats/:email', (req, res) => {
  const { email } = req.params;

  const query = `
    SELECT 
      COUNT(id) as totalInvestigations,
      SUM(CASE WHEN (status = 'Scam' OR ai_result = 'Fake') THEN 1 ELSE 0 END) as scamsAvoided
    FROM datacheck 
    WHERE user_email = ?
  `;

  db.get(query, [email], (err, stats) => {
    if (err) return res.status(500).send(err.message);

    const recentQuery = `
      SELECT id, category, message, dateReceived, status, ai_result, risk_level, ai_score 
      FROM datacheck 
      WHERE user_email = ? 
      ORDER BY id DESC 
      LIMIT 5
    `;

    db.all(recentQuery, [email], (err2, recentActivity) => {
      if (err2) return res.status(500).send(err2.message);

      res.json({
        totalInvestigations: stats.totalInvestigations || 0,
        scamsAvoided: stats.scamsAvoided || 0,
        recentActivity: recentActivity || []
      });
    });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
