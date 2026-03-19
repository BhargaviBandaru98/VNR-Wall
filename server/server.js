require('dotenv').config();
const fs = require('fs');
const readline = require('readline');
if (!process.env.GROQ_API_KEY) {
  console.error("❌ CRITICAL: GROQ_API_KEY is missing from .env");
}
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const { extendSchema } = require('./database/extendSchema');
const { 
  verifyMessageWithAI, 
  extractPatternFromReason, 
  sendUserNotification: aiSendUserNotification,
  groq 
} = require('./services/aiVerificationService');
const { searchOfficialSite, extractCompanyName } = require('./services/searchService');
const { scrapeUrl } = require('./services/firecrawlService');
const { checkUrlSafety } = require('./services/webRiskService');
const { sendAdminAlert, sendUserNotification, verifyConnection } = require('./services/emailService');
// ─── Phase 1 & 3: MongoDB Parallel Setup + Dual-Write ───────────────────────
const mongoose = require('mongoose');
const { connectMongo, isMongoConnected } = require('./config/mongo');
const Submission = require('./models/Submission');
const User = require('./models/User');

// ─── Phase 4: Centralized Logger ─────────────────────────────────────────────
const logger = require('./utils/logger');

// USE_MONGO_PRIMARY is the master switch for Phase 5 cutover.
const USE_MONGO_PRIMARY = process.env.USE_MONGO_PRIMARY === 'true';

// shouldWriteToMongo() determines if a Mongo write should occur.
// - In shadow mode (primary=false), we write to Mongo for parity.
// - In primary mode, all writes go to Mongo.
function shouldWriteToMongo() {
  return isMongoConnected();
}

// isMongoPrimary() is used to switch READ operations and PRIMARY WRITE operations.
function isMongoPrimary() {
  return USE_MONGO_PRIMARY && isMongoConnected();
}

// ─── Phase 4: Global Unhandled Rejection Safety Net ──────────────────────────
process.on('unhandledRejection', (err) => {
  logger.logError('Unhandled Promise Rejection (non-fatal)', err);
});


console.log('[DIAGNOSTIC] Services loaded.');
const app = express();
const PORT = process.env.PORT || 6105;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:2999';

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

// Create users table (active fields only)
// Legacy columns (roll, branch, year, contact) may still exist in
// the live database but are not part of the current login/upsert flow.
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT
  )
