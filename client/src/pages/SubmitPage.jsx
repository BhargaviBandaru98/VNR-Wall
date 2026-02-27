import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/SubmitPage.css';
import axios from 'axios';
import 'flatpickr/dist/flatpickr.min.css';
import DiagnosticModal from '../components/DiagnosticModal';
import StudentMessageCard from '../components/StudentMessageCards';
import { Shield } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:6105';

const SubmitPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isVerifying, setIsVerifying] = useState(false);
  const [pulseText, setPulseText] = useState("Analyzing Scammer Tactics...");
  const [showModal, setShowModal] = useState(false);
  const [resultData, setResultData] = useState(null);

  const [formData, setFormData] = useState({
    userEmail: user?.email || '',
    dateReceived: '',
    personalDetails: '',
    responseDetails: '',
    message: '',
    send_email_notification: false
  });

  const pulseMessages = [
    "Analyzing Scammer Tactics...",
    "Scanning Fraud Databases...",
    "Verifying Company Metadata...",
    "Cross-referencing Official Portals...",
    "Calculating Risk Vector...",
    "Deep Analysis in Progress... This might take up to a minute.",
    "Running extended heuristic sweeps...",
    "Connecting to advanced fraud registries...",
    "Finalizing forensic diagnostic..."
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
    const maxAttempts = 60; // Increased to 120 seconds to accommodate deep Serper/Firecrawl searches
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

      // Dynamic psychological loading text at the halfway mark
      if (!done && attempts === 20) {
        setPulseText("Deep Analysis in Progress... Checking historical databases.");
      }

      if (done || attempts >= maxAttempts) {
        clearInterval(interval);
        if (!done) {
          setIsVerifying(false);
        }
      }
    }, 2000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsVerifying(true);

    try {
      const res = await axios.post(`${BACKEND_URL}/api/user-check-data`, formData);

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

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        <form onSubmit={handleSubmit} className={isVerifying ? 'verifying-fade' : ''} style={{ width: '60%', minWidth: '320px', padding: '1rem' }}>
          <div className="form-section">
            <h3><Shield size={22} style={{ marginRight: '8px', verticalAlign: 'middle', color: '#2563eb' }} />Primary Evidence</h3>

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

        {/* Embedded Verification Summary Card */}
        {resultData && !showModal && (
          <div style={{ width: '60%', minWidth: '320px', marginTop: '2rem', paddingBottom: '3rem' }}>
            <StudentMessageCard data={resultData} />
          </div>
        )}
      </div>

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
          }}
          data={resultData}
        />
      )}
    </main>
  );
};

export default SubmitPage;