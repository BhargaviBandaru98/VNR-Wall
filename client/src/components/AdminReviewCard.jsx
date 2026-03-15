import React, { useState } from 'react';
import { Shield, CheckCircle, AlertTriangle, Info, Send, MessageSquare } from 'lucide-react';
import axios from 'axios';
import '../styles/AdminReviewCard.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:6105';

const AdminReviewCard = ({ data, onVerictSubmitted }) => {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerdict = async (verdict) => {
    setLoading(true);
    try {
      await axios.post(`${BACKEND_URL}/api/admin/verify-submission`, {
        id: data.id,
        verdict,
        reason
      });
      if (onVerictSubmitted) onVerictSubmitted(data.id);
    } catch (error) {
      console.error('Verdict submission failed:', error);
      alert('Failed to submit verdict');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-review-card glass-card animate-fade-in">
      <div className="review-card-header">
        <div className="submission-id">#ID: {data.id}</div>
        <div className="risk-badge" data-level={data.risk_level?.toLowerCase()}>
          {data.risk_level || 'UNKNOWN'} RISK
        </div>
      </div>

      <div className="review-content-layout">
        <div className="review-main-content">
          <section className="review-section">
            <h4 className="section-label"><MessageSquare size={14} /> Original Message</h4>
            <div className="message-text-box">
              {data.message}
            </div>
          </section>

          <div className="evidence-grid">
            <section className="review-section">
              <h4 className="section-label">🔴 AI Scam Evidence</h4>
              <div className="evidence-box scam-box">
                {data.ai_evidence || 'No AI scam evidence provided.'}
              </div>
            </section>
            <section className="review-section">
              <h4 className="section-label">🟢 Genuine Evidence</h4>
              <div className="evidence-box genuine-box">
                {data.genuine_evidence || 'No genuine evidence provided.'}
              </div>
            </section>
          </div>

          <section className="review-section">
            <h4 className="section-label">🛡️ Protective Guidance</h4>
            <ul className="guidance-bullets">
              {data.protective_guidance ? (
                (() => {
                  try {
                    const parsed = JSON.parse(data.protective_guidance);
                    return Array.isArray(parsed) ? parsed.map((t, i) => <li key={i}>{t}</li>) : <li>{data.protective_guidance}</li>;
                  } catch {
                    return <li>{data.protective_guidance}</li>;
                  }
                })()
              ) : (
                <li>No guidance generated.</li>
              )}
            </ul>
          </section>
        </div>

        <aside className="review-sidebar">
          <div className="score-widget">
            <div className="score-item">
              <span className="label">Scam Score</span>
              <div className="score-bar-container">
                <div className="score-bar scam-fill" style={{ width: `${data.ai_score}%` }}></div>
              </div>
              <span className="value">{data.ai_score}%</span>
            </div>
            <div className="score-item">
              <span className="label">Genuine Score</span>
              <div className="score-bar-container">
                <div className="score-bar genuine-fill" style={{ width: `${data.genuine_score || 0}%` }}></div>
              </div>
              <span className="value">{data.genuine_score || 0}%</span>
            </div>
            <div className={`confidence-tag conf-${data.ai_confidence?.toLowerCase()}`}>
              AI Confidence: {data.ai_confidence || 'UNKNOWN'}
            </div>
          </div>

          <div className="admin-input-zone">
            <h4 className="section-label">Learning Feedback (Optional)</h4>
            <textarea
              placeholder="Explain the logic for this decision..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="admin-reason-input"
            />
            
            <div className="verdict-actions">
              <button 
                className="verdict-btn scam-btn" 
                onClick={() => handleVerdict('SCAM')}
                disabled={loading}
              >
                <AlertTriangle size={18} /> Mark as SCAM
              </button>
              <button 
                className="verdict-btn genuine-btn" 
                onClick={() => handleVerdict('GENUINE')}
                disabled={loading}
              >
                <CheckCircle size={18} /> Mark as GENUINE
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default AdminReviewCard;
