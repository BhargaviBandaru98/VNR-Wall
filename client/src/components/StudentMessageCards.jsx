import React, { useState, useEffect } from 'react';
import { Calendar, ChevronDown, ChevronUp, Star, Shield, CheckCircle, X, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import '../styles/StudentMessagesCards.css';

/* ────────────────────────────────────────────────────────
   Helper: parse evidence string into sections
   Expected formats from server:
     "GENUINE: <reason> | Fake Score: N | Genuine Score: M | Path: …"
     "<evidence> | Fake Score: N | Genuine Score: M | Path: …"
──────────────────────────────────────────────────────── */
function parseEvidence(raw) {
  if (!raw) return { fakeReason: null, genuineReason: null, path: null };
  const parts = raw.split(' | ');
  let fakeReason = null, genuineReason = null, path = null;
  parts.forEach(p => {
    if (p.startsWith('GENUINE:')) genuineReason = p.replace('GENUINE:', '').trim();
    else if (p.startsWith('Reason:')) fakeReason = p.replace('Reason:', '').trim();
    else if (p.startsWith('Path:')) path = p.replace('Path:', '').trim();
    else if (p.startsWith('Official:') || p.startsWith('Found:')) {
      fakeReason = fakeReason ? fakeReason + ' | ' + p : p;
    }
  });
  // fallback: whole string as scamReason if nothing parsed
  if (!fakeReason && !genuineReason) fakeReason = raw.substring(0, 200);
  return { scamReason: fakeReason, genuineReason, path };
}

import DiagnosticModal from './DiagnosticModal';

/* ────────────────────────────────────────────────────────
   Student Message Card
   ──────────────────────────────────────────────────────── */
const StudentMessageCard = ({ data, onStatusUpdate }) => {
  const [showModal, setShowModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const { user, isAdmin } = useAuth();

  const isScam = data.status?.toLowerCase() === 'scam' || data.ai_result?.toLowerCase() === 'fake';
  const isGenuine = data.status?.toLowerCase() === 'genuine' || data.ai_result?.toLowerCase() === 'real';

  const getStatusBadge = () => {
    if (isScam) return <span className="badge badge-scam">🚨 SCAM</span>;
    if (isGenuine) return <span className="badge badge-genuine">✅ GENUINE</span>;
    return <span className="badge badge-review">⏳ UNDER REVIEW</span>;
  };

  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'inreview': return 'status-inreview';
      case 'genuine': return 'status-genuine';
      case 'scam': return 'status-fake';
      case 'fake': return 'status-fake';
      default: return 'status-default';
    }
  };

  const getCategoryColor = (category) => {
    switch (category.toLowerCase()) {
      case 'exam drive': return 'category-exam-drive';
      case 'placement': return 'category-placement';
      case 'internship': return 'category-internship';
      default: return 'category-default';
    }
  };

  const renderStars = (rating) => (
    <div className="stars-container">
      {[...Array(5)].map((_, i) => (
        <Star key={i} size={14} className={i < rating ? 'star-filled' : 'star-empty'} />
      ))}
      <span className="rating-text">({rating}/5)</span>
    </div>
  );

  const handleStatusChange = (newStatus) => {
    if (onStatusUpdate) onStatusUpdate(data.id, newStatus);
  };

  const hasAI = data.aiChecked && data.scamScore !== null;

  return (
    <>
      {/* Modal Integration */}
      <DiagnosticModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        data={data}
      />

      {/* ── Card ── */}
      <div
        className="student-card enhanced-card clickable-card"
        onClick={() => setShowModal(true)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setShowModal(true)}
        title="Click to view full details"
      >
        {/* Header */}
        <div className="card-header">
          <span className={`category-badge ${getCategoryColor(data.category)}`}>
            {data.category}
          </span>
          <div className="header-right">
            <div className="date-container">
              <Calendar size={12} className="calendar-icon" />
              Received on: {data.receivedDate}
            </div>

            {isAdmin ? (
              <div className="admin-actions" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setShowModal(true)}
                  className="admin-btn proof-btn"
                  title="Review the evidence used to verify this message."
                >
                  🔍 View Proof of Verification
                </button>
                <div className="manual-actions">
                  <button
                    onClick={() => handleStatusChange('genuine')}
                    className={`admin-btn genuine-btn ${data.status.toLowerCase() === 'genuine' ? 'active' : ''}`}
                    title="Mark as Genuine"
                  >
                    <CheckCircle size={14} />
                    Genuine
                  </button>
                  <button
                    onClick={() => handleStatusChange('scam')}
                    className={`admin-btn fake-btn ${data.status?.toLowerCase() === 'scam' || data.status?.toLowerCase() === 'fake' ? 'active' : ''}`}
                    title="Mark as Scam"
                  >
                    <Shield size={14} />
                    Scam
                  </button>
                </div>
              </div>
            ) : (
              <span className={`status-badge ${getStatusColor(data.status)}`}>
                {data.status}
              </span>
            )}
          </div>
        </div>

        {/* Verification Summary Strip — quick glance if available */}
        {hasAI && (
          <div className="card-ai-strip">
            <span className="ai-strip-fake">
              🚨 {data.scamScore}% Scam
            </span>
            <span className="ai-strip-genuine">
              ✅ {Math.max(0, 100 - data.scamScore)}% Real
            </span>
            <span className="ai-strip-conf">{data.aiConfidence} confidence</span>
          </div>
        )}

        {/* Minimalist Student Query / Details Shared */}
        {(data.personalDetails === 'Yes' || data.personalDetails === 'Mention') && (
          <div className="section feedback-section" style={{ marginTop: '1rem' }}>
            <div className="section-header">
              <span className="section-title">⭐ Student Query & Shared Details</span>
            </div>
            <div className="feedback-details" style={{ backgroundColor: '#f8fafc', padding: '0.8rem', borderRadius: '6px' }}>
              <span className="details-shared" style={{ fontSize: '0.9rem', color: '#334155', lineHeight: '1.5' }}>
                <span className="font-bold" style={{ display: 'block', marginBottom: '4px' }}>Context Provided ({data.personalDetails}):</span>
                {data.responseDetails || 'No additional specifics provided by the user.'}
              </span>
            </div>
          </div>
        )}

        {/* Message Content */}
        <div className="section message-section" onClick={e => e.stopPropagation()} style={{ marginTop: '1rem' }}>
          <div className="section-header">
            <span className="section-title">💬 Message Content</span>
            <button onClick={() => setIsExpanded(!isExpanded)} className="expand-button">
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
          <div className={`message-content ${isExpanded ? 'expanded' : 'collapsed'}`}>
            {data.highlightedMessage || data.messageContent}
          </div>
        </div>

        {/* Diagnostic Conclusion Summary */}
        <div className="section conclusion-section" style={{
          marginTop: '1rem',
          padding: '1rem',
          backgroundColor: isScam ? '#fef2f2' : (isGenuine ? '#f0fdf4' : '#f8fafc'),
          borderRadius: '8px',
          borderLeft: `4px solid ${isScam ? '#ef4444' : (isGenuine ? '#22c55e' : '#3b82f6')}`
        }}>
          <span className="font-bold" style={{ display: 'block', marginBottom: '0.25rem', color: '#1e293b' }}>
            Investigation Conclusion:
          </span>
          <span style={{ fontSize: '0.9rem', color: '#475569', lineHeight: '1.5' }}>
            {isScam ? 'WARNING: This message has been flagged as a critical scam. Do not proceed or share details.' :
              isGenuine ? 'VERIFIED: This communication represents an official and safe opportunity.' :
                'IN REVIEW: This submission is currently undergoing manual administrative analysis.'}
          </span>
        </div>

        {/* Click-to-view hint */}
        <div className="card-view-hint">
          <ExternalLink size={12} />
          <span className='font-bold'>Click card to view {hasAI ? 'Verification Analysis & ' : ''}full details</span>
        </div>

        {/* Hover overlay */}
        <div className="card-overlay" />
      </div>
    </>
  );
};

export default StudentMessageCard;