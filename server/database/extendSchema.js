/**
 * extendSchema.js
 *
 * Safely extends tables with new columns.
 */

const DATACHECK_COLUMNS = [
  { name: 'ai_score', type: 'INTEGER' },
  { name: 'ai_result', type: 'TEXT' },
  { name: 'ai_checked', type: 'TEXT' },
  { name: 'ai_confidence', type: 'TEXT' },
  { name: 'ai_last_checked', type: 'TEXT' },
  { name: 'ai_evidence', type: 'TEXT' },
  { name: 'genuine_evidence', type: 'TEXT' },
  { name: 'risk_level', type: 'TEXT' },
  { name: 'protective_guidance', type: 'TEXT' },
  { name: 'user_email', type: 'TEXT' }, // Added for user sync
  { name: 'is_expired', type: 'INTEGER' },
  { name: 'send_email_notification', type: 'INTEGER' }
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
