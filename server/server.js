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
  app.post('/api/dev/login', async (req, res) => {
    const { email } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    if (isMongoPrimary()) {
      try {
        const user = await User.findOne({ email: normalizedEmail }).lean();
        if (user) return res.json({ success: true, user: mapUser(user) });
      } catch (err) {
        logger.logError('Dev Login Mongo Error', err);
      }
    }

    db.get(`SELECT * FROM users WHERE email = ?`, [normalizedEmail], (err, row) => {
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
        // Track aggregate times
        let aggregateSqliteMs = _sqliteInsertMs;
        let aggregateMongoMs  = _mongoInsertMs; 

        try {
          console.log('\n====== PIPELINE START: ID', sqliteId || mongoId, '======');
          const existingSubmission = await (async () => {
            if (isMongoPrimary()) {
              const query = mongoId ? { _id: mongoId } : { sqlite_id: Number(sqliteId) };
              return await Submission.findOne(query).lean();
            }
            return new Promise((resolve) => {
              db.get(`SELECT submission_status FROM datacheck WHERE id = ?`, [sqliteId || mongoId], (err, row) => {
                resolve(err ? null : row);
              });
            });
          })();

        if (existingSubmission?.submission_status === 'ADMIN_VERIFIED') {
          console.log('[Pipeline] ⚠️  Submission', sqliteId || mongoId, 'is ADMIN_VERIFIED — skipping AI re-verification.');
          return;
        }

        // ─── Phase 6d: Deduplication (Cache) Layer ─────────────────────────────────
        console.log('[Deduplication] Checking for existing identical message...');
        const existingResult = await (async () => {
          if (isMongoPrimary()) {
            const duplicate = await Submission.findOne({ 
              message, 
              ai_checked: true, 
              _id: { $ne: mongoId } 
            }).lean();
            return duplicate;
          }
          return new Promise((resolve) => {
            const duplicateCheckSql = `
              SELECT id, status, ai_score, ai_result, ai_confidence, ai_evidence, genuine_evidence, risk_level, protective_guidance, is_expired
              FROM datacheck 
              WHERE message = ? AND ai_checked = 1 AND id != ?
              LIMIT 1
            `;
            db.get(duplicateCheckSql, [message, sqliteId || mongoId], (err, row) => {
              if (err) {
                console.error('[Deduplication] Error:', err.message);
                resolve(null);
              } else {
                resolve(row);
              }
            });
          });
        })();

        if (existingResult) {
          console.log('[Deduplication] ♻️  Matching message found. Using cached result.');
          const cachedEvidence = `[CACHED RESULT] ${existingResult.ai_evidence || (existingResult.ai_result ? existingResult.ai_result.evidence_analysis : 'Previous match detected.')}`;

          if (isMongoPrimary()) {
            await Submission.findOneAndUpdate(
              { _id: mongoId },
              {
                status: existingResult.status,
                ai_score: existingResult.ai_score,
                ai_result: existingResult.ai_result,
                ai_confidence: existingResult.ai_confidence,
                risk_level: existingResult.risk_level,
                is_expired: existingResult.is_expired,
                ai_checked: true,
                marked_by: 'auto'
              }
            );
          }
          
          await new Promise((resolve) => {
            db.run(
              `UPDATE datacheck SET status = ?, ai_score = ?, ai_result = ?, ai_confidence = ?, ai_evidence = ?, genuine_evidence = ?, risk_level = ?, protective_guidance = ?, is_expired = ?, ai_checked = 1, ai_last_checked = datetime('now'), marked_by = 'auto' WHERE id = ?`,
              [
                existingResult.status, existingResult.ai_score, JSON.stringify(existingResult.ai_result || {}),
                existingResult.ai_confidence, cachedEvidence, existingResult.genuine_evidence,
                existingResult.risk_level, JSON.stringify(existingResult.protective_guidance || []), existingResult.is_expired, sqliteId || mongoId
              ],
              (err) => {
                if (err) console.error('[Deduplication] Cache update failed:', err.message);
                resolve();
              }
            );
          });

          console.log('====== PIPELINE END (CACHED): ID', sqliteId || mongoId, '======\n');
          return;
        }

        let investigationPath = [];
        // ─── STAGE 0: Google Web Risk — Instant URL Block ─────────────────────
        console.log('[Stage 0] Google Web Risk check...');
        const webRisk = await checkUrlSafety(message);

        if (webRisk.isUnsafe) {
          investigationPath.push(`Web Risk BLOCKED (${webRisk.threatType})`);
          const evidence = `BLOCKED: URL flagged by Google Web Risk as ${webRisk.threatType}. URL: ${webRisk.url} | Investigation: ${investigationPath.join(' → ')}`;
          
          if (isMongoPrimary()) {
             await Submission.findOneAndUpdate({ _id: mongoId }, {
               status: 'Scam', ai_score: 100, ai_checked: true, marked_by: 'auto',
               'ai_result.verdict': 'SCAM', 'ai_result.risk_level': 'Critical'
             });
          }
          
          db.run(
            `UPDATE datacheck SET ai_score=100, ai_result='SCAM', ai_confidence='HIGH', ai_evidence=?, ai_checked=1, ai_last_checked=datetime('now'), status='Scam', marked_by='auto' WHERE id=?`,
            [evidence, sqliteId || mongoId],
            (e) => e ? console.error('[Stage 0] DB update failed:', e.message) : console.log('[Stage 0] ✅ Blocked & saved for ID:', sqliteId || mongoId)
          );
          console.log('====== PIPELINE END (WEB RISK BLOCK): ID', sqliteId || mongoId, '======\n');
          return;
        }

        investigationPath.push('Web Risk Pass');

        // ─── STAGE A: Extract company name ────────────────────────────────────
        console.log('[Stage A] Extracting company name...');
        const companyName = await extractCompanyName(message, groq);

        // ─── STAGE B: Serper + Firecrawl in parallel ──────────────────────────
        const [officialLinks, pageContent] = await Promise.all([
          companyName ? searchOfficialSite(companyName) : Promise.resolve([]),
          scrapeUrl(message),
        ]);

        // ─── STAGE B.5: Intelligence Gathering (Phases 7, 8 & 9) ───────────────
        console.log('[Stage B.5] Fetching intelligence context...');
        
        const [learningRules, campaignContext] = await Promise.all([
          // 1. Fetch active rules
          (async () => {
             if (isMongoPrimary()) return await LearningRule.find({ is_active: true }).sort({ createdAt: -1 }).limit(20).lean();
             return new Promise(res => db.all(`SELECT * FROM agent_learning_rules WHERE is_active = 1 ORDER BY created_at DESC LIMIT 20`, (err, rows) => res(rows || [])));
          })(),
          // 2. Campaign Detection
          (async () => {
             const upiMatch = message.match(/[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/g) || [];
             const phoneMatch = message.match(/(\+?\d{1,4}[\s-])?\d{10}/g) || [];
             const urlMatches = message.match(/https?:\/\/[^\s"'<>()\[\],]+/gi) || [];
             const indicators = [...new Set([...upiMatch, ...phoneMatch, ...urlMatches])];

             if (indicators.length === 0) return { matchFound: false, indicators: [] };

             if (isMongoPrimary()) {
                const rows = await Submission.find({
                  _id: { $ne: mongoId },
                  $or: indicators.map(ind => ({ message: { $regex: ind, $options: 'i' } }))
                }).limit(10).lean();
                if (!rows || rows.length === 0) return { matchFound: false, indicators: [] };
                const scamMatches = rows.filter(r => r.status === 'Scam' || (r.ai_result && r.ai_result.verdict === 'SCAM'));
                return { matchFound: true, reason: scamMatches.length > 0 ? 'Indicator matched previous SCAM submissions.' : 'Repeated activity detected.', indicators };
             }
             return new Promise(resolve => {
                const placeholders = indicators.map(() => 'message LIKE ?').join(' OR ');
                const params = indicators.map(ind => `%${ind}%`);
                db.all(`SELECT id, status, message FROM datacheck WHERE id != ? AND (${placeholders}) LIMIT 10`, [sqliteId || mongoId, ...params], (err, rows) => {
                  if (err || !rows || rows.length === 0) return resolve({ matchFound: false, indicators: [] });
                  const scamMatches = rows.filter(r => r.status === 'Scam' || r.ai_result === 'SCAM');
                  resolve({ matchFound: true, reason: scamMatches.length > 0 ? 'Indicator matched previous SCAM submissions.' : 'Repeated activity detected.', indicators });
                });
             });
          })()
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

        let aiResult = null;
        let finalStatus = 'null';
        let submissionStatus = 'IN_REVIEW';
        let aiChecked = false;
        let markedBy = undefined;
        let scamScore = 0;
        let genuineScore = 0;
        let confidence = '';
        let riskLevel = '';
        let isExpired = false;
        let finalEvidence = '';
        let genuineEvidenceStr = '';
        let guidanceStr = null;
        let matchedPatterns = [];
        let scamScoreNum = 0;

        try {
            aiResult = await verifyMessageWithAI(message, pageContent, officialLinks, combinedDetails, dateReceived, learningRules, campaignContext);
            console.log('[Stage C] Scam Score:', aiResult.scam_score, '| Genuine Score:', aiResult.genuine_score, '| Verdict:', aiResult.verdict, '| Confidence:', aiResult.confidence);
            
            investigationPath.push('AI Investigated');
            if (campaignContext.matchFound) investigationPath.push('Learning Reinforced');

            // ─── STAGE D: Determine status & save ─────────────────────────────────
            scamScore = aiResult.scam_score;
            genuineScore = aiResult.genuine_score;
            confidence = aiResult.confidence;
            riskLevel = aiResult.risk_level;
            isExpired = aiResult.is_expired;
            scamScoreNum = Number(scamScore) || 0;

            // Strict adherence to AI verdict mapping
            if (aiResult.verdict === 'GENUINE') {
                finalStatus = 'Genuine';
                investigationPath.push('Auto-marked Genuine');
            } else if (aiResult.verdict === 'SCAM') {
                finalStatus = 'Scam';
                investigationPath.push('Auto-marked Scam');
            } else if (aiResult.verdict === 'SUSPICIOUS') {
                investigationPath.push('Admin Review Triggered (Suspicious)');
            } else {
                investigationPath.push('Admin Review Triggered (Unknown Verdict)');
            }

            const riskPrefix = riskLevel ? `[${riskLevel.toUpperCase()}] ` : '';
            const guidanceSuffix = (aiResult.protective_guidance && aiResult.protective_guidance.length > 0)
              ? ` | Guidance: ${aiResult.protective_guidance.join('; ')}`
              : '';

            // Format evidence for legacy sqlite compatibility if needed, but strictly from AI provided data
            const primaryEvidence = (aiResult.evidence_analysis && aiResult.evidence_analysis.length > 0) 
              ? aiResult.evidence_analysis.map(e => e.text).join(' ') 
              : 'No technical evidence provided.';
              
            finalEvidence = `${riskPrefix}${primaryEvidence} | Scam Score: ${scamScore} | Genuine Score: ${genuineScore}${guidanceSuffix} | Path: ${investigationPath.join(' → ')}`;
            
            // Only populate genuine_evidence fallback if explicitly GENUINE to match old contract, but using primary evidence text
            if(aiResult.verdict === 'GENUINE') {
                genuineEvidenceStr = primaryEvidence;
            }

            guidanceStr = (aiResult.protective_guidance && aiResult.protective_guidance.length > 0)
              ? JSON.stringify(aiResult.protective_guidance)
              : null;

            submissionStatus = (aiResult.verdict === 'GENUINE' || aiResult.verdict === 'SCAM') ? 'AI_VERIFIED' : 'IN_REVIEW';
            aiChecked = true;
            markedBy = finalStatus !== 'null' ? 'auto' : undefined;
            matchedPatterns = campaignContext.matchFound ? (campaignContext.indicators || []) : [];

        } catch (aiError) {
            console.error(`[Stage C] AI Verification failed for ID ${sqliteId || mongoId}:`, aiError.message);
            // On AI failure, we leave it as IN_REVIEW, do not set ai_checked, leave status null. Fail loudly in logs.
            investigationPath.push(`AI FAILED: ${aiError.message}`);
        }

        const submissionData = {
          id: sqliteId || mongoId,
          message,
          personalDetails,
          responseDetails,
          dateReceived,
          userEmail,
          status: finalStatus
        };

        const _aiUpdateStart = Date.now();
        
        let updateData = {
          status:            finalStatus,
          submission_status: submissionStatus,
          ai_checked:        aiChecked,
          campaign_match:    campaignContext.matchFound ? true : false,
          matched_pattern:   matchedPatterns
        };

        if (markedBy) {
            updateData.marked_by = markedBy;
        }

        if (aiChecked && aiResult !== null) {
            updateData.ai_result = {
                scam_score:    scamScore,
                genuine_score: genuineScore,
                confidence:    confidence,
                risk_level:    riskLevel,
                verdict:       aiResult.verdict,
                is_expired:    isExpired,
                evidence_analysis:   Array.isArray(aiResult.evidence_analysis)   ? aiResult.evidence_analysis   : [],
                protective_guidance: Array.isArray(aiResult.protective_guidance) ? aiResult.protective_guidance : [],
                final_verdict: aiResult.final_verdict || '',
            };
            updateData.ai_score = scamScore;
            updateData.genuine_score = genuineScore;
            updateData.ai_confidence = confidence;
            updateData.risk_level = riskLevel;
            updateData.is_expired = isExpired;
        }

        const performSqliteUpdate = () => {
          return new Promise((resolve) => {
            let sql = `UPDATE datacheck SET submission_status=?, campaign_match=?, matched_pattern=?, status=?`;
            let params = [submissionStatus, campaignContext.matchFound ? 1 : 0, matchedPatterns.join(', '), finalStatus];

            if (aiChecked && aiResult !== null) {
                sql += `, ai_score=?, ai_result=?, ai_confidence=?, ai_evidence=?, genuine_evidence=?, risk_level=?, protective_guidance=?, is_expired=?, ai_checked=1, ai_last_checked=datetime('now'), genuine_score=?`;
                params.push(scamScore, aiResult.verdict, confidence, finalEvidence, genuineEvidenceStr, riskLevel, guidanceStr, isExpired ? 1 : 0, genuineScore);
            }
            
            sql += ` WHERE id=?`;
            params.push(sqliteId || mongoId);

            db.run(sql, params, (err) => {
                const ms = Date.now() - _aiUpdateStart;
                if (err) {
                  logger.logDB('update', 'sqlite', 'failure', { id: sqliteId || mongoId, error: err.message, latencyMs: ms });
                } else {
                  logger.logDB('update', 'sqlite', 'success', { id: sqliteId || mongoId, latencyMs: ms });
                  aggregateSqliteMs += ms;
                }
                resolve();
              }
            );
          });
        };

        const performMongoUpdate = async () => {
          const _mongoAiUpdateStart = Date.now();
          const query = mongoId ? { _id: mongoId } : { sqlite_id: sqliteId };
          try {
            await Submission.findOneAndUpdate(query, updateData);
            const ms = Date.now() - _mongoAiUpdateStart;
            aggregateMongoMs += ms;
            logger.logDB('update', 'mongo', 'success', { id: mongoId || sqliteId, latencyMs: ms });
          } catch (err) {
            const ms = Date.now() - _mongoAiUpdateStart;
            aggregateMongoMs += ms;
            logger.logDB('update', 'mongo', 'failure', { id: mongoId || sqliteId, error: err.message, latencyMs: ms });
          }
        };

        if (isMongoPrimary()) {
          await performMongoUpdate();
          performSqliteUpdate(); // shadow
        } else {
          await performSqliteUpdate();
          if (shouldWriteToMongo()) performMongoUpdate(); // shadow
        }

        console.log('[Stage D] ✅ DB updated for ID:', sqliteId || mongoId);

        // AUTO-VERIFICATION LOGIC
        if (finalStatus !== 'null' && notifyFlag && userEmail && aiChecked) {
          sendUserNotification(userEmail, { 
            id: sqliteId || mongoId, 
            status: finalStatus, 
            ...aiResult, 
            ai_evidence: finalEvidence 
          }).catch(e => console.error('[Stage D] Notification failed:', e.message));
        }

        // ADMIN ALERT
        if (aiChecked && aiResult && (aiResult.verdict === 'SUSPICIOUS' || (scamScoreNum >= 60 && scamScoreNum < 80))) {
          sendAdminAlert(submissionData, { ...aiResult, evidence: finalEvidence }, investigationPath.join(' → '))
            .catch(e => console.error('[Stage D] Admin alert failed:', e.message));
        }


        console.log('====== PIPELINE END: ID', sqliteId || mongoId, '| Scam:', scamScore, '| Genuine:', genuineScore, '| Status:', finalStatus, '======\n');

        // PERFORMANCE + LATENCY TRACKING
        const totalPipelineTime = Date.now() - _pipelineStart;
        logger.logInfo('Pipeline Performance Summary', {
          service: "verification",
          sqliteTime: `${aggregateSqliteMs}ms`,
          mongoTime: `${aggregateMongoMs || 'N/A'}ms`,
          aiTime: `${aiResult.latencyMs || 0}ms`,
          totalTime: `${totalPipelineTime}ms`
        });


      } catch (error) {
        console.error('Pipeline failed for ID:', sqliteId || mongoId, '—', error.message);
      }
    });
  }
});

// Get all datacheck entries
app.get('/api/datas', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  
  // Extract role
  let requestor_role = 'user';
  if (req.headers.authorization) {
    try {
      // Basic extraction attempt if it's a JWT. Otherwise, check custom headers.
      const token = req.headers.authorization.split(' ')[1];
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      requestor_role = (payload.role || payload.user_role || '').toLowerCase().includes('admin') ? 'admin' : 'user';
    } catch(e) { /* ignore */ }
  } else if (req.headers['x-user-role']) {
    requestor_role = req.headers['x-user-role'].toLowerCase() === 'admin' ? 'admin' : 'user';
  } else if (req.user) {
    requestor_role = (req.user.role || req.user.user_role || '').toLowerCase().includes('admin') ? 'admin' : 'user';
  }

  const formatSubmissions = (subs) => {
    return subs.map(sub => {
      // Parse stringified ai_result (common in SQLite)
      if (typeof sub.ai_result === 'string') {
        try { sub.ai_result = JSON.parse(sub.ai_result); } catch(e) { sub.ai_result = {}; }
      }
      return sub;
    });
  };

  if (isMongoPrimary()) {
    try {
      let submissions = await Submission.find().sort({ createdAt: -1 }).lean();
      submissions = formatSubmissions(submissions); // Also apply to mapped subs if needed
      return res.json({
        submissions: mapSubmissions(submissions),
        requestor_role
      });
    } catch (err) {
      logger.logError('Mongo Read Error (GET /api/datas)', err);
      // Fall through to SQLite
    }
  }
  
  db.all('SELECT * FROM datacheck ORDER BY id DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    return res.json({
      submissions: formatSubmissions(rows),
      requestor_role
    });
  });
});

