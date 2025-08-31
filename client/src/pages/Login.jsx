import React, { useEffect, useState } from "react";
import "../styles/Login.css";


const Login = () => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token = params.get("access_token");
    if (token) {
      setIsLoading(true);
      fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then((res) => res.json())
        .then((u) => {
          setUser(u);
          setIsLoading(false);
          window.history.replaceState({}, document.title, "/profile");
        })
        .catch((err) => {
          console.error("Failed to fetch user info:", err);
          setIsLoading(false);
        });
    }
  }, []);

  const handleLogin = () => {
    setIsLoading(true);
    const clientId =
      "454432176985-mau86u28qd49dd3n2hfeh7mpi75qlse5.apps.googleusercontent.com";
    const redirectUri = "https://e73b-103-248-208-99.ngrok-free.app/login";
    const scope =
      "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=${encodeURIComponent(
      scope
    )}&include_granted_scopes=true&state=login`;
    window.location.href = url;
  };

  const handleLogout = () => {
    setUser(null);
  };

  return (
    <div className="login-container">
      <div className="login-wrapper">
        {user ? (
          // Student Profile/Logout View
          <div className="logout-card">
            <div className="logout-header">
              <div className="user-avatar">
                <svg className="user-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <h2 className="logout-title">Student Profile</h2>
              <p className="logout-subtitle">VNR WALL - Verified Student Account</p>
            </div>
            
            <div className="logout-content">
              {/* Student Information */}
              <div className="student-info">
                <div className="info-card">
                  <div className="info-row">
                    <span className="info-label">Student Name:</span>
                    <span className="info-value">{user?.name || 'Student'}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Email:</span>
                    <span className="info-value">{user?.email}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Login Time:</span>
                    <span className="info-value">{new Date().toLocaleString()}</span>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="status-badge1">
                  <svg className="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 12l2 2 4-4"/>
                    <circle cx="12" cy="12" r="10"/>
                  </svg>
                  <span className="status-text">Verified Student Account</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="action-buttons">
                {/* Submit for Verification Button */}
                <button className="action-btn submit-btn" to="submit">
                  <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22,2 15,22 11,13 2,9 22,2"/>
                  </svg>
                  Submit for Verification
                </button>

                {/* Home Page Button */}
                <button className="action-btn home-btn" to ="">
                  <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                    <polyline points="9,22 9,12 15,12 15,22"/>
                  </svg>
                  Go to Home Page
                </button>

                {/* Logout Button */}
                <button onClick={handleLogout} className="action-btn logout-btn">
                  <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16,17 21,12 16,7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Logout
                </button>
              </div>

              {/* Instructions */}
              <div className="instructions">
                <p className="instructions-title">Quick Navigation Guide:</p>
                <p className="instructions-text">
                  • Use "Submit for Verification" to verify new opportunities<br/>
                  • Use "Go to Home Page" to access your dashboard<br/>
                  • Use "Logout" to securely exit your account
                </p>
              </div>
            </div>
          </div>
        ) : (
          // Login View with New UI
          <>
            {/* Logo and Branding */}
            <div className="login-branding">
              <div className="logo-container">
                <div className="logo-icon">
                  <svg className="shield-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                </div>
              </div>
              <h1 className="app-title">VNR WALL</h1>
              <p className="app-subtitle">The Verify Zone for Genuine Opportunities</p>
            </div>

            {/* Login Card */}
            <div className="login-card">
              <div className="login-header">
                <h2 className="login-title">Welcome Back!</h2>
                <p className="login-subtitle">Login to continue verifying opportunities</p>
              </div>
              
              <div className="login-content">
                <div className="login-form">
                  {/* Login Button */}
                  <button
                    onClick={handleLogin}
                    disabled={isLoading}
                    className="login-btn"
                  >
                    {isLoading ? (
                      <div className="loading-content">
                        <div className="spinner"></div>
                        Logging in...
                      </div>
                    ) : (
                      'Login with College Mail ID to Access'
                    )}
                  </button>
                </div>

                {/* Motivational Message */}
                <div className="security-message">
                  <div className="security-header">
                    <svg className="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 12l2 2 4-4"/>
                      <circle cx="12" cy="12" r="10"/>
                    </svg>
                    <span className="security-text">Secure & Verified</span>
                  </div>
                  <p className="security-quote">
                    "Let's keep your future secure with verified opportunities"
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="login-footer">
              <p className="footer-text">
                © 2024 VNR WALL. Securing your academic journey.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Login;