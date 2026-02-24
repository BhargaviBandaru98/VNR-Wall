/**
 * extendSchema.js
 *
 * Safely extends the 'datacheck' table with AI verification columns.
 * - Uses PRAGMA table_info to detect existing columns.
 * - Skips columns that already exist (idempotent, safe across restarts).
 * - Runs sequentially via callback chaining (compatible with sqlite3 async API).
 * - Called once from server.js inside the DB connection callback.
 */

const AI_COLUMNS = [
  { name: 'ai_score', type: 'INTEGER' },
  { name: 'ai_result', type: 'TEXT' },
  { name: 'ai_checked', type: 'TEXT' },
  { name: 'ai_confidence', type: 'TEXT' },
  { name: 'ai_last_checked', type: 'TEXT' },
  { name: 'ai_evidence', type: 'TEXT' },
];

/**
 * @param {import('sqlite3').Database} db  - The open sqlite3 database instance
 * @param {Function} done                  - Called when all columns are processed
 */
function extendSchema(db, done) {
  // Read current columns from the live database
  db.all('PRAGMA table_info(datacheck)', (err, rows) => {
    if (err) {
      console.error('❌ extendSchema: Failed to read table info:', err.message);
      // Don't crash server — just call done and continue
      return done && done();
    }

    const existingColumns = new Set(rows.map((row) => row.name));

    // Process columns one at a time (sequential to avoid SQLite write conflicts)
    function processNext(index) {
      if (index >= AI_COLUMNS.length) {
        return done && done();
      }

      const col = AI_COLUMNS[index];

      if (existingColumns.has(col.name)) {
        console.log(`ℹ️  AI column "${col.name}" already exists — skipping.`);
        return processNext(index + 1);
      }

      const sql = `ALTER TABLE datacheck ADD COLUMN ${col.name} ${col.type}`;
      db.run(sql, (alterErr) => {
        if (alterErr) {
          // SQLite may still report "duplicate column" on rare race conditions
          if (alterErr.message && alterErr.message.includes('duplicate column')) {
            console.log(`ℹ️  AI column "${col.name}" already exists — skipping.`);
          } else {
            console.error(`❌ extendSchema: Failed to add column "${col.name}":`, alterErr.message);
          }
        } else {
          console.log(`✅ AI column "${col.name}" added.`);
        }
        processNext(index + 1);
      });
    }

    processNext(0);
  });
}

module.exports = { extendSchema };
