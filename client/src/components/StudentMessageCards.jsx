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
  // fallback: whole string as fakeReason if nothing parsed
  if (!fakeReason && !genuineReason) fakeReason = raw.substring(0, 200);
  return { fakeReason, genuineReason, path };
}

/* ────────────────────────────────────────────────────────
   AI Detail Modal
──────────────────────────────────────────────────────── */
const AIDetailModal = ({ data, onClose }) => {
  // Prevent background scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const fakeScore = data.aiScore ?? null;
  const genuineScore = fakeScore !== null ? Math.max(0, 100 - fakeScore) : null;
  const aiResult = data.aiResult;
  const confidence = data.aiConfidence;
  const { fakeReason, genuineReason, path } = parseEvidence(data.aiEvidence);

  // Determine which verdict to show FIRST (real first if it dominates)
  const isGenuineDominant = fakeScore !== null && genuineScore !== null && genuineScore > fakeScore;

  const genuinePercent = genuineScore;
  const fakePercent = fakeScore;

  const genuineColor = '#10b981';
  const fakeColor = '#ef4444';

  return (
    <div className="modal-overlay" onClick={e => { e.stopPropagation(); onClose(); }}>
      <div className="modal-container" onClick={e => e.stopPropagation()}>
        {/* Close */}
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-row">
            <span className="modal-category-badge">{data.category}</span>
            <span className="modal-date">📅 {data.receivedDate}</span>
          </div>
          <div className="modal-sender-row">
            <span className="modal-label">Sender:</span>
            <span className="modal-value">{data.sender}</span>
            &nbsp;·&nbsp;
            <span className="modal-label">Platform:</span>
            <span className="modal-value">{data.platform}</span>
          </div>
        </div>

        {/* Not Available */}
        {fakeScore === null && (
          <div className="modal-no-ai">
            <span>⏳ Verification analysis not yet run for this submission.</span>
          </div>
        )}

        {/* Verdict Block */}
        {fakeScore !== null && (
          <div className="modal-ai-section">
            <h3 className="modal-section-heading">🔍 Verification Analysis</h3>

            {/* Show Real first if dominant, else Fake first */}
            {[
              isGenuineDominant ? 'genuine' : 'fake',
              isGenuineDominant ? 'fake' : 'genuine',
            ].map(type => {
              const isGenuine = type === 'genuine';
              const pct = isGenuine ? genuinePercent : fakePercent;
              const color = isGenuine ? genuineColor : fakeColor;
              const label = isGenuine ? '✅ Genuine / Real' : '🚨 Fake / Suspicious';
              const reason = isGenuine ? (genuineReason || 'No specific genuine indicators found.') : (fakeReason || 'No specific fake indicators found.');
              const isPrimary = (isGenuine && isGenuineDominant) || (!isGenuine && !isGenuineDominant);

              return (
                <div key={type} className={`modal-score-block ${isPrimary ? 'primary' : 'secondary'}`}>
                  <div className="modal-score-header">
                    <span className="modal-score-label" style={{ color }}>{label}</span>
                    <span className="modal-score-pct" style={{ color }}>{pct}%</span>
                  </div>
                  <div className="modal-progress-bar-bg">
                    <div
                      className="modal-progress-bar-fill"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                  <p className="modal-score-reason" style={{ color: isGenuine ? genuineColor : fakeColor, fontWeight: isPrimary ? '600' : '400' }}>
                    {reason}
                  </p>
                </div>
              );
            })}

            {/* Confidence + Path */}
            <div className="modal-meta-row">
              <span className="modal-meta-chip" style={{
                background: confidence === 'HIGH' ? 'rgba(16,185,129,0.12)' : confidence === 'MEDIUM' ? 'rgba(234,179,8,0.12)' : 'rgba(107,114,128,0.12)',
                color: confidence === 'HIGH' ? '#059669' : confidence === 'MEDIUM' ? '#b45309' : '#6b7280',
              }}>
                Confidence: {confidence || '—'}
              </span>
              {aiResult && (
                <span className={`modal-meta-chip ${aiResult === 'REAL' ? 'chip-real' : aiResult === 'FAKE' ? 'chip-fake' : 'chip-neutral'}`}>
                  System Verdict: {aiResult === 'REAL' ? 'GENUINE' : aiResult}
                </span>
              )}
            </div>

            {path && (
              <div className="modal-path">
                <span className="modal-label">Verification Journey:</span>
                <span className="modal-path-text">{path}</span>
              </div>
            )}
          </div>
        )}

        {/* Full Message */}
        <div className="modal-message-section">
          <h3 className="modal-section-heading">💬 Full Message</h3>
          <div className="modal-message-body">{data.messageContent}</div>
        </div>

        {/* Extra Details */}
        <div className="modal-details-grid">
          <div className="modal-detail-item">
            <span className="modal-label">Branch</span>
            <span className="modal-value">{data.branch}</span>
          </div>
          <div className="modal-detail-item">
            <span className="modal-label">Year</span>
            <span className="modal-value">{data.year}</span>
          </div>
          <div className="modal-detail-item">
            <span className="modal-label">Responded</span>
            <span className="modal-value">{data.responseStatus}</span>
          </div>
          <div className="modal-detail-item">
            <span className="modal-label">Personal Details Shared</span>
            <span className="modal-value">{data.personalDetails}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────
   Main Card
──────────────────────────────────────────────────────── */
const StudentMessageCard = ({ data, onStatusUpdate }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.isAdmin || false;

  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'inreview': return 'status-inreview';
      case 'genuine': return 'status-genuine';
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

  const hasAI = data.aiChecked && data.aiScore !== null;

  return (
    <>
      {/* ── Modal ── */}
      {showModal && (
        <AIDetailModal data={data} onClose={() => setShowModal(false)} />
      )}

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
                    onClick={() => handleStatusChange('fake')}
                    className={`admin-btn fake-btn ${data.status.toLowerCase() === 'fake' ? 'active' : ''}`}
                    title="Mark as Fake"
                  >
                    <Shield size={14} />
                    Fake
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
              🚨 {data.aiScore}% Fake
            </span>
            <span className="ai-strip-genuine">
              ✅ {Math.max(0, 100 - data.aiScore)}% Real
            </span>
            <span className="ai-strip-conf">{data.aiConfidence} confidence</span>
          </div>
        )}

        {/* Student Academic Info */}
        <div className="section academic-info">
          <div className="section-header">
            <span className="section-title">🧑‍🎓 Student Academic Info</span>
          </div>
          <div className="academic-details">
            <div className="detail-item">
              <span className="label">Branch:</span>
              <span className="value">{data.branch}</span>
            </div>
            <div className="detail-item">
              <span className="label">Year:</span>
              <span className="year-badge">{data.year}</span>
            </div>
          </div>
        </div>

        {/* Source and Feedback */}
        <div className="row dual-section d-flex justify-content-around">
          <div className="col-5 section source-section">
            <div className="section-header">
              <span className="section-title">📩 Source of Message</span>
            </div>
            <div className="source-details">
              <div className="detail-row">
                <span className="label">Platform:</span>
                <span className="platform-badge">
                  {data.highlightedPlatform || data.platform}
                </span>
              </div>
              <div className="detail-row">
                <span className="label">Sender:</span>
                <span className="sender-name">
                  {data.highlightedSender || data.sender}
                </span>
              </div>
              <div className="detail-row">
                <span className="label">Contact:</span>
                <span className="contact-info">{data.contact}</span>
              </div>
            </div>
          </div>

          <div className="col-5 section feedback-section">
            <div className="section-header">
              <span className="section-title">⭐ Student Response</span>
            </div>
            <div className="feedback-details">
              <div className="detail-row">
                <span className="label">Responded Status:</span>
                <span className={`response-status ${data.responseStatus === 'Yes' ? 'status-yes' :
                  data.responseStatus === 'No' ? 'status-no' : 'status-considering'
                  }`}>
                  {data.responseStatus}
                </span>
              </div>
              <div className="detail-row">
                <span className="label">Details Shared:</span>
                <span className="details-shared">{data.personalDetails}</span>
              </div>
              <div className="detail-row">
                <span className="label">Credibility:</span>
                <div className="credibility-rating">{renderStars(data.credibilityRating)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Message Content */}
        <div className="section message-section" onClick={e => e.stopPropagation()}>
          <div className="section-header">
            <span className="section-title">💬 Message Content</span>
            <button onClick={() => setIsExpanded(!isExpanded)} className="expand-button">
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
          <div className={`message-content ${isExpanded ? 'expanded' : 'collapsed'}`}>
            {data.highlightedMessage || data.messageContent}
          </div>
          {data.tags && data.tags.length > 0 && (
            <div className="tags-container">
              {data.tags.map((tag, index) => (
                <span key={index} className={`tag ${tag === 'Urgent' ? 'tag-urgent' :
                  tag === 'Info Incomplete' ? 'tag-incomplete' :
                    'tag-default'
                  }`}>
                  {tag}
                </span>
              ))}
            </div>
          )}
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