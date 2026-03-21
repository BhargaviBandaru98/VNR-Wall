import React, { useState } from 'react';
import { ShieldAlert, Link as LinkIcon, AlertTriangle, ShieldCheck } from 'lucide-react';
import '../styles/LinkSafetyModal.css';

const LinkSafetyModal = ({ isOpen, onClose, onSubmitUrl, onSkip, isRisky }) => {
  const [url, setUrl] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (url.trim()) {
      onSubmitUrl(url.trim());
      setUrl('');
    }
  };

  const handleSkip = () => {
    onSkip();
    setUrl('');
  };

  return (
    <div className="link-safety-overlay">
      <div className={`link-safety-modal ${isRisky ? 'risky' : 'safe'}`}>
        <div className="modal-header">
          {isRisky ? (
            <AlertTriangle className="header-icon risky-icon" size={28} />
          ) : (
            <ShieldCheck className="header-icon safe-icon" size={28} />
          )}
          <h2>⚠️ Hidden Link Detected</h2>
        </div>

        <div className="modal-body">
          {isRisky ? (
            <div className="warning-content risky-content">
              <p className="intro-text">
                This message contains a potentially risky hidden link (e.g., 'Click Here').
              </p>
              <div className="alert-box">
                <AlertTriangle size={18} />
                <p>⚠️ It may lead to harmful or phishing pages.</p>
              </div>

              <div className="options-container">
                <div className="option-box risky-option">
                  <h4>Option 1 (Risky but accurate):</h4>
                  <p>👉 Open link at your own risk, copy final URL, paste below</p>
                  <p className="strict-warning">⚠️ Do NOT allow permissions or submit anything</p>
                </div>
                <div className="option-box safe-option">
                  <h4>Option 2 (Safe):</h4>
                  <p>👉 Let system verify without opening the link</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="warning-content safe-content">
              <p className="intro-text">
                This message contains a clickable link (e.g., 'Click Here').
              </p>
              <p className="action-text">To improve verification accuracy:</p>
              <p className="instruction">👉 Click the link and paste the final URL here.</p>
              
              <div className="alert-box">
                <h4>⚠️ IMPORTANT:</h4>
                <ul>
                  <li>Do NOT allow permissions</li>
                  <li>Do NOT login or submit anything</li>
                  <li>Only open and copy the URL</li>
                </ul>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="url-form">
            <div className="input-with-icon">
              <LinkIcon size={18} className="input-icon" />
              <input
                type="url"
                placeholder="https://..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </div>
            
            <div className="modal-actions">
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={handleSkip}
              >
                {isRisky ? 'Verify Without Link' : 'Skip and Continue Verification'}
              </button>
              <button 
                type="submit" 
                className={`btn-primary ${isRisky ? 'btn-danger' : 'btn-safe'}`}
                disabled={!url.trim()}
              >
                {isRisky ? 'Submit URL (at your risk)' : 'Submit URL'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LinkSafetyModal;
