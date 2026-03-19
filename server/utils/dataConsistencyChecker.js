/**
 * VNR Wall — Data Consistency Checker (Phase 4, Step 3)
 * Verifies that SQLite and MongoDB contain identical data for a given submission.
 */
'use strict';

const logger = require('./logger');

// Fields that must match between SQLite and MongoDB
const COMPARABLE_FIELDS = [
  { sqlite: 'message',           mongo: 'message' },
  { sqlite: 'user_email',        mongo: 'user_email' },
  { sqlite: 'status',            mongo: 'status' },
  { sqlite: 'ai_score',          mongo: 'ai_score' },
  { sqlite: 'ai_result',         mongo: 'ai_result.verdict' },
  { sqlite: 'ai_confidence',     mongo: 'ai_confidence' },
  { sqlite: 'risk_level',        mongo: 'risk_level' },
  { sqlite: 'submission_status', mongo: 'submission_status' },
  { sqlite: 'genuine_score',     mongo: 'genuine_score' },
  { sqlite: 'verified_by_admin', mongo: 'verified_by_admin' },
  { sqlite: 'final_result',      mongo: 'final_result' },
];

/**
 * Safely get a nested value from an object using dot notation.
 * @param {Object} obj
 * @param {string} path  e.g. "ai_result.verdict"
 * @returns {*}
 */
function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc != null ? acc[key] : undefined), obj);
}

/**
 * Normalise a value for comparison — coerce numbers/strings/null consistently.
 * @param {*} val
 * @returns {string}
 */
function normalise(val) {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'boolean') return String(val);
  return String(val).trim();
}

/**
 * Compare a SQLite record with a MongoDB document.
 * @param {Object} sqliteRecord — row from datacheck
 * @param {Object} mongoRecord  — Mongoose document (plain object or .toObject())
 * @returns {{ isConsistent: boolean, differences: Array<{field, sqlite, mongo}> }}
 */
function compareRecord(sqliteRecord, mongoRecord) {
  const differences = [];

  for (const { sqlite, mongo } of COMPARABLE_FIELDS) {
    const sqliteVal = normalise(sqliteRecord[sqlite]);
    const mongoVal  = normalise(getByPath(mongoRecord, mongo));

    if (sqliteVal !== mongoVal) {
      differences.push({ field: `${sqlite} / ${mongo}`, sqlite: sqliteVal, mongo: mongoVal });
    }
  }

  const isConsistent = differences.length === 0;

  if (isConsistent) {
    logger.logInfo('Consistency check PASSED', { sqlite_id: sqliteRecord.id });
  } else {
    logger.logError('Consistency check FAILED', {
      sqlite_id: sqliteRecord.id,
      differences,
    });
  }

  return { isConsistent, differences };
}

module.exports = { compareRecord };
