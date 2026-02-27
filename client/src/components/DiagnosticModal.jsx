import React, { useEffect, useState } from 'react';
import { Shield, AlertTriangle, CheckCircle2, Info, ArrowRight, X, Bell, UserSearch } from 'lucide-react';
import axios from 'axios';
import '../styles/DiagnosticModal.css';
import '../styles/Stepper.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:6105';

const DiagnosticModal = ({ isOpen, onClose, data }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [notifyEnabled, setNotifyEnabled] = useState(false);
    const [notifyLoading, setNotifyLoading] = useState(false);

    if (!isOpen) return null;

    const isScam = data.status?.toLowerCase() === 'scam' || data.ai_result?.toLowerCase() === 'fake' || data.result?.toLowerCase() === 'scam';
    const isGenuine = data.status?.toLowerCase() === 'genuine' || data.ai_result?.toLowerCase() === 'real' || data.result?.toLowerCase() === 'genuine';
    const isInReview = !isScam && !isGenuine && (data.status === 'null' || !data.status);
    const score = data.ai_score || data.scam_score || 0;

    // Expiry Logic: Check if submission is older than 30 days or flagged by AI
    const submissionDate = data.dateReceived ? new Date(data.dateReceived.split('-').reverse().join('-')) : new Date();
    const daysOld = Math.floor((new Date() - submissionDate) / (1000 * 60 * 60 * 24));
    const isExpired = data.isExpired || data.is_expired || daysOld > 30;

    const handleOk = () => {
        setIsCollapsed(true);
        setTimeout(onClose, 600); // Allow animation to complete
    };

    const handleNotifyMe = async () => {
        setNotifyLoading(true);
        try {
            await axios.put(`${BACKEND_URL}/api/notify-request/${data.id}`);
            setNotifyEnabled(true);
        } catch (error) {
            console.error("Failed to enable notification", error);
            alert("Failed to enable notification. Please try again.");
        } finally {
            setNotifyLoading(false);
        }
    };

    return (
        <div className={`diagnostic-overlay ${isOpen ? 'active' : ''} ${isCollapsed ? 'collapsing' : ''}`}>
            <div className="diagnostic-modal-content glass-effect">
                <button className="close-x" onClick={onClose}><X size={20} /></button>

                <header className="modal-forensic-header">
                    <div className="verdict-badge">
                        <span className="shield-icon">🛡️</span>
                        SYSTEM VERDICT
                    </div>
                    {isExpired && <div className="expired-badge">DATA EXPIRED ({daysOld}d)</div>}
                </header>

                {isInReview && (
                    <div className="in-review-stepper">
                        <div className="step completed">
                            <div className="step-icon"><CheckCircle2 size={18} /></div>
                            <span className="step-label">Submitted</span>
                        </div>
                        <div className="step-line active"></div>
                        <div className="step completed">
                            <div className="step-icon"><CheckCircle2 size={18} /></div>
                            <span className="step-label">AI Analysis</span>
                        </div>
                        <div className="step-line active"></div>
                        <div className="step active pulsing">
                            <div className="step-icon"><UserSearch size={18} /></div>
                            <span className="step-label">Admin Review</span>
                        </div>
                    </div>
                )}

                <section className="verdict-comparison">
                    {/* SCAM PANEL */}
                    <div className={`verdict-panel scam-panel ${isScam ? 'active-verdict' : 'dimmed'}`}>
                        <div className="panel-header">
                            <AlertTriangle className="icon-scam" />
                            <h3>SCAM DETECTED</h3>
                        </div>
                        <div className="probability-meter">
                            <div className="meter-fill scam-fill" style={{ width: `${isScam ? score : 0}%` }}></div>
                            <span className="meter-value">{isScam ? score : 0}% Risk</span>
                        </div>
                        <p className="panel-desc">Investigation found 4+ high-risk forensic markers.</p>
                    </div>

                    {/* GENUINE PANEL */}
                    <div className={`verdict-panel genuine-panel ${isGenuine ? 'active-verdict' : 'dimmed'}`}>
                        <div className="panel-header">
                            <CheckCircle2 className="icon-genuine" />
                            <h3>GENUINE</h3>
                        </div>
                        <div className="probability-meter">
                            <div className="meter-fill genuine-fill" style={{ width: `${isGenuine ? (100 - score) : 0}%` }}></div>
                            <span className="meter-value">{isGenuine ? (100 - score) : 0}% Trusted</span>
                        </div>
                        <p className="panel-desc">Verified via official company metadata & portals.</p>
                    </div>
                </section>

                <section className="forensic-evidence">
                    <h4>Forensic Proof</h4>
                    <div className="evidence-grid">
                        <div className="evidence-item">
                            <Info size={14} />
                            <span>{data.ai_evidence || "No technical evidence available."}</span>
                        </div>
                    </div>
                </section>

                <footer className="modal-actions">
                    {isInReview && (
                        <button
                            className="rescue-btn"
                            style={{ background: notifyEnabled ? '#22c55e' : '#2563eb', boxShadow: notifyEnabled ? '0 10px 20px -5px rgba(34, 197, 94, 0.4)' : '0 10px 20px -5px rgba(37, 99, 235, 0.4)' }}
                            onClick={handleNotifyMe}
                            disabled={notifyEnabled || notifyLoading}
                        >
                            <Bell size={18} />
                            <span>{notifyLoading ? 'ENABLING...' : notifyEnabled ? '🔔 Notification On' : 'NOTIFY ME WHEN VERIFIED'}</span>
                        </button>
                    )}
                    {isScam && data.risk_level?.toUpperCase() === 'CRITICAL' && (
                        <button className="rescue-btn">
                            <span>WHAT DO I DO NOW?</span>
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
