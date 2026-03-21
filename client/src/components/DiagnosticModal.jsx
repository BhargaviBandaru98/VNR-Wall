import React, { useState } from 'react';
import { Shield, AlertTriangle, CheckCircle2, Info, ArrowRight, X, Bell, UserSearch, Clock, ShieldCheck, AlertCircle } from 'lucide-react';
import axios from 'axios';
import '../styles/DiagnosticModal.css';
import '../styles/Stepper.css';


const DiagnosticModal = ({ isOpen, onClose, data }) => {
    const [isCollapsed, setIsCollapsed]   = useState(false);
    const [notifyEnabled, setNotifyEnabled] = useState(data?.notification_requested || false);
    const [notifyLoading, setNotifyLoading] = useState(false);
    const [showRescue, setShowRescue]     = useState(false);

    if (!isOpen || !data) return null;

    // ── Safe Data Extraction ──────────────────────────────────────────────────
    const aiResult = data?.ai_result;
    const requestorRole = data?.requestor_role || 'user';
    const isAdmin = requestorRole.toLowerCase() === 'admin';

    // ── Loading / Missing State ───────────────────────────────────────────────
    if (!aiResult && !data?.verified_by_admin && !data?.status) {
        return (
            <div className={`diagnostic-overlay ${isOpen ? 'active' : ''}`}>
                <div className="diagnostic-modal-content glass-effect" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
                    <div className="safety-pulse">
                        <div className="pulse-spinner" style={{ borderColor: '#2563eb transparent #2563eb transparent' }}></div>
                        <span style={{ marginTop: '1rem', color: '#1e293b' }}>Processing verified data...</span>
                    </div>
                </div>
            </div>
        );
    }

    // ── Exact API Data Binding (AI Base) ──────────────────────────────────────
    const seamScore    = aiResult?.scam_score ?? 0;
    const genuineScore = aiResult?.genuine_score ?? 0;
    const confidence   = aiResult?.confidence;
    const verdict      = aiResult?.verdict || 'IN_REVIEW';
    
    // ── Admin Override (CRITICAL) ─────────────────────────────────────────────
    const isAdminVerified = data?.submission_status === 'ADMIN_VERIFIED' || data?.verified_by_admin === 1 || data?.verified_by_admin === true;
    const finalVerdictText = isAdminVerified ? (data?.final_result === 'SCAM' ? 'Verified as SCAM by Admin' : 'Verified as GENUINE by Admin') : (aiResult?.headline || aiResult?.agent_summary || aiResult?.final_verdict || '');
    
    // ── Verdict Routing ───────────────────────────────────────────────────────
    // Priority: Admin Decision > AI Verdict
    const isClearScam    = isAdminVerified ? data?.final_result?.toUpperCase() === 'SCAM' : verdict === 'SCAM';
    const isClearGenuine = isAdminVerified ? data?.final_result?.toUpperCase() === 'GENUINE' : verdict === 'GENUINE';
    const isInReview     = !isAdminVerified && (verdict === 'SUSPICIOUS' || (!isClearScam && !isClearGenuine));

    const evidenceList = isAdminVerified && data?.admin_reason 
        ? [{ type: 'warning', text: `Admin Insight: ${data.admin_reason}` }]
        : (Array.isArray(aiResult?.evidence_analysis) ? aiResult.evidence_analysis : []);
    const guidanceTips = Array.isArray(aiResult?.protective_guidance) ? aiResult.protective_guidance : [];

    // ── Role-Based Display Check ──────────────────────────────────────────────
    const showAiAnalysis = !isInReview || isAdmin; // Hide AI scores/evidence for normal users when in review

    // ── Expiry Check ──────────────────────────────────────────────────────────
    const isExpired = aiResult?.is_expired || false;

    // ── Notification Deduplication ────────────────────────────────────────────
    const alreadyNotified =
        data?.send_email_notification === 1   ||
        data?.send_email_notification === true ||
        data?.notification_requested  === 1   ||
        data?.notification_requested  === true ||
        notifyEnabled;

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleOk = () => {
        setIsCollapsed(true);
        setTimeout(onClose, 600);
    };

    const handleNotifyToggle = async () => {
        setNotifyLoading(true);
        try {
            const targetId = data._id || data.id;
            const newState = !notifyEnabled;
            setNotifyEnabled(newState);
            await axios.put(`/api/update-notification/${targetId}`, { 
                notification_requested: newState 
            });
        } catch (err) {
            console.error('Failed to toggle notification', err);
            setNotifyEnabled(!notifyEnabled); // revert on failure
        } finally {
            setNotifyLoading(false);
        }
    };

    const handleProceedToApply = () => {
        const text     = data?.message || '';
        const urlMatch = text.match(/https?:\/\/[^\s]+/i);
        if (urlMatch) window.open(urlMatch[0], '_blank', 'noopener,noreferrer');
    };

    // ── Dynamic Color Mapping for Evidence ────────────────────────────────────
    const getEvidenceColor = (type) => {
        switch(type?.toLowerCase()) {
            case 'positive': return '#10b981'; // green
            case 'negative': return '#ef4444'; // red
            default: return '#f59e0b'; // yellow (warning)
        }
    };
    
    const getEvidenceIcon = (type) => {
        switch(type?.toLowerCase()) {
            case 'positive': return <ShieldCheck size={16} color="#10b981" />;
            case 'negative': return <AlertTriangle size={16} color="#ef4444" />;
            default: return <AlertCircle size={16} color="#f59e0b" />;
        }
    };

    return (
        <div className={`diagnostic-overlay ${isOpen ? 'active' : ''} ${isCollapsed ? 'collapsing' : ''}`}>
            <div className="diagnostic-modal-content glass-effect">
                <button className="close-x" onClick={onClose}><X size={20} /></button>

                {/* ── Header Badge ──────────────────────────────────────────── */}
                <header className="modal-forensic-header">
                    <div className={`verdict-badge ${isAdminVerified ? 'admin-badge' : ''}`} style={isAdminVerified ? { background: '#6366f1', color: 'white', borderColor: '#4f46e5' } : {}}>
                        <span className="shield-icon">🛡️</span>
                        {isAdminVerified ? 'ADMIN VERIFIED' : 'SYSTEM VERDICT'}
                    </div>
                    {isExpired && <div className="expired-badge">DATA EXPIRED</div>}
                </header>

                {/* 1️⃣  Result Header Banner */}
                {isClearScam && (
                    <div className="verdict-banner verdict-banner--scam">
                        <AlertTriangle size={26} />
                        <div>
                            <p className="verdict-banner__headline">⚠️ {finalVerdictText || "This message has been identified as a SCAM."}</p>

                            {showAiAnalysis && !isAdminVerified && (
                                <>
                                    <p className="verdict-banner__sub">
                                        Scam Risk Score: <strong>{seamScore}%</strong>
                                    </p>
                                    <div className="probability-bar-wrapper">
                                        <div className="probability-bar probability-bar--scam" style={{ width: `${seamScore}%` }} />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {isClearGenuine && (
                    <div className="verdict-banner verdict-banner--genuine">
                        <CheckCircle2 size={26} />
                        <div>
                            <p className="verdict-banner__headline">✔️ {finalVerdictText || "This message has been verified as GENUINE."}</p>

                            {showAiAnalysis && !isAdminVerified && (
                                <>
                                    <p className="verdict-banner__sub">
                                        Authenticity Score: <strong>{genuineScore}%</strong>
                                    </p>
                                    <div className="probability-bar-wrapper">
                                        <div className="probability-bar probability-bar--genuine" style={{ width: `${genuineScore}%`, backgroundColor: '#22c55e' }} />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {isInReview && (
                    <div className="verdict-banner verdict-banner--review">
                        <Clock size={26} />
                        <div>
                            <p className="verdict-banner__headline">🔍 {finalVerdictText || "This message is currently UNDER REVIEW."}</p>
                            <p className="verdict-banner__sub">
                                Our AI flagged suspicious elements that require manual verification.
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

                {/* 3️⃣  Verification Confidence */}
                {(confidence && confidence !== 'UNKNOWN') && showAiAnalysis && (
                    <div className={`confidence-strip confidence-strip--${confidence.toLowerCase()}`}>
                        <Shield size={14} />
                        <span>Verification Confidence: <strong>{confidence.toUpperCase()}</strong></span>
                    </div>
                )}

                {/* ── Side-by-side raw score panels ─────── */}
                {showAiAnalysis && (
                    <section className="verdict-comparison">
                        <div className={`verdict-panel scam-panel ${isClearScam ? 'active-verdict' : 'dimmed'}`}>
                            <div className="panel-header">
                                <AlertTriangle className="icon-scam" />
                                <h3>SCAM RISK</h3>
                            </div>
                            <div className="probability-meter">
                                <div className="meter-fill scam-fill" style={{ width: `${seamScore}%` }} />
                                <span className="meter-value">{seamScore}% Risk</span>
                            </div>
                        </div>

                        <div className={`verdict-panel genuine-panel ${isClearGenuine ? 'active-verdict' : 'dimmed'}`}>
                            <div className="panel-header">
                                <CheckCircle2 className="icon-genuine" />
                                <h3>GENUINE LIKELIHOOD</h3>
                            </div>
                            <div className="probability-meter">
                                <div className="meter-fill genuine-fill" style={{ width: `${genuineScore}%` }} />
                                <span className="meter-value">{genuineScore}% Trusted</span>
                            </div>
                        </div>
                    </section>
                )}

                {/* 4️⃣  Verification Evidence */}
                {isClearGenuine && evidenceList.filter(e => e?.type === 'positive').length > 0 && showAiAnalysis && (
                    <section className="forensic-evidence-section">
                        <h4 className="section-label">🟢 Genuine Evidence</h4>
                        <div className="evidence-glass-card">
                            <ul className="evidence-list" style={{ listStyle: 'none', paddingLeft: 0 }}>
                                {(evidenceList || []).filter(e => e?.type === 'positive').map((evidence, idx) => (
                                    <li key={idx} style={{ 
                                        display: 'flex', 
                                        alignItems: 'flex-start', 
                                        gap: '8px', 
                                        marginBottom: '10px',
                                        color: getEvidenceColor(evidence?.type),
                                        padding: '8px',
                                        backgroundColor: 'rgba(255,255,255,0.4)',
                                        borderRadius: '6px',
                                        borderLeft: `4px solid ${getEvidenceColor(evidence?.type)}`
                                    }}>
                                        <div style={{ marginTop: '2px' }}>{getEvidenceIcon(evidence?.type)}</div>
                                        <span style={{ color: '#334155' }}>{evidence?.text}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </section>
                )}

                {!isClearGenuine && evidenceList.length > 0 && showAiAnalysis && (
                    <section className="forensic-evidence-section">
                        <h4 className="section-label">
                            {isClearScam ? '🔴 Scam Evidence' : '🔵 AI Analysis Findings'}
                        </h4>
                        <div className="evidence-glass-card">
                            <ul className="evidence-list" style={{ listStyle: 'none', paddingLeft: 0 }}>
                                {(evidenceList || []).map((evidence, idx) => (
                                    <li key={idx} style={{ 
                                        display: 'flex', 
                                        alignItems: 'flex-start', 
                                        gap: '8px', 
                                        marginBottom: '10px',
                                        color: getEvidenceColor(evidence?.type),
                                        padding: '8px',
                                        backgroundColor: 'rgba(255,255,255,0.4)',
                                        borderRadius: '6px',
                                        borderLeft: `4px solid ${getEvidenceColor(evidence?.type)}`
                                    }}>
                                        <div style={{ marginTop: '2px' }}>{getEvidenceIcon(evidence?.type)}</div>
                                        <span style={{ color: '#334155' }}>{evidence?.text}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </section>
                )}

                {/* 5️⃣  Safety Tips / Protective Guidance */}
                {guidanceTips.length > 0 && showAiAnalysis && (
                    <section className="safety-tips-section">
                        <h4 className="section-label">🛡️ Protective Guidance</h4>
                        <div className="evidence-glass-card">
                            <ul className="safety-tips-list">
                                {(guidanceTips || []).map((tip, idx) => (
                                    <li key={idx}>{tip}</li>
                                ))}
                            </ul>
                        </div>
                    </section>
                )}

                {/* 6️⃣  Action Buttons */}
                <footer className="modal-actions">

                    {/* Phase 2: Notify Me — ONLY for In-Review for normal users */}
                    {isInReview && !isAdmin && (
                        <button
                            className={`rescue-btn notify-me-btn ${notifyEnabled ? 'notify-me-btn--active active' : ''}`}
                            onClick={handleNotifyToggle}
                            disabled={notifyLoading}
                            title={notifyEnabled ? 'Click to unsubscribe from updates.' : 'Get notified when this is verified.'}
                        >
                            <Bell size={18} />
                            <span>
                                {notifyLoading
                                    ? 'UPDATING...'
                                    : notifyEnabled
                                    ? '🔔 Notifications ON'
                                    : '🔕 Notify Me'}
                            </span>
                        </button>
                    )}
                    
                    {/* Admin Actions placeholder */}
                    {isInReview && isAdmin && !isAdminVerified && (
                        <div style={{ display: 'flex', gap: '10px', width: '100%', marginBottom: '10px' }}>
                            <button className="rescue-btn" style={{ flex: 1, background: '#ef4444' }}>Mark as Scam</button>
                            <button className="rescue-btn" style={{ flex: 1, background: '#10b981' }}>Mark as Genuine</button>
                        </div>
                    )}

                    {/* Rescue Steps — Scam only */}
                    {isClearScam && (
                        <button className="rescue-btn" onClick={() => setShowRescue(!showRescue)}>
                            <span>{showRescue ? 'HIDE RESCUE STEPS' : 'WHAT DO I DO NOW?'}</span>
                            <ArrowRight size={18} />
                        </button>
                    )}

                    {showRescue && isClearScam && (
                        <div className="rescue-panel">
                            <h4>🚨 IMMEDIATE RESCUE STEPS</h4>
                            <ul>
                                <li>Do not pay any fees or share bank details.</li>
                                <li>Block the sender on all platforms immediately.</li>
                                <li>Report to your institution's cybercell.</li>
                                <li>If you shared credentials, change all passwords.</li>
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
