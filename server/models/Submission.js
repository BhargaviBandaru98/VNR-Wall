/**
 * models/Submission.js
 *
 * Phase 2 — MongoDB Schema Design
 * Replaces the `datacheck` SQLite table.
 *
 * COMPATIBILITY RULES:
 *  - Virtual `id` = _id.toString() so frontend never sees _id directly
 *  - Flat compat fields (ai_score, genuine_score, ai_confidence) preserved
 *  - All array fields default to [] to prevent frontend .map() crashes
 *  - ai_evidence/genuine_evidence are REPLACED by structured ai_result sub-doc
 */

const mongoose = require('mongoose');

// ─── Evidence item sub-schema ──────────────────────────────────────────────────
const EvidenceItemSchema = new mongoose.Schema(
  {
    text: { type: String, default: '' },
    type: {
      type: String,
      enum: ['positive', 'negative', 'warning'],
      default: 'warning',
    },
  },
  { _id: false } // No separate IDs for sub-documents
);

// ─── AI Result sub-schema ─────────────────────────────────────────────────────
const AIResultSchema = new mongoose.Schema(
  {
    scam_score:    { type: Number, min: 0, max: 100, default: 0 },
    genuine_score: { type: Number, min: 0, max: 100, default: 0 },
    confidence:    { type: String, enum: ['HIGH', 'MEDIUM', 'LOW', ''], default: '' },
    risk_level:    { type: String, enum: ['Low', 'Medium', 'High', 'Critical', ''], default: '' },
    verdict:       { type: String, enum: ['SCAM', 'GENUINE', 'SUSPICIOUS', 'UNKNOWN', ''], default: '' },
    is_expired:    { type: Boolean, default: false },

    // Structured evidence — replaces raw ai_evidence and genuine_evidence strings
    evidence_analysis: {
      type: [EvidenceItemSchema],
      default: [],
    },

    // Safety tips — replaces JSON-stringified protective_guidance
    protective_guidance: {
      type: [String],
      default: [],
    },

    // Admin's final override (separate from AI verdict)
    final_verdict: { type: String, default: '' },
  },
  { _id: false }
);

// ─── Main Submission Schema ───────────────────────────────────────────────────
const SubmissionSchema = new mongoose.Schema(
  {
    // ── Core submission fields ────────────────────────────────────────────────
    message:         { type: String, required: true, index: 'text' }, // Full-text index
    dateReceived:    { type: String, default: '' },
    personalDetails: { type: String, default: '' },
    response_details:{ type: String, default: '' },
    user_email:      { type: String, index: true, default: '' },      // Performance index

    // ── Workflow state ────────────────────────────────────────────────────────
    // status:            display value consumed by frontend: 'Genuine' | 'Scam' | 'null'
    // submission_status: workflow value:  'AI_VERIFIED' | 'IN_REVIEW' | 'ADMIN_VERIFIED'
    status:            { type: String, default: 'null' },
    submission_status: { type: String, enum: ['AI_VERIFIED', 'IN_REVIEW', 'ADMIN_VERIFIED', ''], default: '' },
    marked_by:         { type: String, enum: ['auto', 'admin', ''], default: '' },
    ai_checked:        { type: Boolean, default: false },

    // ── Notification flags ────────────────────────────────────────────────────
    send_email_notification: { type: Boolean, default: false },
    notification_requested:  { type: Boolean, default: false },

    // ── Structured AI result ──────────────────────────────────────────────────
    ai_result: { type: AIResultSchema, default: () => ({}) },

    // ── Backward-compatibility flat fields (used by existing frontend) ────────
    // These mirror fields inside ai_result for zero-migration frontend reads.
    ai_score:      { type: Number, min: 0, max: 100, default: 0 },
    genuine_score: { type: Number, min: 0, max: 100, default: 0 },
    ai_confidence: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW', ''], default: '' },
    risk_level:    { type: String, default: '' },
    is_expired:    { type: Boolean, default: false },

    // ── Admin decision fields ─────────────────────────────────────────────────
    final_result:          { type: String, default: null },
    admin_reason:          { type: String, default: null },
    verified_by_admin:     { type: Boolean, default: false },
    verification_timestamp:{ type: Date,   default: null },

    // ── Campaign detection ────────────────────────────────────────────────────
    campaign_match: { type: Boolean, default: false },
    matched_pattern: {
      type: [String],
      default: [],
    },

    // ── SQLite migration bridge (optional) ───────────────────────────────────
    // Store original SQLite row ID during dual-write migration phase
    sqlite_id: { type: Number, default: null, index: true },
  },
  {
    timestamps: true,              // Adds createdAt + updatedAt automatically
    toJSON:   { virtuals: true },  // Virtual `id` included in res.json()
    toObject: { virtuals: true },
  }
);

// ─── Virtual: id = _id.toString() ────────────────────────────────────────────
SubmissionSchema.virtual('id').get(function () {
  return this._id.toString();
});

// ─── Compound index for admin in-review query ─────────────────────────────────
// Mirrors: SELECT * FROM datacheck WHERE submission_status = 'IN_REVIEW' AND verified_by_admin = 0
SubmissionSchema.index({ submission_status: 1, verified_by_admin: 1 });

// ─── Index for deduplication query (identical message lookup) ────────────────
SubmissionSchema.index({ message: 1, ai_checked: 1 });

// ─── Index for user dashboard query ──────────────────────────────────────────
SubmissionSchema.index({ user_email: 1, createdAt: -1 });

module.exports = mongoose.model('Submission', SubmissionSchema);
