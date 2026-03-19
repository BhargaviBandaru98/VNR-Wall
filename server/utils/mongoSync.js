/**
 * VNR Wall — Legacy Data Sync (Phase 4, Step 8)
 * Migrates existing SQLite data to MongoDB.
 * 
 * Usage: node utils/mongoSync.js
 */
'use strict';

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const mongoose = require('mongoose');
const path = require('path');

// Models & Config
const { connectMongo } = require('../config/mongo');
const Submission = require('../models/Submission');
const db = new sqlite3.Database(path.join(__dirname, '../database.db'));

async function sync() {
  console.log('🚀 Starting Legacy Data Sync (SQLite -> MongoDB)...');

  try {
    // 1. Connect to Mongo
    await connectMongo();
    console.log('✅ Connected to MongoDB.');

    // 2. Fetch all SQLite rows
    const rows = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM datacheck', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log(`📊 Found ${rows.length} rows in SQLite.`);

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

        // Parse guidance
        let guidance = [];
        try {
          if (row.protective_guidance) {
            guidance = JSON.parse(row.protective_guidance);
          }
        } catch (e) {
          // If not JSON, try splitting by semi-colon or just use as single entry
          guidance = row.protective_guidance.split(';').map(s => s.trim()).filter(Boolean);
        }

        // Map SQLite to Mongo
        await Submission.create({
          sqlite_id:         row.id,
          message:           row.message || '',
          user_email:        row.user_email || '',
          dateReceived:      row.dateReceived || '',
          personalDetails:   row.personalDetails || '',
          response_details:  row.response_details || '',
          status:            row.status || 'null',
          ai_score:          row.ai_score || 0,
          genuine_score:     row.genuine_score || 0,
          ai_confidence:     row.ai_confidence || '',
          risk_level:        row.risk_level || 'Medium',
          submission_status: row.submission_status || (row.ai_checked ? 'AI_VERIFIED' : 'IN_REVIEW'),
          ai_checked:        !!row.ai_checked,
          campaign_match:    !!row.campaign_match,
          matched_pattern:   row.matched_pattern ? row.matched_pattern.split(',').map(s => s.trim()) : [],
          ai_result: {
            verdict:       row.ai_result || '',
            is_expired:    !!row.is_expired,
            protective_guidance: guidance,
            evidence:      row.ai_evidence || '',
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

    console.log('\n\n✨ Sync Complete!');
    console.log(`✅ Synced:  ${synced}`);
    console.log(`⏩ Skipped: ${skipped} (already exist)`);
    console.log(`❌ Failed:  ${failed}`);

  } catch (err) {
    console.error('💥 Fatal Sync Error:', err.message);
  } finally {
    db.close();
    mongoose.connection.close();
  }
}

sync();