`, (err) => {
  if (err) console.error("❌ Error creating users table:", err.message);
  else console.log("✅ Users table ready.");
});

// Create datacheck table (active forensic fields only)
// Legacy columns (name, roll, branch, year, contact, platform, sender,
// category, flags, responded, genuineRating) may still exist in
// the live database but are not part of the current submission flow.
db.run(`
  CREATE TABLE IF NOT EXISTS datacheck (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dateReceived TEXT,
    personalDetails TEXT,
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
    dateReceived,
    personalDetails,
    responseDetails,
    message,
    userEmail,
    send_email_notification
  } = req.body;

  const notifyFlag = send_email_notification ? 1 : 0;

  const sql = `
    INSERT INTO datacheck (
      dateReceived, personalDetails, response_details, message, status, user_email, send_email_notification
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    dateReceived, personalDetails, responseDetails, message, 'null', userEmail, notifyFlag
  ];

  const _pipelineStart = Date.now();
  const _sqliteInsertStart = Date.now();

  // ─── Primary Write Operation ──────────────────────────────────────────────
  if (isMongoPrimary()) {
    // MongoDB Primary Mode
    Submission.create({
      message:                 message,
      user_email:              userEmail || '',
      dateReceived:            dateReceived || '',
      personalDetails:         personalDetails || '',
      response_details:        responseDetails || '',
      status:                  'null',
      send_email_notification: notifyFlag === 1,
      notification_requested:  false,
    })
      .then((newSubmission) => {
        const _mongoInsertMs = Date.now() - _pipelineStart;
        logger.logDB('insert', 'mongo', 'success', { id: newSubmission._id, latencyMs: _mongoInsertMs });
        console.log("✅ Data inserted (Mongo Primary), ID:", newSubmission._id);
        
        // Respond with Mongo ID (stringified)
        res.json({ success: true, id: newSubmission._id });

        // Shadow Write to SQLite (for fallback/observability)
        db.run(sql, params, function (err) {
          if (err) {
             logger.logDB('insert', 'sqlite', 'failure', { error: err.message, shadow: true });
          } else {
             const sqliteId = this.lastID;
             // Link Mongo record to SQLite ID for backward-compatible background sync
             newSubmission.sqlite_id = sqliteId;
             newSubmission.save();
             logger.logDB('insert', 'sqlite', 'success', { id: sqliteId, shadow: true });
             startPipeline(sqliteId, newSubmission._id, message, personalDetails, responseDetails, dateReceived, notifyFlag, userEmail, _pipelineStart, 0, _mongoInsertMs);
          }
        });
      })
      .catch(err => {
        logger.logDB('insert', 'mongo', 'failure', { error: err.message });
        console.error("❌ MongoDB Insert Error:", err.message);
        res.status(500).send(err.message);
      });
  } else {
    // SQLite Primary Mode (Legacy)
    db.run(sql, params, function (err) {
      const _sqliteInsertMs = Date.now() - _sqliteInsertStart;
      if (err) {
        logger.logDB('insert', 'sqlite', 'failure', { error: err.message, latencyMs: _sqliteInsertMs });
        console.error("❌ DB Insert Error:", err.message);
        return res.status(500).send(err.message);
      }
      const newId = this.lastID;
      logger.logDB('insert', 'sqlite', 'success', { id: newId, latencyMs: _sqliteInsertMs });
      console.log("✅ Data inserted, ID:", newId);

      let _mongoInsertMs = 0;
      if (shouldWriteToMongo()) {
        const _mongoInsertStart = Date.now();
        Submission.create({
          sqlite_id:               newId,
          message:                 message,
          user_email:              userEmail || '',
          dateReceived:            dateReceived || '',
          personalDetails:         personalDetails || '',
          response_details:        responseDetails || '',
          status:                  'null',
          send_email_notification: notifyFlag === 1,
          notification_requested:  false,
        })
          .then(() => {
            _mongoInsertMs = Date.now() - _mongoInsertStart;
            logger.logDB('insert', 'mongo', 'success', { sqlite_id: newId, latencyMs: _mongoInsertMs });
          })
          .catch(err => {
            _mongoInsertMs = Date.now() - _mongoInsertStart;
            logger.logDB('insert', 'mongo', 'failure', { sqlite_id: newId, error: err.message, latencyMs: _mongoInsertMs });
            console.error('[Mongo] Initial insert failed (non-fatal):', err.message);
          });
      }

      // Send response immediately
      res.json({ success: true, id: newId });
      startPipeline(newId, null, message, personalDetails, responseDetails, dateReceived, notifyFlag, userEmail, _pipelineStart, _sqliteInsertMs, _mongoInsertMs);
    });
  }

    // Triple-Layer Defense Pipeline — runs after response, never blocks the request
    function startPipeline(sqliteId, mongoId, message, personalDetails, responseDetails, dateReceived, notifyFlag, userEmail, _pipelineStart, _sqliteInsertMs, _mongoInsertMs) {
      setImmediate(async () => {
      // Track aggregate times for Phase 4 Step 6
      let aggregateSqliteMs = _sqliteInsertMs;
      let aggregateMongoMs  = _mongoInsertMs; 
      try {
        console.log('\n====== PIPELINE START: ID', sqliteId || mongoId, '======');
        const submissionData = { id: sqliteId || mongoId, message };

        // ─── Phase 2.7: Skip AI if admin already verified this submission ─────────
        const existingSubmission = await new Promise((resolve) => {
          db.get(`SELECT submission_status FROM datacheck WHERE id = ?`, [sqliteId || mongoId], (err, row) => {
            resolve(err ? null : row);
          });
        });

        if (existingSubmission?.submission_status === 'ADMIN_VERIFIED') {
          console.log('[Pipeline] ⚠️  Submission', sqliteId || mongoId, 'is ADMIN_VERIFIED — skipping AI re-verification.');
          return;
        }

        // ─── Phase 6d: Deduplication (Cache) Layer ─────────────────────────────────
        console.log('[Deduplication] Checking for existing identical message...');
        const duplicateCheckSql = `
          SELECT id, status, ai_score, ai_result, ai_confidence, ai_evidence, genuine_evidence, risk_level, protective_guidance, is_expired
          FROM datacheck 
          WHERE message = ? AND ai_checked = 1 AND id != ?
          LIMIT 1
        `;

        const existingResult = await new Promise((resolve) => {
          db.get(duplicateCheckSql, [message, sqliteId || mongoId], (err, row) => {
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
              `UPDATE datacheck SET status = ?, ai_score = ?, ai_result = ?, ai_confidence = ?, ai_evidence = ?, genuine_evidence = ?, risk_level = ?, protective_guidance = ?, is_expired = ?, ai_checked = 1, ai_last_checked = datetime('now'), marked_by = 'auto' WHERE id = ?`,
              [
                existingResult.status, existingResult.ai_score, existingResult.ai_result,
                existingResult.ai_confidence, cachedEvidence, existingResult.genuine_evidence,
                existingResult.risk_level, existingResult.protective_guidance, existingResult.is_expired, sqliteId || mongoId
              ],
              (err) => {
                if (err) console.error('[Deduplication] Cache update failed:', err.message);
                resolve();
              }
            );
          });

          console.log('====== PIPELINE END (CACHED): ID', sqliteId || mongoId, '======\n');
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
            `UPDATE datacheck SET ai_score=100, ai_result='SCAM', ai_confidence='HIGH', ai_evidence=?, ai_checked=1, ai_last_checked=datetime('now'), status='Scam', marked_by='auto' WHERE id=?`,
            [evidence, sqliteId || mongoId],
            (e) => e ? console.error('[Stage 0] DB update failed:', e.message) : console.log('[Stage 0] ✅ Blocked & saved for ID:', sqliteId || mongoId)
          );
          console.log('====== PIPELINE END (WEB RISK BLOCK): ID', sqliteId || mongoId, '======\n');
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

        // ─── STAGE B.5: Intelligence Gathering (Phases 7, 8 & 9) ───────────────
        console.log('[Stage B.5] Fetching intelligence context...');
        
        const [learningRules, campaignContext] = await Promise.all([
          // 1. Fetch active rules (Phase 7)
          new Promise(resolve => {
            db.all(`SELECT * FROM agent_learning_rules WHERE is_active = 1 ORDER BY created_at DESC LIMIT 20`, (err, rows) => resolve(rows || []));
          }),
          // 2. Campaign Detection (Phase 9)
          new Promise(resolve => {
            const upiMatch = message.match(/[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/g) || [];
            const phoneMatch = message.match(/(\+?\d{1,4}[\s-])?\d{10}/g) || [];
            const urlMatches = message.match(/https?:\/\/[^\s"'<>()\[\],]+/gi) || [];
            const indicators = [...new Set([...upiMatch, ...phoneMatch, ...urlMatches])];

            if (indicators.length === 0) return resolve({ matchFound: false, indicators: [] });

            const placeholders = indicators.map(() => 'message LIKE ?').join(' OR ');
            const params = indicators.map(ind => `%${ind}%`);
            
            db.all(`SELECT id, status, message FROM datacheck WHERE id != ? AND (${placeholders}) LIMIT 10`, [sqliteId || mongoId, ...params], (err, rows) => {
              if (err || !rows || rows.length === 0) return resolve({ matchFound: false, indicators: [] });
              
              const matchedValues = indicators.filter(ind => rows.some(r => r.message.includes(ind)));
              const scamMatches = rows.filter(r => r.status === 'Scam' || r.ai_result === 'SCAM');
              
              resolve({
                matchFound: matchedValues.length > 0,
                reason: scamMatches.length > 0 ? 'Indicator matched previous SCAM submissions.' : 'Repeated activity detected across multiple submissions.',
                indicators: matchedValues
              });
            });
          })
        ]);

        // Phase 8: Scoring Reinforcement — Explicit Pattern Matching
        const matchedLearningRules = (learningRules || []).filter(r => 
          r.pattern && message.toLowerCase().includes(r.pattern.toLowerCase())
        );
        if (matchedLearningRules.length > 0) {
          campaignContext.matchFound = true;
          campaignContext.reason = (campaignContext.reason || '') + ` | Matched Admin Rule: ${matchedLearningRules[0].pattern}`;
          campaignContext.indicators = campaignContext.indicators || [];
          campaignContext.indicators.push(`LEARNED_RULE:${matchedLearningRules[0].pattern}`);
        }

        // ─── STAGE C: Groq AI with all evidence ───────────────────────────────
        console.log('[Stage C] Groq AI with augmented intelligence...');

        let combinedDetails = personalDetails;
        if ((personalDetails === 'Yes' || personalDetails === 'Mention') && responseDetails) {
          combinedDetails = `${personalDetails} - ${responseDetails}`;
        }

        const aiResult = await verifyMessageWithAI(message, pageContent, officialLinks, combinedDetails, dateReceived, learningRules, campaignContext);
        console.log('[Stage C] Scam Score:', aiResult.scam_score, '| Genuine Score:', aiResult.genuine_score, '| Result:', aiResult.result, '| Confidence:', aiResult.confidence);
        console.log('[Stage C] Evidence:', aiResult.evidence);
        
        investigationPath.push('AI Investigated');
        if (campaignContext.matchFound) investigationPath.push('Learning Reinforced');

        // ─── STAGE D: Determine status & save ─────────────────────────────────
        const scamScore = aiResult.scam_score;
        const genuineScore = aiResult.genuine_score || 0;
        let finalStatus = 'null';

        if (genuineScore > scamScore) {
          finalStatus = 'Genuine';
          investigationPath.push('Auto-marked Genuine');
        } else if (scamScore >= 80) {
          finalStatus = 'Scam';
          investigationPath.push('Auto-marked Scam');
        } else if (scamScore >= 60) {
          investigationPath.push('Admin Review Triggered');
        }

        const riskPrefix = aiResult.risk_level ? `[${aiResult.risk_level.toUpperCase()}] ` : '';
        const guidanceSuffix = (aiResult.protective_guidance && aiResult.protective_guidance.length > 0)
          ? ` | Guidance: ${aiResult.protective_guidance.join('; ')}`
          : '';

        const finalEvidence = genuineScore > scamScore
          ? `${riskPrefix}GENUINE: ${aiResult.genuine_evidence} | Scam Score: ${scamScore} | Genuine Score: ${genuineScore}${guidanceSuffix} | Path: ${investigationPath.join(' → ')}`
          : `${riskPrefix}${aiResult.evidence} | Scam Score: ${scamScore} | Genuine Score: ${genuineScore}${guidanceSuffix} | Path: ${investigationPath.join(' → ')}`;
        const guidanceStr = (aiResult.protective_guidance && aiResult.protective_guidance.length > 0)
          ? JSON.stringify(aiResult.protective_guidance)
          : null;

        const submissionStatus = (genuineScore >= 70 || scamScore >= 70) ? 'AI_VERIFIED' : 'IN_REVIEW';

        const _aiUpdateStart = Date.now();
        db.run(
          `UPDATE datacheck
           SET ai_score=?, ai_result=?, ai_confidence=?, ai_evidence=?, genuine_evidence=?,
               risk_level=?, protective_guidance=?, is_expired=?,
               ai_checked=1, ai_last_checked=datetime('now'),
               genuine_score=?, submission_status=?,
               campaign_match=?, matched_pattern=?
           WHERE id=?`,
          [scamScore, aiResult.result, aiResult.confidence, finalEvidence, aiResult.genuine_evidence,
           aiResult.risk_level, guidanceStr, aiResult.is_expired ? 1 : 0,
           genuineScore, submissionStatus,
           campaignContext.matchFound ? 1 : 0,
           campaignContext.matchFound ? campaignContext.indicators.join(', ') : null,
           sqliteId || mongoId],
          async (updateErr) => {
            const _aiUpdateMs = Date.now() - _aiUpdateStart;
            if (updateErr) {
              logger.logDB('update', 'sqlite', 'failure', { id: sqliteId || mongoId, stage: 'D-AI', error: updateErr.message, latencyMs: _aiUpdateMs });
              console.error('[Stage D] DB update failed:', updateErr.message);
              return;
            }
            logger.logDB('update', 'sqlite', 'success', { id: sqliteId || mongoId, stage: 'D-AI', scamScore, genuineScore, latencyMs: _aiUpdateMs });
            aggregateSqliteMs += _aiUpdateMs;
            console.log('[Stage D] ✅ AI results saved for ID:', sqliteId || mongoId);

            // ─── Phase 3: MongoDB shadow/primary update — AI results (fail-safe) ─────
            if (shouldWriteToMongo()) {
              const matchedPatterns = campaignContext.matchFound ? (campaignContext.indicators || []) : [];
              const _mongoAiUpdateStart = Date.now();
              const updateData = {
                ai_result: {
                  scam_score:    scamScore,
                  genuine_score: genuineScore,
                  confidence:    aiResult.confidence   || '',
                  risk_level:    aiResult.risk_level   || '',
                  verdict:       aiResult.result       || aiResult.verdict || '',
                  is_expired:    aiResult.is_expired   ? true : false,
                  evidence_analysis:   Array.isArray(aiResult.evidence_analysis)   ? aiResult.evidence_analysis   : [],
                  protective_guidance: Array.isArray(aiResult.protective_guidance) ? aiResult.protective_guidance : [],
                  final_verdict: aiResult.final_verdict || '',
                },
                ai_score:          scamScore,
                genuine_score:     genuineScore,
                ai_confidence:     aiResult.confidence || '',
                risk_level:        aiResult.risk_level || '',
                is_expired:        aiResult.is_expired ? true : false,
                status:            finalStatus !== 'null' ? finalStatus : 'null',
                submission_status: submissionStatus,
                ai_checked:        true,
                campaign_match:    campaignContext.matchFound ? true : false,
                matched_pattern:   matchedPatterns,
              };

              // Decide which ID to use for the update
              const query = mongoId ? { _id: mongoId } : { sqlite_id: sqliteId };

              await Submission.findOneAndUpdate(query, updateData)
                .then(() => {
                  const ms = Date.now() - _mongoAiUpdateStart;
                  aggregateMongoMs += ms;
                  logger.logDB('update', 'mongo', 'success', { id: mongoId || sqliteId, stage: 'D-AI', latencyMs: ms });
                })
                .catch(err => {
                  const ms = Date.now() - _mongoAiUpdateStart;
                  aggregateMongoMs += ms;
                  logger.logDB('update', 'mongo', 'failure', { id: mongoId || sqliteId, stage: 'D-AI', error: err.message, latencyMs: ms });
                  console.error('[Mongo] AI update failed (non-fatal):', err.message);
                });
            }

            // AUTO-VERIFICATION LOGIC
            if (genuineScore > scamScore) {
              db.run(`UPDATE datacheck SET status = 'Genuine', marked_by = 'auto' WHERE id = ?`, [sqliteId || mongoId], (e) => {
                if (!e && notifyFlag && userEmail) sendUserNotification(userEmail, { id: sqliteId || mongoId, status: 'Genuine', ...aiResult, ai_evidence: finalEvidence });
              });
            }

            if (scamScore >= 80 && genuineScore <= scamScore) {
              db.run(`UPDATE datacheck SET status = 'Scam', marked_by = 'auto' WHERE id = ?`, [sqliteId || mongoId], (e) => {
                if (!e && notifyFlag && userEmail) sendUserNotification(userEmail, { id: sqliteId || mongoId, status: 'Scam', ...aiResult, ai_evidence: finalEvidence });
              });
            }

            if (scamScore >= 60 && scamScore < 80 && genuineScore <= scamScore) {
              sendAdminAlert(submissionData, { ...aiResult, evidence: finalEvidence }, investigationPath.join(' → '))
                .catch(e => console.error('[Stage D] Admin alert failed:', e.message));
            }

            console.log('====== PIPELINE END: ID', sqliteId || mongoId, '| Scam:', scamScore, '| Genuine:', genuineScore, '| Status:', finalStatus, '======\n');

            // Phase 4 Step 6 — PERFORMANCE + LATENCY TRACKING (Logging at the absolute end of all DB ops)
            const totalPipelineTime = Date.now() - _pipelineStart;
            logger.logInfo('Pipeline Performance Summary', {
              service: "verification",
              sqliteTime: `${aggregateSqliteMs}ms`,
              mongoTime: `${aggregateMongoMs || 'N/A'}ms`,
              aiTime: `${aiResult.latencyMs || 0}ms`,
              totalTime: `${totalPipelineTime}ms`
            });
          }
        );


      } catch (error) {
        console.error('Pipeline failed for ID:', sqliteId || mongoId, '—', error.message);
      }
    });
  }
});

// Get all datacheck entries
app.get('/api/datas', async (req, res) => {
  if (isMongoPrimary()) {
    try {
      const submissions = await Submission.find().sort({ createdAt: -1 }).lean();
      return res.json(submissions);
    } catch (err) {
      logger.logError('Mongo Read Error (api/datas)', err);
      // Fallback logic could go here if needed, but for now just return error
    }
  }
  db.all('SELECT * FROM datacheck ORDER BY id DESC', (err, rows) => {
    if (err) return res.status(500).send(err.message);
    res.json(rows);
  });
});

app.get('/api/datas/:id', async (req, res) => {
  const { id } = req.params;
  if (isMongoPrimary()) {
    try {
      // Find by Mongo ID first, or sqlite_id if numeric
      const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { sqlite_id: Number(id) };
      const submission = await Submission.findOne(query).lean();
      if (submission) return res.json(submission);
    } catch (err) {
      logger.logError('Mongo Read Error (api/datas/:id)', err);
    }
  }
  db.get('SELECT * FROM datacheck WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).send(err.message);
    if (!row) return res.status(404).send('Not found');
    res.json(row);
  });
});

// ─── Phase 3: Admin Review Panel Endpoints ─────────────────────────────────────

// Get all submissions pending manual review
app.get('/api/admin/in-review', async (req, res) => {
  if (isMongoPrimary()) {
    try {
      const submissions = await Submission.find({
        submission_status: 'IN_REVIEW',
        verified_by_admin: { $ne: true }
      }).sort({ createdAt: -1 }).lean();
      return res.json(submissions);
    } catch (err) {
      logger.logError('Mongo Read Error (api/admin/in-review)', err);
    }
  }
  const sql = `
    SELECT * FROM datacheck 
    WHERE submission_status = 'IN_REVIEW' 
    AND (verified_by_admin IS NULL OR verified_by_admin = 0)
    ORDER BY id DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('❌ Error fetching in-review data:', err.message);
      return res.status(500).send(err.message);
    }
    res.json(rows);
  });
});

