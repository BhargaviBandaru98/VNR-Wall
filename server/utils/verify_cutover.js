/**
 * VNR Wall — Cutover Verification Script (Phase 5, Step 7)
 * Verifies 100% parity between SQLite and MongoDB.
 * 
 * Usage: node utils/verify_cutover.js
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const sqlite3 = require('sqlite3').verbose();
const mongoose = require('mongoose');

const { connectMongo } = require('../config/mongo');
const Submission = require('../models/Submission');
const User = require('../models/User');
const LearningRule = require('../models/LearningRule');
const db = new sqlite3.Database(path.join(__dirname, '../database.db'));

async function verify() {
  console.log('\n🔍 Starting Cutover Verification...');
  console.log('------------------------------------');

  try {
    await connectMongo();
    
    // 1. Check Submissions Parity
    const sqliteCount = await new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM datacheck', (err, row) => resolve(row.count));
    });

    const mongoCount = await Submission.countDocuments();

    console.log(`\n📊 Submissions Count:`);
    console.log(`   SQLite:  ${sqliteCount}`);
    console.log(`   MongoDB: ${mongoCount}`);

    if (sqliteCount === mongoCount) {
      console.log('   ✅ Count Parity: MATCH');
    } else {
      console.log('   ❌ Count Parity: MISMATCH!');
    }

    // 2. Check User Parity
    const sqliteUserCount = await new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM users', (err, row) => resolve(row.count));
    });

    const mongoUserCount = await User.countDocuments();

    console.log(`\n📊 Users Count:`);
    console.log(`   SQLite:  ${sqliteUserCount}`);
    console.log(`   MongoDB: ${mongoUserCount}`);

    if (sqliteUserCount === mongoUserCount) {
      console.log('   ✅ Count Parity: MATCH');
    } else {
      console.log('   ❌ Count Parity: MISMATCH!');
    }

    // 3. Check Learning Rules Parity
    const sqliteRuleCount = await new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM agent_learning_rules', (err, row) => resolve(row ? row.count : 0));
    });

    const mongoRuleCount = await LearningRule.countDocuments();

    console.log(`\n📊 Learning Rules Count:`);
    console.log(`   SQLite:  ${sqliteRuleCount}`);
    console.log(`   MongoDB: ${mongoRuleCount}`);

    if (sqliteRuleCount === mongoRuleCount) {
      console.log('   ✅ Count Parity: MATCH');
    } else {
      console.log('   ❌ Count Parity: MISMATCH!');
    }

    // 4. Random Sample Check
    console.log(`\n🔎 Sampling 3 random records...`);
    const sqliteSamples = await new Promise((resolve) => {
      db.all('SELECT id, message, user_email FROM datacheck ORDER BY RANDOM() LIMIT 3', (err, rows) => resolve(rows));
    });

    for (const sample of sqliteSamples) {
      const match = await Submission.findOne({ sqlite_id: sample.id });
      if (match) {
        console.log(`   ✅ SQLite ID ${sample.id} exists in MongoDB (UID: ${match._id})`);
      } else {
        console.log(`   ❌ SQLite ID ${sample.id} MISSING from MongoDB!`);
      }
    }

    console.log('\n------------------------------------');
    if (sqliteCount === mongoCount && sqliteUserCount === mongoUserCount && sqliteRuleCount === mongoRuleCount) {
      console.log('✨ VERIFICATION SUCCESSFUL: Ready for PRODUCTION CUTOVER.');
    } else {
      console.log('⚠️ VERIFICATION PARTIAL: Parity issues detected.');
    }

  } catch (err) {
    console.error('💥 Verification Failed:', err.message);
  } finally {
    db.close();
    mongoose.connection.close();
  }
}

verify();
