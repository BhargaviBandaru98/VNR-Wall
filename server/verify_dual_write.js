const sqlite3 = require('sqlite3').verbose();
const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Submission = require('./models/Submission');

async function verify() {
  console.log('--- Dual Write Verification ---');

  // 1. Check SQLite
  const db = new sqlite3.Database('./database.db');
  
  const getLatestSQLite = () => new Promise((resolve, reject) => {
    db.all('SELECT * FROM datacheck ORDER BY id DESC LIMIT 1', (err, rows) => {
      if (err) reject(err);
      else resolve(rows[0]);
    });
  });

  try {
    const sqliteRow = await getLatestSQLite();
    console.log('✅ Latest SQLite Row:', sqliteRow ? `ID ${sqliteRow.id}: ${sqliteRow.message.substring(0, 30)}...` : 'None');

    if (!sqliteRow) {
      console.log('❌ No submissions found in SQLite.');
      db.close();
      return;
    }

    // 2. Check MongoDB
    if (!process.env.MONGO_URI) {
      console.log('⚠️  MONGO_URI not set. Skipping MongoDB check.');
      db.close();
      return;
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB.');

    const mongoDoc = await Submission.findOne({ sqlite_id: sqliteRow.id });
    
    if (mongoDoc) {
      console.log('✅ MongoDB Document Found!');
      console.log('   Match SQLite ID:', mongoDoc.sqlite_id);
      console.log('   Message Match:', mongoDoc.message === sqliteRow.message);
      console.log('   Status Match:', mongoDoc.status === (sqliteRow.status || 'null'));
      console.log('   AI Checked:', mongoDoc.ai_checked);
      
      if (mongoDoc.ai_checked) {
        console.log('   AI Result (Structured):', JSON.stringify(mongoDoc.ai_result, null, 2));
      }
    } else {
      console.log('❌ MongoDB Document NOT found for SQLite ID:', sqliteRow.id);
    }

  } catch (err) {
    console.error('❌ Verification Error:', err.message);
  } finally {
    db.close();
    await mongoose.disconnect();
  }
}

verify();
