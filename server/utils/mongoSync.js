/**
 * VNR Wall — Legacy Data Sync (Phase 4, Step 8)
 * Migrates existing SQLite data to MongoDB.
 * 
 * Usage: node utils/mongoSync.js
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const sqlite3 = require('sqlite3').verbose();
const mongoose = require('mongoose');

// Models & Config
const { connectMongo } = require('../config/mongo');
const Submission = require('../models/Submission');
const User = require('../models/User');
const LearningRule = require('../models/LearningRule');
const db = new sqlite3.Database(path.join(__dirname, '../database.db'));

async function syncUsers() {
  console.log('\n👤 Starting User Sync (SQLite -> MongoDB)...');
  const rows = await new Promise((resolve, reject) => {
    db.all('SELECT * FROM users', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  console.log(`📊 Found ${rows.length} users in SQLite.`);
  let synced = 0, skipped = 0;

  for (const row of rows) {
    if (!row.email) {
      console.warn('⏩ Skipping user with null email');
      skipped++;
      continue;
    }
    const normalizedEmail = row.email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      skipped++;
      continue;
    }

    await User.create({
      email: row.email.toLowerCase().trim(),
      name: row.name || '',
      college_name: row.college_name || '',
      user_role: row.user_role || '',
      year_of_study: row.year_of_study || '',
      is_profile_complete: !!row.is_profile_complete,
      createdAt: new Date(row.created_at || Date.now()),
    });
    synced++;
  }
  console.log(`✅ Users Synced: ${synced} (Skipped: ${skipped})`);
}

async function syncLearningRules() {
  console.log('\n🧠 Starting Learning Rule Sync (SQLite -> MongoDB)...');
  const rows = await new Promise((resolve, reject) => {
    db.all('SELECT * FROM agent_learning_rules', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  console.log(`📊 Found ${rows.length} rules in SQLite.`);
  let synced = 0, skipped = 0;

  for (const row of rows) {
    const existing = await LearningRule.findOne({ submission_id: String(row.submission_id), pattern: row.pattern });
    if (existing) {
      skipped++;
      continue;
    }

    await LearningRule.create({
      submission_id:  String(row.submission_id),
      pattern:         row.pattern,
      admin_decision:  row.admin_decision,
      admin_reason:    row.admin_reason,
      is_active:       !!row.is_active,
      createdAt:       new Date(row.created_at || Date.now()),
    });
    synced++;
  }
  console.log(`✅ Learning Rules Synced: ${synced} (Skipped: ${skipped})`);
}

async function syncSubmissions() {
  console.log('\n📝 Starting Submissions Sync (SQLite -> MongoDB)...');

  // Fetch all SQLite rows
  const rows = await new Promise((resolve, reject) => {
    db.all('SELECT * FROM datacheck', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  console.log(`📊 Found ${rows.length} submissions in SQLite.`);

  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      // Check if already in Mongo
      const existing = await Submission.findOne({ sqlite_id: row.id });
      if (existing) {
        skipped++;
        continue;
      }

      // Map legacy verdict strings
      let verdict = (row.ai_result || '').toUpperCase();
      if (verdict === 'FAKE') verdict = 'SCAM';
      if (verdict === 'REAL') verdict = 'GENUINE';
      if (!['SCAM', 'GENUINE', 'SUSPICIOUS', 'UNKNOWN', ''].includes(verdict)) {
        verdict = 'UNKNOWN';
      }

      // Map workflow status
      let subStatus = (row.submission_status || '').toUpperCase();
      if (!['AI_VERIFIED', 'IN_REVIEW', 'ADMIN_VERIFIED', ''].includes(subStatus)) {
        subStatus = row.ai_checked ? 'AI_VERIFIED' : 'IN_REVIEW';
      }

      // Parse guidance
      let guidance = [];
      try {
        if (row.protective_guidance) {
          guidance = JSON.parse(row.protective_guidance);
        }
      } catch (e) {
        if (row.protective_guidance) {
          guidance = row.protective_guidance.split(';').map(s => s.trim()).filter(Boolean);
        }
      }

      // Map SQLite to Mongo
      await Submission.create({
        sqlite_id:         row.id,
        message:           row.message || '[No Content]', // Validation fix
        user_email:        row.user_email || '',
        dateReceived:      row.dateReceived || '',
        personalDetails:   row.personalDetails || '',
        response_details:  row.response_details || '',
        status:            row.status || 'null',
        ai_score:          row.ai_score || 0,
        genuine_score:     row.genuine_score || 0,
        ai_confidence:     (row.ai_confidence || '').toUpperCase(),
        risk_level:        row.risk_level || 'Medium',
        submission_status: subStatus,
        ai_checked:        !!row.ai_checked,
        campaign_match:    !!row.campaign_match,
        matched_pattern:   row.matched_pattern ? row.matched_pattern.split(',').map(s => s.trim()) : [],
        ai_result: {
          verdict:       verdict,
          is_expired:    !!row.is_expired,
          protective_guidance: guidance,
          evidence:      row.ai_evidence || '',
          evidence_analysis: [],
        },
        verified_by_admin: !!row.verified_by_admin,
        final_result:      row.final_result || '',
        admin_reason:      row.admin_reason || '',
        marked_by:         row.marked_by || 'auto',
        createdAt:         new Date(row.created_at || Date.now()),
      });

      synced++;
      if (synced % 10 === 0) process.stdout.write('.');
    } catch (err) {
      console.error(`\n❌ Failed to sync row ID ${row.id}:`, err.message);
      failed++;
    }
  }

  console.log('\n\n✨ Submissions Sync Complete!');
  console.log(`✅ Synced:  ${synced}`);
  console.log(`⏩ Skipped: ${skipped} (already exist)`);
  console.log(`❌ Failed:  ${failed}`);
}

async function run() {
  try {
    await connectMongo();
    console.log('✅ Connected to MongoDB.');
    await syncUsers();
    await syncLearningRules();
    await syncSubmissions();
  } catch (err) {
    console.error('💥 Fatal Sync Error:', err.message);
  } finally {
    db.close();
    mongoose.connection.close();
  }
}

run();