// Submit admin verdict (Phase 3 & 4)
app.post('/api/admin/verify-submission', async (req, res) => {
  const { id, verdict, reason } = req.body;

  if (!id || !verdict) {
    return res.status(400).json({ error: 'Missing id or verdict' });
  }

  const finalResult = verdict.toUpperCase(); // SCAM or GENUINE
  const adminReason = reason || null;
  const timestamp = new Date().toISOString();
  const displayStatus = finalResult === 'SCAM' ? 'Scam' : 'Genuine';

  const updateFields = {
    final_result:           finalResult,
    admin_reason:           adminReason,
    verified_by_admin:      true,
    verification_timestamp: new Date(timestamp),
    submission_status:      'ADMIN_VERIFIED',
    status:                 displayStatus,
  };

  // ─── Primary Operation ────────────────────────────────────────────────────
  if (isMongoPrimary()) {
    try {
      const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { sqlite_id: Number(id) };
      const updated = await Submission.findOneAndUpdate(query, updateFields, { new: true }).lean();
      
      if (!updated) return res.status(404).json({ error: 'Submission not found' });
      
      logger.logDB('update', 'mongo', 'success', { id, stage: 'admin-verify' });
      res.json({ success: true, message: `Submission ${id} marked as ${finalResult}` });

      // Shadow Update to SQLite
      if (updated.sqlite_id) {
         const sqliteUpdateSql = `UPDATE datacheck SET final_result=?, admin_reason=?, verified_by_admin=1, verification_timestamp=?, submission_status='ADMIN_VERIFIED', status=? WHERE id=?`;
         db.run(sqliteUpdateSql, [finalResult, adminReason, timestamp, displayStatus, updated.sqlite_id]);
      }

      // Notification logic (extracted or repeated)
      if (updated.send_email_notification || updated.notification_requested) {
        if (updated.user_email) {
          const notificationData = { ...updated, ai_evidence: adminReason ? `Admin Feedback: ${adminReason}` : updated.ai_result?.evidence_analysis?.[0]?.text };
          sendUserNotification(updated.user_email, notificationData).catch(e => logger.logError('Notification failed', e));
        }
      }
    } catch (err) {
      logger.logError('Mongo Admin Verify Error', err);
      return res.status(500).json({ error: err.message });
    }
  } else {
    // SQLite Primary Mode
    const updateSql = `
      UPDATE datacheck 
      SET final_result = ?, 
          admin_reason = ?, 
          verified_by_admin = 1, 
          verification_timestamp = ?, 
          submission_status = 'ADMIN_VERIFIED',
          status = ?
      WHERE id = ?
    `;

    db.run(updateSql, [finalResult, adminReason, timestamp, displayStatus, id], function (err) {
      if (err) {
        console.error('❌ Error updating admin verification:', err.message);
        return res.status(500).send(err.message);
      }

      console.log(`✅ Admin verified ID ${id} as ${finalResult}. Reason: ${adminReason || 'None'}`);

      // Trigger user notification if requested
      db.get('SELECT * FROM datacheck WHERE id = ?', [id], (err, row) => {
        if (!err && row && (row.send_email_notification || row.notification_requested)) {
          if (row.user_email) {
            const notificationData = {
              ...row,
              status: displayStatus,
              ai_evidence: adminReason ? `Admin Feedback: ${adminReason}` : row.ai_evidence,
              genuine_evidence: adminReason ? `Admin Feedback: ${adminReason}` : row.genuine_evidence
            };
            sendUserNotification(row.user_email, notificationData).catch(e => console.error(`[Admin] Notification failed: ${e.message}`));
          }
        }
      });

      res.json({ success: true, message: `Submission ${id} marked as ${finalResult}` });

      // Shadow MongoDB Update
      if (shouldWriteToMongo()) {
        const _mongoAdminStart = Date.now();
        Submission.findOneAndUpdate({ sqlite_id: Number(id) }, updateFields)
          .then(() => logger.logDB('update', 'mongo', 'success', { sqlite_id: Number(id), stage: 'admin-verify', latencyMs: Date.now() - _mongoAdminStart }))
          .catch(err => logger.logDB('update', 'mongo', 'failure', { sqlite_id: Number(id), error: err.message }));
      }
    });
  }

  // Common: Agent Learning (can be backgrounded)
  if (adminReason) {
    extractPatternFromReason(adminReason)
      .then(pattern => {
        if (pattern) {
          const learningSql = `INSERT INTO agent_learning_rules (submission_id, pattern, admin_decision, admin_reason, created_at, is_active) VALUES (?, ?, ?, ?, ?, 1)`;
          db.run(learningSql, [id, pattern, finalResult, adminReason, timestamp]);
          
          if (isMongoConnected()) {
             const LearningRule = require('./models/LearningRule');
             LearningRule.create({ submission_id: String(id), pattern, admin_decision: finalResult, admin_reason: adminReason });
          }
        }
      }).catch(e => console.error('❌ Pattern extraction error:', e.message));
  }
});

