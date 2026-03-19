/**
 * models/LearningRule.js
 *
 * Phase 6 Step 1 — Schema Normalization & Stabilization
 * Replaces the `agent_learning_rules` SQLite table.
 *
 * DESIGN DECISIONS:
 *  - submission_id is a soft-reference String (mirrors SQLite soft FK).
 *    This prevents orphan-doc errors if a submission is migrated or deleted.
 *  - admin_decision uses strict enum: 'SCAM' | 'GENUINE'.
 *  - is_active as Boolean (was INTEGER 0/1 in SQLite).
 *  - Virtual `id` exposes Mongo _id as string for frontend compatibility.
 */

'use strict';

const mongoose = require('mongoose');

const LearningRuleSchema = new mongoose.Schema(
  {
    // ── Soft reference to submission (no enforced FK — same as SQLite) ────────
    submission_id: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    // ── Rule content ──────────────────────────────────────────────────────────
    pattern: {
      type: String,
      required: [true, 'Pattern is required'],
      trim: true,
      minlength: [3, 'Pattern must be at least 3 characters'],
    },
    admin_decision: {
      type: String,
      required: [true, 'admin_decision is required'],
      enum: {
        values: ['SCAM', 'GENUINE'],
        message: '"{VALUE}" is not a valid decision. Must be SCAM or GENUINE.',
      },
    },
    admin_reason: {
      type: String,
      default: '',
      trim: true,
    },

    // ── Control ───────────────────────────────────────────────────────────────
    is_active: { type: Boolean, default: true, index: true },

    // ── SQLite migration bridge (optional) ───────────────────────────────────
    sqlite_id: { type: Number, default: null, index: true },
  },
  {
    timestamps: true,            // Provides createdAt + updatedAt automatically
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Virtual: id = _id.toString() for frontend compatibility ──────────────────
LearningRuleSchema.virtual('id').get(function () {
  return this._id.toString();
});

// ─── Compound index: active rules query (AI Injection) ───────────────────────
// Mirrors: SELECT * FROM agent_learning_rules WHERE is_active = 1 ORDER BY created_at DESC LIMIT 20
LearningRuleSchema.index({ is_active: 1, createdAt: -1 });

// ─── Compound index: rule lookup by submission ────────────────────────────────
LearningRuleSchema.index({ submission_id: 1, is_active: 1 });

module.exports = mongoose.model('LearningRule', LearningRuleSchema);
