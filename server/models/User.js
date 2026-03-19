/**
 * models/User.js
 *
 * Phase 2 — MongoDB Schema Design
 * Replaces the `users` SQLite table.
 *
 * COMPATIBILITY RULES:
 *  - Virtual `id` = _id.toString()
 *  - is_profile_complete as Boolean (was INTEGER 0/1 in SQLite)
 *  - Email normalized to lowercase on save
 */

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────────────────────────────────
    name:  { type: String, default: '' },
    email: {
      type: String,
      required: true,
      unique: true,  // One document per email
      index: true,
      trim: true,
      lowercase: true, // Normalizes on storage
    },

    // ── Profile fields ────────────────────────────────────────────────────────
    college_name:        { type: String, default: '' },
    user_role:           { type: String, default: 'Student' },
    year_of_study:       { type: String, default: '' },
    is_profile_complete: { type: Boolean, default: false },

    // ── SQLite migration bridge (optional) ───────────────────────────────────
    sqlite_id: { type: Number, default: null, index: true },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Virtual: id = _id.toString() ────────────────────────────────────────────
UserSchema.virtual('id').get(function () {
  return this._id.toString();
});

// ─── Pre-save middleware: normalize email to lowercase ────────────────────────
UserSchema.pre('save', function (next) {
  if (this.email) {
    this.email = this.email.toLowerCase().trim();
  }
  next();
});

// ─── Pre-update middleware: normalize email on findOneAndUpdate ───────────────
UserSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function (next) {
  const update = this.getUpdate();
  if (update?.email) {
    update.email = update.email.toLowerCase().trim();
  }
  if (update?.$set?.email) {
    update.$set.email = update.$set.email.toLowerCase().trim();
  }
  next();
});

module.exports = mongoose.model('User', UserSchema);
