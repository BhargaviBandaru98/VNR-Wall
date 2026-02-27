import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/SubmitPage.css';
import axios from 'axios';
import 'flatpickr/dist/flatpickr.min.css';
import DiagnosticModal from '../components/DiagnosticModal';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:6105';

const SubmitPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isVerifying, setIsVerifying] = useState(false);
  const [pulseText, setPulseText] = useState("Analyzing Scammer Tactics...");
  const [showModal, setShowModal] = useState(false);
  const [resultData, setResultData] = useState(null);

  const [formData, setFormData] = useState({
    name: user?.name || '',
    roll: user?.roll || '',
    branch: user?.branch || '',
    year: user?.year_of_study || '',
    userEmail: user?.email || '',
    dateReceived: '',
    personalDetails: '',
    responded: 'No',
    responseDetails: '',
    message: '',
    send_email_notification: false
  });

  const pulseMessages = [
    "Analyzing Scammer Tactics...",
    "Scanning Fraud Databases...",
    "Verifying Company Metadata...",
    "Cross-referencing Official Portals...",
    "Calculating Risk Vector..."
  ];

  useEffect(() => {
    let interval;
    if (isVerifying) {
      let i = 0;
      interval = setInterval(() => {
        i = (i + 1) % pulseMessages.length;
        setPulseText(pulseMessages[i]);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isVerifying]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const pollResult = async (id) => {
    const maxAttempts = 15;
    let attempts = 0;

    const check = async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/api/datas/${id}`);
        if (res.data.ai_checked === 1) {
          setResultData(res.data);
          setIsVerifying(false);
          setShowModal(true);
          return true;
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
      return false;
    };

    const interval = setInterval(async () => {
      attempts++;
      const done = await check();
      if (done || attempts >= maxAttempts) {
        clearInterval(interval);
        if (!done) {
          setIsVerifying(false);
          alert("Verification is taking longer than usual. Check 'Your Messages' in few minutes.");
          navigate('/');
        }
      }
    }, 2000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsVerifying(true);

    try {
      const res = await axios.post(`${BACKEND_URL}/api/user-check-data`, {
        ...formData,
        platform: 'N/A',
        sender: 'N/A',
        contact: 'N/A',
        category: 'N/A',
        flags: [],
        genuineRating: '3'
      });

      if (res.data.success) {
        pollResult(res.data.id);
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      alert("Submission Failed. Please try again.");
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      import('flatpickr').then(({ default: flatpickr }) => {
        flatpickr("#dateReceived", {
          dateFormat: "d-m-Y",
          maxDate: "today",
          altInput: false,
          allowInput: true,
          disableMobile: true,
          onChange: (selectedDates, dateStr) => {
            setFormData(prev => ({ ...prev, dateReceived: dateStr }));
          }
        });
      });
    }
  }, []);

  return (
    <main className="form-container diagnostic-view">
      <div className="form-header">
        <h2>SCAM Investigation</h2>
        <p>Instant Diagnostic & Forensic Analysis</p>
        <div className="header-line"></div>
      </div>

      <form onSubmit={handleSubmit} className={isVerifying ? 'verifying-fade' : ''}>
        <div className="form-section">
          <h3>Primary Evidence</h3>

          <div className="input-group">
            <label htmlFor="message">Message in Circulation (Paste it as-is):</label>
            <textarea
              id="message"
              name="message"
              rows="8"
              placeholder="Paste the suspicious content here..."
              value={formData.message}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-row" style={{ display: 'flex', gap: '2rem' }}>
            <div className="input-group" style={{ flex: 1 }}>
              <label htmlFor="dateReceived">Date Received:</label>
              <input
                type="text"
                id="dateReceived"
                name="dateReceived"
                placeholder="dd-mm-yyyy"
                value={formData.dateReceived}
                required
              />
            </div>

            <div className="input-group" style={{ flex: 1 }}>
              <label>Personal Details Shared?</label>
              <select
                name="personalDetails"
                value={formData.personalDetails}
                onChange={handleChange}
                required
              >
                <option value="">Select Option</option>
                <option value="No">No</option>
                <option value="Yes">Yes (Full Details)</option>
                <option value="Mention">Mentioned Only</option>
              </select>
            </div>
          </div>

          {/* Conditional Response Field */}
          {(formData.personalDetails === 'Yes' || formData.personalDetails === 'Mention') && (
            <div className="input-group slide-in">
              <label htmlFor="responseDetails">Describe what details were shared:</label>
              <textarea
                name="responseDetails"
                id="responseDetails"
                rows="3"
                placeholder="e.g. Aadhaar, OTP, Payment made..."
                value={formData.responseDetails}
                onChange={handleChange}
                className="animated-slide"
              />
            </div>
          )}

          {/* Email Notification Toggle */}
          <div className="input-group slide-in" style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.8rem', background: 'rgba(37, 99, 235, 0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(37, 99, 235, 0.1)' }}>
            <input
              type="checkbox"
              id="send_email_notification"
              name="send_email_notification"
              checked={formData.send_email_notification}
              onChange={handleChange}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#2563eb' }}
            />
            <label htmlFor="send_email_notification" style={{ margin: 0, fontSize: '0.95rem', color: '#1e293b', cursor: 'pointer', fontWeight: '500' }}>
              Send notification once verified via mail
            </label>
          </div>
        </div>

        <button type="submit" className="submit-btn investigative-btn" disabled={isVerifying}>
          {isVerifying ? (
            <div className="safety-pulse">
              <div className="pulse-spinner"></div>
              <span>{pulseText}</span>
            </div>
          ) : (
            <>
              <span className="btn-icon">🔍</span>
              <span>VERIFY NOW</span>
            </>
          )}
          <div className="btn-ripple"></div>
        </button>
      </form>

      {isVerifying && (
        <div className="pulse-overlay">
          <div className="pulse-scanner"></div>
        </div>
      )}

      {resultData && (
        <DiagnosticModal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false);
            navigate('/');
          }}
          data={resultData}
        />
      )}
    </main>
  );
};

export default SubmitPage;