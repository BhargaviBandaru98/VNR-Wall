/**
 * models/LearningRule.js
 *
 * Phase 2 — MongoDB Schema Design
 * Replaces the `agent_learning_rules` SQLite table.
 *
 * DESIGN DECISION:
 *  - submission_id is NOT a strict ObjectId ref (mirrors SQLite's soft FK).
 *    This prevents orphan-doc errors if a submission is migrated or deleted.
 *  - is_active as Boolean (was INTEGER 0/1 in SQLite).
 */

const mongoose = require('mongoose');

const LearningRuleSchema = new mongoose.Schema(
  {
    // ── Soft reference to submission (no enforced FK — same as SQLite) ────────
    submission_id: { type: String, default: null, index: true },

    // ── Rule content ──────────────────────────────────────────────────────────
    pattern:        { type: String, required: true },
    admin_decision: { type: String, enum: ['SCAM', 'GENUINE'], required: true },
    admin_reason:   { type: String, default: '' },

    // ── Control ───────────────────────────────────────────────────────────────
    is_active: { type: Boolean, default: true, index: true },

    // ── SQLite migration bridge (optional) ───────────────────────────────────
    sqlite_id: { type: Number, default: null, index: true },
  },
  {
    timestamps: true,             // createdAt replaces the manual `created_at` TEXT field
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Virtual: id = _id.toString() ────────────────────────────────────────────
LearningRuleSchema.virtual('id').get(function () {
  return this._id.toString();
});

// ─── Index for rule injection query ─────────────────────────────────────────
// Mirrors: SELECT * FROM agent_learning_rules WHERE is_active = 1 ORDER BY created_at DESC LIMIT 20
LearningRuleSchema.index({ is_active: 1, createdAt: -1 });

module.exports = mongoose.model('LearningRule', LearningRuleSchema);