// ─── Phase 6: Learning Rule Management ─────────────────────────────────────────

// List all learning rules
app.get('/api/admin/learning-rules', async (req, res) => {
  if (isMongoPrimary()) {
    try {
      const LearningRule = require('./models/LearningRule');
      const rules = await LearningRule.find().sort({ createdAt: -1 }).lean();
      return res.json(rules);
    } catch (err) {
      logger.logError('Mongo Read Error (api/admin/learning-rules)', err);
    }
  }
  db.all('SELECT * FROM agent_learning_rules ORDER BY id DESC', (err, rows) => {
    if (err) return res.status(500).send(err.message);
    res.json(rows);
  });
});

// Toggle rule activity
app.put('/api/admin/learning-rules/:id/toggle', async (req, res) => {
  const { id } = req.params;
  if (isMongoPrimary()) {
    try {
      const LearningRule = require('./models/LearningRule');
      const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { submission_id: String(id) };
      const rule = await LearningRule.findOne(query);
      if (rule) {
        rule.is_active = !rule.is_active;
        await rule.save();
        // Shadow SQLite
        db.run('UPDATE agent_learning_rules SET is_active = 1 - is_active WHERE id = ?', [id]);
        return res.json({ success: true });
      }
    } catch (err) {
      logger.logError('Mongo Toggle Error', err);
    }
  }
  db.run('UPDATE agent_learning_rules SET is_active = 1 - is_active WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).send(err.message);
    res.json({ success: true });
  });
});

