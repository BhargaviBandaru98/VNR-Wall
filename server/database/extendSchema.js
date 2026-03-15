/**
 * extendSchema.js
 *
 * Safely extends tables with new columns.
 */

const DATACHECK_COLUMNS = [
  // ── Original AI verification fields ──────────────────────────────────────
  { name: 'ai_score',                type: 'INTEGER' },
  { name: 'ai_result',               type: 'TEXT'    }, // Raw AI decision: SCAM | GENUINE | UNKNOWN
  { name: 'ai_checked',              type: 'INTEGER' }, // 1 when AI has processed
  { name: 'ai_confidence',           type: 'TEXT'    }, // HIGH | MEDIUM | LOW
  { name: 'ai_last_checked',         type: 'TEXT'    },
  { name: 'ai_evidence',             type: 'TEXT'    }, // Scam forensic detail
  { name: 'genuine_evidence',        type: 'TEXT'    }, // Authenticity forensic detail
  { name: 'risk_level',              type: 'TEXT'    },
  { name: 'protective_guidance',     type: 'TEXT'    }, // JSON array of safety tips
  { name: 'user_email',              type: 'TEXT'    },
  { name: 'is_expired',              type: 'INTEGER' },
  { name: 'send_email_notification', type: 'INTEGER' }, // Checkbox at submission
  { name: 'response_details',        type: 'TEXT'    },
  { name: 'marked_by',               type: 'TEXT'    },

  // ── Phase 2.7: Verification State Fields ─────────────────────────────────
  // submission_status tracks the WORKFLOW state (not the verdict)
  // Values: AI_VERIFIED | IN_REVIEW | ADMIN_VERIFIED
  { name: 'submission_status',       type: 'TEXT'    },

  // notification_requested: set to 1 when user clicks Notify Me in modal
  // (send_email_notification covers the checkbox at form submission)
  { name: 'notification_requested',  type: 'INTEGER', default: 0 },

  // final_result: stores ADMIN's final decision, separate from ai_result
  // so analytics can track AI accuracy vs admin overrides
  { name: 'final_result',            type: 'TEXT'    }, // SCAM | GENUINE | IN_REVIEW

  // Admin audit trail
  { name: 'verified_by_admin',       type: 'INTEGER' }, // 1 when admin has reviewed
  { name: 'verification_timestamp',  type: 'TEXT'    }, // datetime() when admin verified
  { name: 'admin_reason',            type: 'TEXT'    }, // optional note from admin

  // genuine_score: stored alongside ai_score to avoid re-computation
  { name: 'genuine_score',           type: 'INTEGER' },
];

const USER_COLUMNS = [
  { name: 'email', type: 'TEXT' },
  { name: 'college_name', type: 'TEXT' },
  { name: 'user_role', type: 'TEXT' },
  { name: 'year_of_study', type: 'TEXT' },
  { name: 'is_profile_complete', type: 'INTEGER' },
];

/**
 * Helper to extend a specific table with columns
 */
async function extendTable(db, tableName, columns) {
  return new Promise((resolve) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
      if (err) {
        console.error(`❌ extendSchema: Failed to read ${tableName} info:`, err.message);
        return resolve();
      }

      const existingColumns = new Set(rows.map((row) => row.name));

      function processNext(index) {
        if (index >= columns.length) {
          return resolve();
        }

        const col = columns[index];
        if (existingColumns.has(col.name)) {
          console.log(`ℹ️  [${tableName}] Column "${col.name}" already exists — skipping.`);
          return processNext(index + 1);
        }

        db.run(`ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.type}`, (alterErr) => {
          if (alterErr) {
            if (!alterErr.message.includes('duplicate column')) {
              console.error(`❌ extendSchema: Failed to add [${tableName}] column "${col.name}":`, alterErr.message);
            }
          } else {
            console.log(`✅ [${tableName}] Column "${col.name}" added.`);
          }
          processNext(index + 1);
        });
      }
      processNext(0);
    });
  });
}

/**
 * @param {import('sqlite3').Database} db  - The open sqlite3 database instance
 * @param {Function} done                  - Called when all columns are processed
 */
async function extendSchema(db, done) {
  console.log('[extendSchema] Starting schema audit...');
  await extendTable(db, 'datacheck', DATACHECK_COLUMNS);
  await extendTable(db, 'users', USER_COLUMNS);
  console.log('[extendSchema] Schema audit complete.');
  if (done) done();
}

module.exports = { extendSchema };
