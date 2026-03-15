const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');

async function test() {
  console.log('--- Phase 3 & 4 Verification Test ---');

  // 1. Check if we have an IN_REVIEW record
  db.get("SELECT id FROM datacheck WHERE submission_status = 'IN_REVIEW' LIMIT 1", (err, row) => {
    if (err) return console.error(err);
    if (!row) {
        console.log('No IN_REVIEW record found. Creating one...');
        db.run("INSERT INTO datacheck (message, submission_status, ai_score, ai_checked) VALUES ('Test Borderline Message', 'IN_REVIEW', 50, 1)", function(err) {
            if (err) return console.error(err);
            runVerdict(this.lastID);
        });
    } else {
        runVerdict(row.id);
    }
  });
}

function runVerdict(id) {
    console.log(`Targeting ID: ${id}`);
    
    // Simulate Admin Verdict: Mark as GENUINE with reason
    const verdict = 'GENUINE';
    const reason = 'Verified via official internship portal.';
    const timestamp = new Date().toISOString();
    const displayStatus = 'Genuine';

    db.run(`
        UPDATE datacheck 
        SET final_result = ?, 
            admin_reason = ?, 
            verified_by_admin = 1, 
            verification_timestamp = ?, 
            submission_status = 'ADMIN_VERIFIED',
            status = ?
        WHERE id = ?
    `, [verdict, reason, timestamp, displayStatus, id], function(err) {
        if (err) return console.error(err);
        
        console.log('✅ Update applied.');

        // Verify result
        db.get("SELECT * FROM datacheck WHERE id = ?", [id], (err, row) => {
            if (err) return console.error(err);
            console.log('Row after update:', {
                id: row.id,
                status: row.status,
                submission_status: row.submission_status,
                final_result: row.final_result,
                admin_reason: row.admin_reason,
                verified_by_admin: row.verified_by_admin
            });

            if (row.submission_status === 'ADMIN_VERIFIED' && row.final_result === 'GENUINE') {
                console.log('🎉 VERIFICATION SUCCESSFUL');
            } else {
                console.error('❌ VERIFICATION FAILED');
            }
            db.close();
        });
    });
}

test();