// Delete rule
app.delete('/api/admin/learning-rules/:id', async (req, res) => {
  const { id } = req.params;
  if (isMongoPrimary()) {
    try {
      const LearningRule = require('./models/LearningRule');
      const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { submission_id: String(id) };
      await LearningRule.deleteOne(query);
      // Shadow SQLite
      db.run('DELETE FROM agent_learning_rules WHERE id = ?', [id]);
      return res.json({ success: true });
    } catch (err) {
      logger.logError('Mongo Delete Error', err);
    }
  }
  db.run('DELETE FROM agent_learning_rules WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).send(err.message);
    res.json({ success: true });
  });
});

// Get all users
app.get('/api/users', async (req, res) => {
  if (isMongoPrimary()) {
    try {
      const users = await User.find().sort({ createdAt: -1 }).lean();
      return res.json(users);
    } catch (err) {
      logger.logError('Mongo Read Error (api/users)', err);
    }
  }
  db.all('SELECT * FROM users', (err, rows) => {
    if (err) return res.status(500).send(err.message);
    res.json(rows);
  });
});

app.get('/api/admin/analytics', async (req, res) => {
  if (isMongoPrimary()) {
    try {
      const [roleDist, uniqueColleges, yearDist, totalUsers, cases] = await Promise.all([
        // 1. Role Distribution
        User.aggregate([{ $group: { _id: "$user_role", count: { $sum: 1 } } }]),
        // 2. Unique Colleges
        User.distinct("college_name", { college_name: { $ne: null } }),
        // 3. Year of Study Dist
        User.aggregate([{ $group: { _id: "$year_of_study", count: { $sum: 1 } } }]),
        // 4. Total User Count
        User.countDocuments(),
        // 5. Workflow Tracking
        Submission.find({}, 'status marked_by').lean()
      ]);

      const analytics = {
        roles: roleDist.map(r => ({ user_role: r._id, count: r.count })),
        colleges: uniqueColleges,
        uniqueCollegesCount: uniqueColleges.length,
        demographics: yearDist.map(y => ({ year_of_study: y._id, count: y.count })),
        totalUsers: totalUsers,
        investigations: {
          total: cases.length,
          pendingManual: 0,
          completedManual: 0,
          manualRequests: 0,
          autoVerifications: 0
        }
      };

      cases.forEach(c => {
        const status = (c.status || 'null').toLowerCase();
        if (status === 'null' || status === 'inreview') {
          analytics.investigations.pendingManual++;
        } else if (status === 'genuine' || status === 'scam') {
          if (c.marked_by === 'admin') {
            analytics.investigations.completedManual++;
          } else {
            analytics.investigations.autoVerifications++;
          }
        }
      });
      analytics.investigations.manualRequests = analytics.investigations.pendingManual + analytics.investigations.completedManual;

      return res.json(analytics);
    } catch (err) {
      logger.logError('Mongo Analytics Error', err);
    }
  }

  const analytics = {};
  db.all('SELECT user_role, COUNT(*) as count FROM users GROUP BY user_role', (err, roleRows) => {
    if (err) return res.status(500).send(err.message);
    analytics.roles = roleRows;

    db.all('SELECT DISTINCT college_name FROM users WHERE college_name IS NOT NULL', (err, collegeRows) => {
      if (err) return res.status(500).send(err.message);
      analytics.colleges = collegeRows.map(c => c.college_name);
      analytics.uniqueCollegesCount = collegeRows.length;

      db.all('SELECT year_of_study, COUNT(*) as count FROM users GROUP BY year_of_study', (err, yearRows) => {
        if (err) return res.status(500).send(err.message);
        analytics.demographics = yearRows;

        db.get('SELECT COUNT(*) as total FROM users', (err, countRow) => {
          if (err) return res.status(500).send(err.message);
          analytics.totalUsers = countRow.total;

          db.all('SELECT status, marked_by FROM datacheck', (err, cases) => {
            if (err) return res.status(500).send(err.message);
            let totalInvestigations = cases.length;
            let pendingManual = 0;
            let completedManual = 0;
            let autoVerifications = 0;

            cases.forEach(c => {
              const status = (c.status || 'null').toLowerCase();
              if (status === 'null' || status === 'inreview') pendingManual++;
              else if (status === 'genuine' || status === 'scam') {
                if (c.marked_by === 'admin') completedManual++;
                else autoVerifications++;
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
app.post('/api/update-profile', async (req, res) => {
  const { email, name, collegeName, role, yearOfStudy } = req.body;

  if (isMongoPrimary() || isMongoConnected()) {
    try {
      await User.findOneAndUpdate(
        { email: email.toLowerCase().trim() },
        { name, college_name: collegeName, user_role: role, year_of_study: yearOfStudy, is_profile_complete: true },
        { upsert: true }
      );
      if (isMongoPrimary()) return res.json({ success: true });
    } catch (err) {
      logger.logError('Mongo Update Profile Error', err);
      if (isMongoPrimary()) return res.status(500).send(err.message);
    }
  }

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
app.get('/api/users/:email', async (req, res) => {
  const { email } = req.params;
  if (isMongoPrimary()) {
    try {
      const user = await User.findOne({ email: email.toLowerCase().trim() }).lean();
      return res.json(user || null);
    } catch (err) {
      logger.logError('Mongo Get User Error', err);
    }
  }
  db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
    if (err) return res.status(500).send(err.message);
    res.json(row || null);
  });
});

// Upsert user (initial login)
app.post('/api/users/upsert', async (req, res) => {
  const { email, name, collegeName, role, yearOfStudy } = req.body;
  const normalizedEmail = email.toLowerCase().trim();

  if (isMongoPrimary() || isMongoConnected()) {
    try {
      const isComplete = (collegeName && role) ? true : false;
      const user = await User.findOneAndUpdate(
        { email: normalizedEmail },
        { name, college_name: collegeName, user_role: role, year_of_study: yearOfStudy, is_profile_complete: isComplete },
        { upsert: true, new: true }
      );
      if (isMongoPrimary()) return res.json({ success: true, id: user._id });
    } catch (err) {
      logger.logError('Mongo Upsert User Error', err);
      if (isMongoPrimary()) return res.status(500).send(err.message);
    }
  }

  db.get('SELECT id, is_profile_complete FROM users WHERE email = ?', [email], (err, row) => {
    if (err) return res.status(500).send(err.message);

    if (row) {
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
app.put('/api/update-status/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  // ─── Phase 5: MongoDB Primary Mode ───────────────────────────────────────
  if (isMongoPrimary()) {
    try {
      const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { sqlite_id: Number(id) };
      const updated = await Submission.findOneAndUpdate(
        query,
        { status, marked_by: 'admin' },
        { new: true }
      ).lean();

      if (!updated) return res.status(404).json({ error: 'Submission not found' });
      logger.logDB('update', 'mongo', 'success', { id, stage: 'update-status', status });

      // Shadow write to SQLite
      db.run(`UPDATE datacheck SET status = ?, marked_by = 'admin' WHERE id = ?`, [status, updated.sqlite_id || id]);

      // Email notification if applicable
      if (updated.send_email_notification && updated.user_email && (status === 'Scam' || status === 'Genuine')) {
        sendUserNotification(updated.user_email, updated);
      }
      return res.json({ success: true });
    } catch (err) {
      logger.logError('Mongo Update Status Error', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // SQLite Fallback / Legacy Mode
  const sql = `UPDATE datacheck SET status = ?, marked_by = 'admin' WHERE id = ?`;
  db.run(sql, [status, id], function (err) {
    if (err) {
      console.error("❌ Error updating status:", err.message);
      return res.status(500).send(err.message);
    }
    console.log(`✅ Status updated for ID ${id} to ${status}`);

    db.get(`SELECT * FROM datacheck WHERE id = ?`, [id], (fetchErr, row) => {
      if (!fetchErr && row && row.send_email_notification === 1 && row.user_email && (status === 'Scam' || status === 'Genuine')) {
        sendUserNotification(row.user_email, row);
      }
    });

    // Shadow MongoDB update
    if (shouldWriteToMongo()) {
      Submission.findOneAndUpdate({ sqlite_id: Number(id) }, { status, marked_by: 'admin' })
        .then(() => logger.logDB('update', 'mongo', 'success', { sqlite_id: id, stage: 'update-status', shadow: true }))
        .catch(err => logger.logDB('update', 'mongo', 'failure', { sqlite_id: id, error: err.message, stage: 'update-status' }));
    }
    res.json({ success: true });
  });
});

// Enable Notification for In-Review submissions (Phase 2 + 2.7)
app.put('/api/notify-request/:id', async (req, res) => {
  const { id } = req.params;

  // ─── Phase 5: MongoDB Primary Mode ───────────────────────────────────────
  if (isMongoPrimary()) {
    try {
      const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { sqlite_id: Number(id) };
      const updated = await Submission.findOneAndUpdate(
        query,
        { send_email_notification: true, notification_requested: true },
        { new: true }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'Submission not found' });
      // Shadow SQLite
      if (updated.sqlite_id) {
        db.run(`UPDATE datacheck SET send_email_notification = 1, notification_requested = 1 WHERE id = ?`, [updated.sqlite_id]);
      }
      logger.logDB('update', 'mongo', 'success', { id, stage: 'notify-request' });
      return res.json({ success: true });
    } catch (err) {
      logger.logError('Mongo Notify Request Error', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // SQLite Fallback
  const sql = `UPDATE datacheck SET send_email_notification = 1, notification_requested = 1 WHERE id = ?`;
  db.run(sql, [id], function (err) {
    if (err) {
      console.error('❌ Error updating notification request:', err.message);
      return res.status(500).send(err.message);
    }
    console.log(`✅ Notification enabled for ID ${id}`);
    // Shadow MongoDB
    if (shouldWriteToMongo()) {
      Submission.findOneAndUpdate({ sqlite_id: Number(id) }, { send_email_notification: true, notification_requested: true })
        .catch(err => logger.logDB('update', 'mongo', 'failure', { sqlite_id: id, error: err.message, stage: 'notify-request' }));
    }
    res.json({ success: true });
  });
});

// Get User Stats for Dashboard
app.get('/api/user-stats/:email', async (req, res) => {
  const { email } = req.params;
  const normalizedEmail = email.toLowerCase().trim();

  if (isMongoPrimary()) {
    try {
      const stats = await Submission.aggregate([
        { $match: { user_email: normalizedEmail } },
        {
          $group: {
            _id: null,
            totalInvestigations: { $sum: 1 },
            scamsAvoided: {
              $sum: {
                $cond: [
                  { $or: [{ $eq: ["$status", "Scam"] }, { $eq: ["$ai_result.verdict", "SCAM"] }] },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]);

      const recentActivity = await Submission.find({ user_email: normalizedEmail })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      return res.json({
        totalInvestigations: stats[0]?.totalInvestigations || 0,
        scamsAvoided: stats[0]?.scamsAvoided || 0,
        recentActivity: recentActivity || []
      });
    } catch (err) {
      logger.logError('Mongo User Stats Error', err);
    }
  }

  const query = `
    SELECT 
      COUNT(id) as totalInvestigations,
      SUM(CASE WHEN (status = 'Scam' OR ai_result = 'Fake') THEN 1 ELSE 0 END) as scamsAvoided
    FROM datacheck 
    WHERE user_email = ?
  `;

  db.get(query, [normalizedEmail], (err, stats) => {
    if (err) return res.status(500).send(err.message);

    const recentQuery = `
      SELECT id, category, message, dateReceived, status, ai_result, risk_level, ai_score 
      FROM datacheck 
      WHERE user_email = ? 
      ORDER BY id DESC 
      LIMIT 5
    `;

    db.all(recentQuery, [normalizedEmail], (err2, recentActivity) => {
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

  // ─── Phase 4 Step 7: Log active DB architecture on startup ───────────────
  const mongoMode = process.env.USE_MONGO_PRIMARY === 'true' ? 'PRIMARY' : 'SHADOW';
  const modeLabel = mongoMode === 'PRIMARY'
    ? '🔴 Mongo PRIMARY mode — reads & writes served from MongoDB'
    : '🟡 Mongo SHADOW mode  — SQLite is source of truth, MongoDB is shadow-write only';
  console.log(`\n[Architecture] ${modeLabel}\n`);
  logger.logInfo('Server startup', { port: PORT, mongoMode, sqliteActive: true });

  // ─── Phase 1: MongoDB — non-blocking, fail-safe ──────────────────────────
  // connectMongo() is async and WILL NOT block the server or affect SQLite.
  // If MONGO_URI is not set or Mongo is down, server continues normally.
  connectMongo();
});


// ─── Phase 4: Debug / Observability Endpoints ────────────────────────────────
const { compareRecord } = require('./utils/dataConsistencyChecker');

// Step 5: Consistency Checker — verifies data parity for a single record (works in both primary modes)
app.get('/debug/consistency-check/:id', async (req, res) => {
  const { id } = req.params;

  // Support both Mongo ObjectId and legacy numeric SQLite IDs
  const isObjectId = mongoose.Types.ObjectId.isValid(id) && id.length === 24;
  const numericId  = isObjectId ? null : Number(id);

  if (!isObjectId && (!numericId || isNaN(numericId))) {
    return res.status(400).json({ error: 'Invalid ID — provide a numeric SQLite ID or a Mongo ObjectId' });
  }

  // 1. Fetch SQLite record (always useful for comparison even in Mongo-primary mode)
  const sqliteRecord = await new Promise((resolve) => {
    const sqlWhere = numericId ? `WHERE id = ?` : `WHERE id IS NOT NULL`;
    const sqlParam = numericId ? [numericId] : [];
    db.get(`SELECT * FROM datacheck ${sqlWhere}`, sqlParam, (err, row) => resolve(err ? null : row));
  });

  // 2. Fetch MongoDB record
  let mongoRecord = null;
  let mongoError  = null;
  try {
    if (!isMongoConnected()) throw new Error('MongoDB is not connected');

    const mongoQuery = isObjectId ? { _id: id } : { sqlite_id: numericId };
    mongoRecord = await Submission.findOne(mongoQuery).lean();
    logger.logInfo('[Debug] Consistency check: Mongo read success', { id, isMongoPrimary: isMongoPrimary() });
  } catch (err) {
    mongoError = err.message;
    logger.logError('[Debug] Consistency check: Mongo read failed', err);
  }

  if (!mongoRecord) {
    return res.status(404).json({
      error: `MongoDB record not found for id ${id}`,
      mongoError,
      sqlite: sqliteRecord,
      mongo: null,
      readSource: isMongoPrimary() ? 'mongo-primary (failed-to-fetch)' : 'sqlite-primary',
    });
  }

  // 3. Compare fields
  const { isConsistent, differences } = compareRecord(sqliteRecord || {}, mongoRecord);

  logger.logInfo('[Debug] Consistency check completed', { id, isConsistent, isMongoPrimary: isMongoPrimary() });

  res.json({
    id,
    isConsistent,
    differences,
    readSource: isMongoPrimary() ? 'mongo-primary' : 'sqlite-primary',
    sqlite: sqliteRecord,
    mongo:  mongoRecord,
  });
});

// Step 6 & 7: System Status Dashboard — reflects Mongo-primary architecture
app.get('/debug/system-status', async (req, res) => {
  const sqliteActive   = true; // SQLite always kept as fallback
  const mongoConnected = isMongoConnected();
  const mongoPrimary   = isMongoPrimary();

  // Pull last 5 errors from the log file
  const lastErrors = [];
  try {
    const logPath = path.join(__dirname, 'logs', 'system.log');
    if (fs.existsSync(logPath)) {
      const fileStream = fs.createReadStream(logPath);
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
      const allErrors = [];
      for await (const line of rl) {
        try {
          const entry = JSON.parse(line);
          if (entry.level === 'error') allErrors.push(entry);
        } catch (e) { /* skip malformed */ }
      }
      lastErrors.push(...allErrors.reverse().slice(0, 5));
    }
  } catch (err) {
    console.error('[Debug] Log parse failed:', err.message);
  }

  const aiStatus = process.env.GROQ_API_KEY ? 'configured' : 'missing key';

  // ─── Step 6 & 7: Fetch submission stats from MongoDB when it is primary ─────
  let total = 0, aiChecked = 0, writeSuccessRate = 'N/A';

  if (mongoPrimary && mongoConnected) {
    try {
      total = await Submission.countDocuments();
      aiChecked = await Submission.countDocuments({ ai_checked: true });
      writeSuccessRate = total > 0 ? `${Math.round((aiChecked / total) * 100)}%` : 'N/A';
      logger.logInfo('[Debug] System status: stats sourced from MongoDB', { total, aiChecked });
    } catch (err) {
      logger.logError('[Debug] System status: Mongo stat query failed, falling back to SQLite', err);
      // Intentional fallthrough to SQLite below
    }
  }

  // Fallback: fetch from SQLite (used in shadow-mode OR if Mongo stat query failed)
  if (total === 0 && !mongoPrimary) {
    const sqliteStats = await new Promise((resolve) => {
      db.get('SELECT COUNT(*) as total, SUM(ai_checked) as aiChecked FROM datacheck', (err, row) => {
        resolve(err ? { total: 0, aiChecked: 0 } : row);
      });
    });
    total     = sqliteStats.total || 0;
    aiChecked = sqliteStats.aiChecked || 0;
    writeSuccessRate = total > 0 ? `${Math.round((aiChecked / total) * 100)}%` : 'N/A';
  }

  logger.logInfo('[Debug] System status requested', {
    mongoConnected,
    mongoPrimary,
    aiStatus,
    writeSuccessRate,
    statsSource: mongoPrimary ? 'mongodb' : 'sqlite'
  });

  res.json({
    timestamp:           new Date().toISOString(),
    mongoConnected,
    sqliteActive,
    mongoPrimary,
    statsSource:         mongoPrimary ? 'mongodb' : 'sqlite',
    aiStatus,
    totalSubmissions:    total,
    aiChecked,
    writeSuccessRate,
    lastErrors,
    flags: {
      USE_MONGO_PRIMARY: process.env.USE_MONGO_PRIMARY === 'true',
    }
  });
});

