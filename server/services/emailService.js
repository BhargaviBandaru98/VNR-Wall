'use strict';

const nodemailer = require('nodemailer');

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

// Support both ADMIN_EMAIL_LIST (new) and ADMIN_EMAILS (legacy) env keys
const ADMIN_EMAILS = (process.env.ADMIN_EMAIL_LIST || process.env.ADMIN_EMAILS || '')
    .split(',').map(e => e.trim()).filter(Boolean);

if (!EMAIL_USER || !EMAIL_PASS) {
    console.warn('[emailService] EMAIL_USER or EMAIL_PASS not set — admin alerts will be skipped.');
}
if (ADMIN_EMAILS.length === 0) {
    console.warn('[emailService] No admin emails configured (ADMIN_EMAIL_LIST is empty).');
} else {
    console.log('[emailService] Admin alert list:', ADMIN_EMAILS.join(', '));
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
 * @param {{ fake_score, genuine_score, result, confidence, evidence, genuine_evidence }} aiResult
 * @param {string} investigationPath
 */
async function sendAdminAlert(submissionData, aiResult, investigationPath) {
    const t = getTransporter();
    if (!t || ADMIN_EMAILS.length === 0) {
        console.warn('[emailService] Skipping alert — transporter not configured or no admin emails.');
        return;
    }

    const { id, name, roll, branch, message, category, platform, sender } = submissionData;
    const { fake_score, genuine_score, result, confidence, evidence, genuine_evidence } = aiResult;

    const subject = `⚠️ VNR Wall Alert — Suspicious ${category || 'submission'} needs review (ID: #${id})`;

    const scoreColor = fake_score >= 80 ? '#c0392b' : fake_score >= 60 ? '#e67e22' : '#27ae60';

    const html = `
<div style="font-family:Arial,sans-serif;max-width:660px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
  <div style="background:#c0392b;padding:18px 24px;">
    <h2 style="color:#fff;margin:0;">⚠️ Suspicious Submission — Manual Review Required</h2>
    <p style="color:#f8d7da;margin:4px 0 0;">VNR Wall Automated Verification System</p>
  </div>
  <div style="padding:24px;">

    <!-- Submission Details -->
    <h3 style="color:#333;margin:0 0 10px;">📋 Submission Details</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
      <tr style="background:#f5f5f5;"><td style="padding:8px 10px;color:#555;width:150px;"><b>Submission ID</b></td><td style="padding:8px 10px;font-weight:bold;font-size:16px;">#${id}</td></tr>
      <tr><td style="padding:8px 10px;color:#555;"><b>Reporter</b></td><td style="padding:8px 10px;">${name || '—'} &nbsp;|&nbsp; Roll: ${roll || '—'} &nbsp;|&nbsp; Branch: ${branch || '—'}</td></tr>
      <tr style="background:#f5f5f5;"><td style="padding:8px 10px;color:#555;"><b>Category</b></td><td style="padding:8px 10px;">${category || '—'}</td></tr>
      <tr><td style="padding:8px 10px;color:#555;"><b>Platform</b></td><td style="padding:8px 10px;">${platform || '—'}</td></tr>
      <tr style="background:#f5f5f5;"><td style="padding:8px 10px;color:#555;"><b>Sender</b></td><td style="padding:8px 10px;">${sender || '—'}</td></tr>
    </table>

    <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">

    <!-- AI Verdict -->
    <h3 style="color:#c0392b;margin:0 0 10px;">🤖 AI Investigation Verdict</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
      <tr style="background:#fff5f5;"><td style="padding:8px 10px;color:#555;width:150px;"><b>Fake Score</b></td><td style="padding:8px 10px;"><span style="font-size:20px;font-weight:bold;color:${scoreColor};">${fake_score}/100</span></td></tr>
      <tr><td style="padding:8px 10px;color:#555;"><b>Genuine Score</b></td><td style="padding:8px 10px;"><span style="font-size:16px;font-weight:bold;color:#27ae60;">${genuine_score !== undefined ? genuine_score + '/100' : 'N/A'}</span></td></tr>
      <tr style="background:#f5f5f5;"><td style="padding:8px 10px;color:#555;"><b>AI Result</b></td><td style="padding:8px 10px;font-weight:bold;">${result}</td></tr>
      <tr><td style="padding:8px 10px;color:#555;"><b>Confidence</b></td><td style="padding:8px 10px;">${confidence}</td></tr>
      <tr style="background:#f5f5f5;"><td style="padding:8px 10px;color:#555;"><b>Fake Evidence</b></td><td style="padding:8px 10px;">${evidence || '—'}</td></tr>
      <tr><td style="padding:8px 10px;color:#555;"><b>Genuine Evidence</b></td><td style="padding:8px 10px;">${genuine_evidence || '—'}</td></tr>
      <tr style="background:#f5f5f5;"><td style="padding:8px 10px;color:#555;"><b>Investigation Path</b></td><td style="padding:8px 10px;"><i>${investigationPath}</i></td></tr>
    </table>

    <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">

    <!-- Original Message -->
    <h3 style="margin:0 0 8px;">💬 Original Message</h3>
    <div style="background:#f9f9f9;padding:12px;border-left:4px solid #c0392b;font-size:13px;white-space:pre-wrap;word-break:break-word;">${(message || '').substring(0, 1200)}</div>

    <p style="margin:20px 0 0;font-size:12px;color:#aaa;text-align:center;">Sent by VNR Wall Automated Verification System &nbsp;·&nbsp; Log in to Admin Panel to take action</p>
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