app.get('/api/datas/:id', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  
  let requestor_role = 'user';
  if (req.headers.authorization) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      requestor_role = (payload.role || payload.user_role || '').toLowerCase().includes('admin') ? 'admin' : 'user';
    } catch(e) { /* ignore */ }
  } else if (req.headers['x-user-role']) {
    requestor_role = req.headers['x-user-role'].toLowerCase() === 'admin' ? 'admin' : 'user';
  } else if (req.user) {
    requestor_role = (req.user.role || req.user.user_role || '').toLowerCase().includes('admin') ? 'admin' : 'user';
  }

  const formatSubmission = (sub) => {
    if (typeof sub.ai_result === 'string') {
      try { sub.ai_result = JSON.parse(sub.ai_result); } catch(e) { sub.ai_result = {}; }
    }
    return sub;
  };

  const { id } = req.params;
  if (isMongoPrimary()) {
    try {
      // Find by Mongo ID first, or sqlite_id if numeric
      const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { sqlite_id: Number(id) };
      let submission = await Submission.findOne(query).lean();
      if (submission) {
        submission = formatSubmission(submission);
        return res.json({
          submission: mapSubmission(submission),
          ai_result: submission.ai_result,
          requestor_role
        });
      }
      return res.status(404).json({ error: 'Submission not found' });
    } catch (err) {
      logger.logError('Mongo Read Error (GET /api/datas/:id)', err);
      return res.status(500).json({ error: 'Database read failed' });
    }
  }
  
  db.get('SELECT * FROM datacheck WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Submission not found' });
    
    row = formatSubmission(row);
    return res.json({
      submission: row,
      ai_result: row.ai_result,
      requestor_role
    });
  });
});

