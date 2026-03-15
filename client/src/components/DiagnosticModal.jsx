import React, { useState } from 'react';
import { Shield, AlertTriangle, CheckCircle2, Info, ArrowRight, X, Bell, UserSearch, Clock } from 'lucide-react';
import axios from 'axios';
import '../styles/DiagnosticModal.css';
import '../styles/Stepper.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:6105';

// ─── Thresholds (DO NOT CHANGE) ───────────────────────────────────────────────
const SCAM_THRESHOLD    = 70;
const GENUINE_THRESHOLD = 70;

// ─── Safe JSON parse helper ───────────────────────────────────────────────────
function parseGuidance(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [String(parsed)];
    } catch {
        // If it's a plain string like "tip1; tip2", split on semicolon
        return raw.split(/[;|]\s*/).map(s => s.trim()).filter(Boolean);
    }
}

const DiagnosticModal = ({ isOpen, onClose, data }) => {
    const [isCollapsed, setIsCollapsed]   = useState(false);
    const [notifyEnabled, setNotifyEnabled] = useState(false);
    const [notifyLoading, setNotifyLoading] = useState(false);
    const [showRescue, setShowRescue]     = useState(false);

    if (!isOpen || !data) return null;

    // ── Score resolution ──────────────────────────────────────────────────────
    const scam_score    = data.ai_score    ?? data.scam_score    ?? 0;
    const genuine_score = data.genuine_score ?? (100 - scam_score);
    const confidence    = data.ai_confidence ?? data.confidence ?? null;

    // ── Verdict routing (threshold-based — 70%) ───────────────────────────────
    const isClearScam    = scam_score    >= SCAM_THRESHOLD;
    const isClearGenuine = !isClearScam && genuine_score >= GENUINE_THRESHOLD;
    const isInReview     = !isClearScam && !isClearGenuine;

    // ── Expiry check ──────────────────────────────────────────────────────────
    const submissionDate = data.dateReceived
        ? new Date(data.dateReceived.split('-').reverse().join('-'))
        : new Date();
    const daysOld  = Math.floor((new Date() - submissionDate) / (1000 * 60 * 60 * 24));
    const isExpired = data.isExpired || data.is_expired || daysOld > 30;

    // ── Notification dedup guard ──────────────────────────────────────────────
    // Covers both: checkbox ticked at submission (send_email_notification=1)
    // and notify-request already flagged via (notification_requested=1)
    const alreadyNotified =
        data.send_email_notification === 1   ||
        data.send_email_notification === true ||
        data.notification_requested  === 1   ||
        data.notification_requested  === true ||
        notifyEnabled;

    // ── Evidence text ─────────────────────────────────────────────────────────
    const evidenceText = isClearScam
        ? (data.ai_evidence      || 'No scam evidence recorded.')
        : isClearGenuine
        ? (data.genuine_evidence || 'No authenticity evidence recorded.')
        : 'AI analysis is inconclusive and requires human verification.';

    // ── Guidance list ─────────────────────────────────────────────────────────
    const guidanceTips = parseGuidance(data.protective_guidance);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleOk = () => {
        setIsCollapsed(true);
        setTimeout(onClose, 600);
    };

    const handleNotifyMe = async () => {
        if (alreadyNotified) return;
        setNotifyLoading(true);
        try {
            await axios.put(`${BACKEND_URL}/api/notify-request/${data.id}`);
            setNotifyEnabled(true);
        } catch (err) {
            console.error('Failed to enable notification', err);
        } finally {
            setNotifyLoading(false);
        }
    };

    const handleProceedToApply = () => {
        const text     = data.message || data.messageContent || '';
        const urlMatch = text.match(/https?:\/\/[^\s]+/i);
        if (urlMatch) window.open(urlMatch[0], '_blank', 'noopener,noreferrer');
    };

    return (
        <div className={`diagnostic-overlay ${isOpen ? 'active' : ''} ${isCollapsed ? 'collapsing' : ''}`}>
            <div className="diagnostic-modal-content glass-effect">
                <button className="close-x" onClick={onClose}><X size={20} /></button>

                {/* ── Header Badge ──────────────────────────────────────────── */}
                <header className="modal-forensic-header">
                    <div className="verdict-badge">
                        <span className="shield-icon">🛡️</span>
                        SYSTEM VERDICT
                    </div>
                    {isExpired && <div className="expired-badge">DATA EXPIRED ({daysOld}d)</div>}
                </header>

                {/* ════════════════════════════════════════════════════════════
                    LAYOUT ORDER (per spec):
                    1️⃣  Result Header  (banner)
                    2️⃣  Probability    (scam/genuine only)
                    3️⃣  Verification Confidence
                    4️⃣  Verification Evidence
                    5️⃣  Safety Tips
                    6️⃣  Action Buttons
                ════════════════════════════════════════════════════════════ */}

                {/* 1️⃣  Result Header Banner */}
                {isClearScam && (
                    <div className="verdict-banner verdict-banner--scam">
                        <AlertTriangle size={26} />
                        <div>
                            <p className="verdict-banner__headline">⚠️ This message is likely a SCAM.</p>

                            {/* 2️⃣  Probability — Scam */}
                            <p className="verdict-banner__sub">
                                Scam Probability: <strong>{scam_score}%</strong>
                            </p>
                            <div className="probability-bar-wrapper">
                                <div className="probability-bar probability-bar--scam" style={{ width: `${scam_score}%` }} />
                            </div>
                        </div>
                    </div>
                )}

                {isClearGenuine && (
                    <div className="verdict-banner verdict-banner--genuine">
                        <CheckCircle2 size={26} />
                        <div>
                            <p className="verdict-banner__headline">✔️ This message appears to be GENUINE.</p>

                            {/* 2️⃣  Probability — Genuine */}
                            <p className="verdict-banner__sub">
                                Authenticity Probability: <strong>{genuine_score}%</strong>
                            </p>
                            <div className="probability-bar-wrapper">
                                <div className="probability-bar probability-bar--genuine" style={{ width: `${genuine_score}%` }} />
                            </div>
                        </div>
                    </div>
                )}

                {isInReview && (
                    <div className="verdict-banner verdict-banner--review">
                        <Clock size={26} />
                        <div>
                            <p className="verdict-banner__headline">🔍 This message is currently UNDER REVIEW.</p>
                            {/* ❗ NO percentages for In-Review per spec */}
                            <p className="verdict-banner__sub">
                                Our AI requires manual verification for this message.
                            </p>
                        </div>
                    </div>
                )}

                {/* In-Review step progress */}
                {isInReview && (
                    <div className="in-review-stepper">
                        <div className="step completed">
                            <div className="step-icon"><CheckCircle2 size={18} /></div>
                            <span className="step-label">Submitted</span>
                        </div>
                        <div className="step-line active" />
                        <div className="step completed">
                            <div className="step-icon"><CheckCircle2 size={18} /></div>
                            <span className="step-label">AI Analysis</span>
                        </div>
                        <div className="step-line active" />
                        <div className="step active pulsing">
                            <div className="step-icon"><UserSearch size={18} /></div>
                            <span className="step-label">Admin Review</span>
                        </div>
                    </div>
                )}

                {/* 3️⃣  Verification Confidence — shown in ALL verdict types */}
                {confidence && (
                    <div className={`confidence-strip confidence-strip--${confidence.toLowerCase()}`}>
                        <Shield size={14} />
                        <span>Verification Confidence: <strong>{confidence.toUpperCase()}</strong></span>
                    </div>
                )}

                {/* ── Side-by-side raw score panels (visual reference) ─────── */}
                <section className="verdict-comparison">
                    <div className={`verdict-panel scam-panel ${isClearScam ? 'active-verdict' : 'dimmed'}`}>
                        <div className="panel-header">
                            <AlertTriangle className="icon-scam" />
                            <h3>SCAM RISK</h3>
                        </div>
                        <div className="probability-meter">
                            <div className="meter-fill scam-fill" style={{ width: `${isClearScam ? scam_score : 0}%` }} />
                            <span className="meter-value">{isClearScam ? scam_score : '--'}% Risk</span>
                        </div>
                        <p className="panel-desc">High-risk forensic markers detected.</p>
                    </div>

                    <div className={`verdict-panel genuine-panel ${isClearGenuine ? 'active-verdict' : 'dimmed'}`}>
                        <div className="panel-header">
                            <CheckCircle2 className="icon-genuine" />
                            <h3>GENUINE</h3>
                        </div>
                        <div className="probability-meter">
                            <div className="meter-fill genuine-fill" style={{ width: `${isClearGenuine ? genuine_score : 0}%` }} />
                            <span className="meter-value">{isClearGenuine ? genuine_score : '--'}% Trusted</span>
                        </div>
                        <p className="panel-desc">Verified via official portals & metadata.</p>
                    </div>
                </section>

                {/* 4️⃣  Verification Evidence */}
                <section className="forensic-evidence-section">
                    <h4 className="section-label">
                        {isClearScam ? '🔴 Scam Evidence' : isClearGenuine ? '🟢 Authenticity Evidence' : '🔵 Verification Evidence'}
                    </h4>
                    <div className="evidence-glass-card">
                        {isClearScam || isClearGenuine ? (
                            <ul className="evidence-list">
                                {evidenceText
                                    .split(/(?<=\w\.)\s+/)
                                    .filter(Boolean)
                                    .map((bullet, idx) => (
                                        <li key={idx}>{bullet}</li>
                                    ))}
                            </ul>
                        ) : (
                            <div className="in-review-evidence">
                                <Info size={16} />
                                <span>{evidenceText}</span>
                            </div>
                        )}
                    </div>
                </section>

                {/* 5️⃣  Safety Tips */}
                {guidanceTips.length > 0 && (
                    <section className="safety-tips-section">
                        <h4 className="section-label">🛡️ Safety Tips</h4>
                        <div className="evidence-glass-card">
                            <ul className="safety-tips-list">
                                {guidanceTips.map((tip, idx) => (
                                    <li key={idx}>{tip}</li>
                                ))}
                            </ul>
                        </div>
                    </section>
                )}

                {/* 6️⃣  Action Buttons */}
                <footer className="modal-actions">

                    {/* Phase 2: Notify Me — ONLY for In-Review */}
                    {isInReview && (
                        <button
                            className={`rescue-btn notify-me-btn ${alreadyNotified ? 'notify-me-btn--active' : ''}`}
                            onClick={handleNotifyMe}
                            disabled={alreadyNotified}
                            title={alreadyNotified ? 'You already requested notification.' : 'Get notified when this is verified.'}
                        >
                            <Bell size={18} />
                            <span>
                                {notifyLoading
                                    ? 'ENABLING...'
                                    : alreadyNotified
                                    ? '🔔 Notification Enabled'
                                    : 'NOTIFY ME WHEN VERIFIED'}
                            </span>
                        </button>
                    )}

                    {/* Rescue Steps — Critical Scam only */}
                    {isClearScam && data.risk_level?.toUpperCase() === 'CRITICAL' && (
                        <button className="rescue-btn" onClick={() => setShowRescue(!showRescue)}>
                            <span>{showRescue ? 'HIDE RESCUE STEPS' : 'WHAT DO I DO NOW?'}</span>
                            <ArrowRight size={18} />
                        </button>
                    )}

                    {showRescue && isClearScam && data.risk_level?.toUpperCase() === 'CRITICAL' && (
                        <div className="rescue-panel">
                            <h4>🚨 IMMEDIATE RESCUE STEPS</h4>
                            <ul>
                                {guidanceTips.length > 0
                                    ? guidanceTips.map((tip, idx) => <li key={idx}>{tip}</li>)
                                    : (
                                        <>
                                            <li>Do not pay any fees or share bank details.</li>
                                            <li>Block the sender on all platforms immediately.</li>
                                            <li>Report to your institution's cybercell.</li>
                                            <li>If you shared credentials, change all passwords.</li>
                                        </>
                                    )}
                            </ul>
                        </div>
                    )}

                    {/* Proceed to Apply — Genuine only */}
                    {isClearGenuine && (
                        <button
                            className="rescue-btn"
                            style={{ background: '#10b981', boxShadow: '0 10px 20px -5px rgba(16,185,129,0.4)' }}
                            onClick={handleProceedToApply}
                        >
                            <span>PROCEED TO APPLY / VIEW OFFICIAL LINK</span>
                            <ArrowRight size={18} />
                        </button>
                    )}

                    <button className="ok-btn" onClick={handleOk}>OK, UNDERSTOOD</button>
                </footer>
            </div>
        </div>
    );
};

export default DiagnosticModal;
