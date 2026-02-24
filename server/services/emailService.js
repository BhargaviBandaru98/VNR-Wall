'use strict';

const nodemailer = require('nodemailer');

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

if (!EMAIL_USER || !EMAIL_PASS) {
    console.warn('[emailService] EMAIL_USER or EMAIL_PASS not set — admin alerts will be skipped.');
}

// Create transporter lazily so missing credentials only warn, never crash
let transporter = null;
function getTransporter() {
    if (!transporter && EMAIL_USER && EMAIL_PASS) {
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: EMAIL_USER, pass: EMAIL_PASS },
        });
    }
    return transporter;
}

/**
 * Sends an admin alert email for submissions that need manual review.
 * @param {{ id, name, roll, branch, message, category, platform, sender }} submissionData
 * @param {{ fake_score, result, confidence, evidence }} aiResult
 * @param {string} investigationPath - e.g. "Web Risk Pass → AI Investigated → Admin Notified"
 * @returns {Promise<void>}
 */
async function sendAdminAlert(submissionData, aiResult, investigationPath) {
    const t = getTransporter();
    if (!t || ADMIN_EMAILS.length === 0) {
        console.warn('[emailService] Skipping alert — transporter not configured or no admin emails.');
        return;
    }

    const { id, name, roll, branch, message, category, platform, sender } = submissionData;
    const { fake_score, result, confidence, evidence } = aiResult;

    const subject = `⚠️ VNR Wall Alert — Suspicious ${category || 'submission'} needs review (ID: ${id})`;

    const html = `
<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
  <div style="background:#c0392b;padding:18px 24px;">
    <h2 style="color:#fff;margin:0;">⚠️ Suspicious Submission Flagged</h2>
    <p style="color:#f8d7da;margin:4px 0 0;">VNR Wall Verification System — Manual Review Required</p>
  </div>
  <div style="padding:24px;">
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:6px 0;color:#555;width:140px;"><b>Submission ID</b></td><td>#${id}</td></tr>
      <tr><td style="padding:6px 0;color:#555;"><b>Reporter</b></td><td>${name || '—'} (${roll || '—'}, ${branch || '—'})</td></tr>
      <tr><td style="padding:6px 0;color:#555;"><b>Category</b></td><td>${category || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#555;"><b>Platform</b></td><td>${platform || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#555;"><b>Sender</b></td><td>${sender || '—'}</td></tr>
    </table>

    <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">

    <h3 style="color:#c0392b;margin:0 0 8px;">AI Verdict</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:6px 0;color:#555;width:140px;"><b>Score</b></td><td><span style="font-size:18px;font-weight:bold;color:#c0392b;">${fake_score}/100</span></td></tr>
      <tr><td style="padding:6px 0;color:#555;"><b>Result</b></td><td>${result}</td></tr>
      <tr><td style="padding:6px 0;color:#555;"><b>Confidence</b></td><td>${confidence}</td></tr>
      <tr><td style="padding:6px 0;color:#555;"><b>Evidence</b></td><td>${evidence}</td></tr>
      <tr><td style="padding:6px 0;color:#555;"><b>Investigation</b></td><td><i>${investigationPath}</i></td></tr>
    </table>

    <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">

    <h3 style="margin:0 0 8px;">Original Message</h3>
    <div style="background:#f9f9f9;padding:12px;border-left:4px solid #c0392b;font-size:13px;white-space:pre-wrap;word-break:break-word;">${(message || '').substring(0, 1000)}</div>

    <p style="margin:20px 0 0;font-size:12px;color:#aaa;">Sent by VNR Wall Automated Verification System</p>
  </div>
</div>
`;

    try {
        await t.sendMail({
            from: `"VNR Wall Alert" <${EMAIL_USER}>`,
            to: ADMIN_EMAILS.join(', '),
            subject,
            html,
        });
        console.log('[emailService] ✅ Admin alert sent for ID:', id, '→', ADMIN_EMAILS.join(', '));
    } catch (err) {
        console.error('[emailService] ❌ Failed to send alert for ID:', id, '—', err.message);
    }
}

/**
 * Verify SMTP connection at startup.
 * Returns true if connection succeeds, false otherwise.
 */
async function verifyConnection() {
    const t = getTransporter();
    if (!t) return false;
    try {
        await t.verify();
        console.log('[emailService] ✅ SMTP connection verified.');
        return true;
    } catch (err) {
        console.error('[emailService] ❌ SMTP connection failed:', err.message);
        return false;
    }
}

module.exports = { sendAdminAlert, verifyConnection };