// ─── Phase 3: Admin Review Panel Endpoints ─────────────────────────────────────

// Get all submissions pending manual review
app.get('/api/admin/in-review', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  
  let requestor_role = 'user';
  if (req.headers.authorization) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      requestor_role = (payload.role || payload.user_role || '').toLowerCase().includes('admin') ? 'admin' : 'user';
    } catch(e) { /* ignore */ }
  } else if (req.headers['x-user-role']) {
    requestor_role = req.headers['x-user-role'].toLowerCase() === 'admin' ? 'admin' : 'user';
  } else if (req.user) {
    requestor_role = (req.user.role || req.user.user_role || '').toLowerCase().includes('admin') ? 'admin' : 'user';
  }

  const formatSubmissions = (subs) => {
    return subs.map(sub => {
      if (typeof sub.ai_result === 'string') {
        try { sub.ai_result = JSON.parse(sub.ai_result); } catch(e) { sub.ai_result = {}; }
      }
      return sub;
    });
  };

  if (isMongoPrimary()) {
    try {
      let submissions = await Submission.find({
        submission_status: 'IN_REVIEW',
        verified_by_admin: { $ne: true }
      }).sort({ createdAt: -1 }).lean();
      
      submissions = formatSubmissions(submissions);
      return res.json({
        submissions: mapSubmissions(submissions),
        requestor_role
      });
    } catch (err) {
      logger.logError('Mongo Read Error (GET /api/admin/in-review)', err);
      // Fall through to SQLite
    }
  }
  const sql = `
    SELECT * FROM datacheck 
    WHERE submission_status = 'IN_REVIEW' 
    AND (verified_by_admin IS NULL OR verified_by_admin = 0)
    ORDER BY id DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    return res.json({
      submissions: formatSubmissions(rows),
      requestor_role
    });
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
      const triggerNotification = async (submission) => {
        if (submission && (submission.send_email_notification || submission.notification_requested)) {
          if (submission.user_email) {
            const notificationData = {
              ...submission,
              status: displayStatus,
              ai_evidence: adminReason ? `Admin Feedback: ${adminReason}` : (submission.ai_evidence || ''),
              genuine_evidence: adminReason ? `Admin Feedback: ${adminReason}` : (submission.genuine_evidence || '')
            };
            sendUserNotification(submission.user_email, notificationData).catch(e => console.error(`[Admin] Notification failed: ${e.message}`));
          }
        }
      };

      if (isMongoPrimary()) {
        const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { sqlite_id: Number(id) };
        Submission.findOne(query).lean().then(triggerNotification).catch(e => console.error('[Admin] Mongo fetch for notify failed:', e.message));
      } else {
        db.get('SELECT * FROM datacheck WHERE id = ?', [id], (err, row) => {
          if (!err && row) triggerNotification(row);
        });
      }

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
      .then(async pattern => {
        if (pattern) {
          if (isMongoPrimary()) {
            try {
              const rule = await LearningRule.create({
                submission_id: String(updated ? updated.sqlite_id || id : id),
                pattern,
                admin_decision: finalResult,
                admin_reason: adminReason
              });
              // Shadow write to SQLite
              const learningSql = `INSERT INTO agent_learning_rules (submission_id, pattern, admin_decision, admin_reason, created_at, is_active) VALUES (?, ?, ?, ?, ?, 1)`;
              db.run(learningSql, [id, pattern, finalResult, adminReason, timestamp]);
              logger.logInfo('[LearningRule] Auto-created via AI feedback', { id: rule._id.toString() });
            } catch (err) {
              logger.logError('Mongo Write Error (Agent Learning Validation)', err);
            }
          } else {
            const learningSql = `INSERT INTO agent_learning_rules (submission_id, pattern, admin_decision, admin_reason, created_at, is_active) VALUES (?, ?, ?, ?, ?, 1)`;
            db.run(learningSql, [id, pattern, finalResult, adminReason, timestamp], function(err) {
              if (!err && isMongoConnected()) {
                 LearningRule.create({ submission_id: String(id), pattern, admin_decision: finalResult, admin_reason: adminReason }).catch(() => {});
              }
            });
          }
        }
      }).catch(e => console.error('❌ Pattern extraction error:', e.message));
  }
});

// ─── Phase 6: Learning Rule Management (MongoDB Primary) ────────────────────

const LearningRule = require('./models/LearningRule');

/**
 * Helper: map a LearningRule lean doc to a clean API response.
 * Ensures `id` is always present as a string (required by Admin UI).
 */
function mapRule(doc) {
  return {
    id:              doc._id ? doc._id.toString() : String(doc.id || ''),
    submission_id:   doc.submission_id || '',
    pattern:         doc.pattern || '',
    admin_decision:  doc.admin_decision || '',
    admin_reason:    doc.admin_reason  || '',
    is_active:       !!doc.is_active,
    createdAt:       doc.createdAt || doc.created_at || null,
    updatedAt:       doc.updatedAt || null,
  };
}

const mapSubmission = (doc) => {
  if (!doc) return null;

  const obj = doc.toObject ? doc.toObject() : doc;

  const { _id, __v, ...rest } = obj;

  return {
    ...rest,
    id: _id ? _id.toString() : obj.id,
  };
};

const mapSubmissions = (docs) => {
  if (!Array.isArray(docs)) return [];
  return docs.map(mapSubmission);
};

const mapUser = (doc) => {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : doc;
  const { _id, __v, password, ...rest } = obj; // Exclude password if present
  return {
    ...rest,
    id: _id ? _id.toString() : obj.id,
  };
};

// GET — List all learning rules
app.get('/api/admin/learning-rules', async (req, res) => {
  if (isMongoPrimary()) {
    try {
      const rules = await LearningRule.find().sort({ createdAt: -1 }).lean();
      return res.json(rules.map(mapRule));
    } catch (err) {
      logger.logError('Mongo Read Error (GET /api/admin/learning-rules)', err);
      // Fall through to SQLite
    }
  }
  db.all('SELECT * FROM agent_learning_rules ORDER BY id DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// POST — Create a new learning rule manually
app.post('/api/admin/learning-rules', async (req, res) => {
  const { submission_id, pattern, admin_decision, admin_reason } = req.body;

  // Input validation
  if (!submission_id || typeof submission_id !== 'string' || !submission_id.trim()) {
    return res.status(400).json({ error: 'submission_id is required.' });
  }
  if (!pattern || typeof pattern !== 'string' || pattern.trim().length < 3) {
    return res.status(400).json({ error: 'pattern is required and must be at least 3 characters.' });
  }
  if (!['SCAM', 'GENUINE'].includes(admin_decision)) {
    return res.status(400).json({ error: 'admin_decision must be SCAM or GENUINE.' });
  }

  if (isMongoPrimary()) {
    try {
      const rule = await LearningRule.create({
        submission_id: submission_id.trim(),
        pattern:       pattern.trim(),
        admin_decision,
        admin_reason:  admin_reason ? admin_reason.trim() : '',
      });
      // Shadow write to SQLite
      const learningSql = `INSERT INTO agent_learning_rules (submission_id, pattern, admin_decision, admin_reason, created_at, is_active) VALUES (?, ?, ?, ?, ?, 1)`;
      db.run(learningSql, [submission_id.trim(), pattern.trim(), admin_decision, admin_reason || '', new Date().toISOString()]);
      logger.logInfo('[LearningRule] Created via API', { id: rule._id.toString() });
      return res.status(201).json(mapRule(rule.toObject()));
    } catch (err) {
      logger.logError('Mongo Write Error (POST /api/admin/learning-rules)', err);
      // Return validation errors in a clean format
      if (err.name === 'ValidationError') {
        return res.status(400).json({ error: Object.values(err.errors).map(e => e.message).join(', ') });
      }
      return res.status(500).json({ error: 'Failed to create learning rule.' });
    }
  }
  // SQLite fallback
  const ts = new Date().toISOString();
  const sql = `INSERT INTO agent_learning_rules (submission_id, pattern, admin_decision, admin_reason, created_at, is_active) VALUES (?, ?, ?, ?, ?, 1)`;
  db.run(sql, [submission_id.trim(), pattern.trim(), admin_decision, admin_reason || '', ts], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: String(this.lastID), submission_id, pattern, admin_decision, admin_reason, is_active: true, createdAt: ts });
  });
});

// PUT — Toggle rule is_active
app.put('/api/admin/learning-rules/:id/toggle', async (req, res) => {
  const { id } = req.params;
  if (isMongoPrimary()) {
    try {
      const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { submission_id: String(id) };
      const rule = await LearningRule.findOne(query);
      if (!rule) return res.status(404).json({ error: 'Learning rule not found.' });
      rule.is_active = !rule.is_active;
      await rule.save();
      // Shadow SQLite
      db.run('UPDATE agent_learning_rules SET is_active = 1 - is_active WHERE id = ?', [id]);
      logger.logInfo('[LearningRule] Toggled', { id, is_active: rule.is_active });
      return res.json({ success: true, id: rule._id.toString(), is_active: rule.is_active });
    } catch (err) {
      logger.logError('Mongo Toggle Error (PUT /api/admin/learning-rules/:id/toggle)', err);
      return res.status(500).json({ error: 'Failed to toggle learning rule.' });
    }
  }
  db.run('UPDATE agent_learning_rules SET is_active = 1 - is_active WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// DELETE — Remove a learning rule
app.delete('/api/admin/learning-rules/:id', async (req, res) => {
  const { id } = req.params;
  if (isMongoPrimary()) {
    try {
      const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { submission_id: String(id) };
      const deleted = await LearningRule.findOneAndDelete(query);
      if (!deleted) return res.status(404).json({ error: 'Learning rule not found.' });
      // Shadow SQLite
      db.run('DELETE FROM agent_learning_rules WHERE id = ?', [id]);
      logger.logInfo('[LearningRule] Deleted', { id });
      return res.json({ success: true, id: deleted._id.toString() });
    } catch (err) {
      logger.logError('Mongo Delete Error (DELETE /api/admin/learning-rules/:id)', err);
      return res.status(500).json({ error: 'Failed to delete learning rule.' });
    }
  }
  db.run('DELETE FROM agent_learning_rules WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Get all users
app.get('/api/users', async (req, res) => {
  if (isMongoPrimary()) {
    try {
      const users = await User.find().sort({ createdAt: -1 }).lean();
      return res.json(users.map(mapUser));
    } catch (err) {
      logger.logError('Mongo Read Error (GET /api/users)', err);
    }
  }
  db.all('SELECT * FROM users', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
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
        recentActivity: mapSubmissions(recentActivity)
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
    mongo: mongoRecord ? mapSubmission(mongoRecord) : null,
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
    sqliteActive:        true,
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);

  // ─── Phase 4 Step 7: Log active DB architecture on startup ───────────────
  const mongoMode = process.env.USE_MONGO_PRIMARY === 'true' ? 'PRIMARY' : 'SHADOW';
  const modeLabel = mongoMode === 'PRIMARY'
    ? '🔴 Mongo PRIMARY mode — reads & writes served from MongoDB'
    : '🟡 Mongo SHADOW mode  — SQLite is source of truth, MongoDB is shadow-write only';
  console.log(`\n[Architecture] ${modeLabel}\n`);
  logger.logInfo('Server startup', { port: PORT, mongoMode, sqliteActive: true });

  // ─── Phase 1: MongoDB — non-blocking, fail-safe ──────────────────────────
  connectMongo();
});
