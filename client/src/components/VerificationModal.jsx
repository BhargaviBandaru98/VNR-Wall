import React, { useState } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import '../styles/VerificationModal.css';

const VerificationModal = ({ isOpen, onClose, data, onMarkGenuine, onMarkFake }) => {
  const [expandedSections, setExpandedSections] = useState({
    journey: true,
    genuine: false,
    fake: false,
    technical: false
  });

  if (!isOpen || !data) return null;

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Mock verification data - in real use, this would come from backend
  const verificationData = {
    genuineEvidence: data.verificationData?.genuineEvidence || [
      'Domain ownership verified through WHOIS records',
      'TLS certificate valid and from trusted CA',
      'Contact email matches company official records',
      'Sender account has established history'
    ],
    fakeEvidence: data.verificationData?.fakeEvidence || [
      'Suspicious domain registration pattern detected',
      'Similar phishing attempts reported previously',
      'Grammar inconsistencies with official communications',
      'Request for sensitive information without verification'
    ],
    technicalDetails: data.verificationData?.technicalDetails || [
      'Domain mismatch found in official records',
      'IP geolocation: Different from stated company location',
      'Email header analysis: Spoofing indicators present',
      'URL pattern: 0.76% match with known phishing schemes'
    ],
    verificationPath: ['Web Risk', 'Serper', 'Firecrawl']
  };

  return (
    <div className="verification-modal-overlay" onClick={onClose}>
      <div className="verification-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="verification-modal-header">
          <div className="verification-modal-title-section">
            <h2 className="verification-modal-title">🔒 Verification Analysis</h2>
            <p className="verification-modal-subtitle">Security Report for Message Review</p>
          </div>
          <button className="verification-modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="verification-modal-content">
          {/* Verification Journey */}
          <div className="verification-section">
            <button 
              className="section-header-button"
              onClick={() => toggleSection('journey')}
            >
              <div className="section-header">
                <h3>🛤️ Verification Journey</h3>
                {expandedSections.journey ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </button>
            {expandedSections.journey && (
              <div className="section-content">
                <div className="verification-path">
                  {verificationData.verificationPath.map((step, index) => (
                    <div key={index} className="path-item">
                      <div className="path-step">
                        <div className="step-number">{index + 1}</div>
                        <div className="step-name">{step}</div>
                      </div>
                      {index < verificationData.verificationPath.length - 1 && (
                        <div className="path-arrow">→</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Genuine Evidence */}
          <div className="verification-section">
            <button 
              className="section-header-button"
              onClick={() => toggleSection('genuine')}
            >
              <div className="section-header">
                <h3>✅ Genuine Evidence</h3>
                {expandedSections.genuine ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </button>
            {expandedSections.genuine && (
              <div className="section-content">
                <div className="evidence-list">
                  {verificationData.genuineEvidence.map((evidence, index) => (
                    <div key={index} className="evidence-item genuine-evidence">
                      <span className="evidence-bullet">✓</span>
                      <span className="evidence-text">{evidence}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Fake Evidence */}
          <div className="verification-section">
            <button 
              className="section-header-button"
              onClick={() => toggleSection('fake')}
            >
              <div className="section-header">
                <h3>⚠️ Fake Evidence</h3>
                {expandedSections.fake ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </button>
            {expandedSections.fake && (
              <div className="section-content">
                <div className="evidence-list">
                  {verificationData.fakeEvidence.map((evidence, index) => (
                    <div key={index} className="evidence-item fake-evidence">
                      <span className="evidence-bullet">✕</span>
                      <span className="evidence-text">{evidence}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Technical Details */}
          <div className="verification-section">
            <button 
              className="section-header-button"
              onClick={() => toggleSection('technical')}
            >
              <div className="section-header">
                <h3>🔧 Technical Analysis</h3>
                {expandedSections.technical ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </button>
            {expandedSections.technical && (
              <div className="section-content">
                <div className="technical-details">
                  {verificationData.technicalDetails.map((detail, index) => (
                    <div key={index} className="technical-item">
                      <span className="technical-label">{`[${index + 1}]`}</span>
                      <span className="technical-text">{detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Original Message */}
          <div className="verification-section">
            <div className="section-header">
              <h3>💬 Original Message</h3>
            </div>
            <div className="section-content message-display">
              <p>{data.messageContent}</p>
            </div>
          </div>
        </div>

        {/* Footer - Admin Action Buttons */}
        <div className="verification-modal-footer">
          <div className="action-buttons-group">
            <button 
              className="verification-action-btn btn-genuine"
              onClick={() => {
                onMarkGenuine(data.id);
                onClose();
              }}
            >
              <span className="btn-icon">✓</span>
              <span className="btn-text">Mark as Genuine</span>
            </button>
            <button 
              className="verification-action-btn btn-fake"
              onClick={() => {
                onMarkFake(data.id);
                onClose();
              }}
            >
              <span className="btn-icon">✕</span>
              <span className="btn-text">Mark as Fake</span>
            </button>
            <button 
              className="verification-action-btn btn-close"
              onClick={onClose}
            >
              <span className="btn-text">Close</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerificationModal;
