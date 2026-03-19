/**
 * config/mongo.js
 *
 * Phase 1 — MongoDB Parallel Setup
 *
 * RULES:
 *  - MUST NOT crash the server if MongoDB is unavailable
 *  - SQLite remains the ONLY active database in Phase 1
 *  - Exports isMongoConnected flag for future phases to check
 */

const mongoose = require('mongoose');

let isMongoConnected = false;

async function connectMongo() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.warn('[MongoDB] ⚠️  MONGO_URI not set — skipping MongoDB connection. SQLite remains active.');
    return;
  }

  try {
    await mongoose.connect(uri, {
      maxPoolSize: 10,         // Connection pool for scalability
      serverSelectionTimeoutMS: 5000, // Fail fast — don't block server startup
      socketTimeoutMS: 45000,
    });

    isMongoConnected = true;
    console.log('[MongoDB] ✅ MongoDB connected successfully.');
  } catch (err) {
    isMongoConnected = false;
    console.error('[MongoDB] ❌ MongoDB connection failed — falling back to SQLite.', err.message);
    // DO NOT re-throw — server must continue running
  }
}

// Listen for future disconnection events (non-fatal)
mongoose.connection.on('disconnected', () => {
  isMongoConnected = false;
  console.warn('[MongoDB] ⚠️  MongoDB disconnected. SQLite remains active.');
});

mongoose.connection.on('reconnected', () => {
  isMongoConnected = true;
  console.log('[MongoDB] ✅ MongoDB reconnected.');
});

module.exports = { connectMongo, mongoose, isMongoConnected: () => isMongoConnected };
