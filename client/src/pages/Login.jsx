import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../styles/Login.css";


const Login = () => {
  const { user, login, logout, isAuthenticated } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    // Handle OAuth callback
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token = params.get("access_token");
    
    if (token) {
      setIsLoading(true);
      setError("");
      
      fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then((res) => res.json())
        .then((userData) => {
          try {
            // Validate and login user
            const loggedInUser = login(userData);
            setIsLoading(false);
            
            // Clear URL hash
            window.history.replaceState({}, document.title, "/login");
            
            // Show success message with role
            alert(`Welcome ${loggedInUser.name}! Logged in as ${loggedInUser.role.toUpperCase()}`);
            
            // Redirect based on role
            if (loggedInUser.isAdmin) {
              navigate("/responses");
            } else {
              navigate("/");
            }
          } catch (err) {
            setIsLoading(false);
            setError(err.message);
            // Clear invalid token from URL
            window.history.replaceState({}, document.title, "/login");
          }
        })
        .catch((err) => {
          console.error("Failed to fetch user info:", err);
          setIsLoading(false);
          setError("Failed to fetch user information. Please try again.");
          window.history.replaceState({}, document.title, "/login");
        });
    }
  }, [login, navigate]);

  const handleLogin = () => {
    setIsLoading(true);
    setError("");
    // const clientId = "454432176985-mau86u28qd49dd3n2hfeh7mpi75qlse5.apps.googleusercontent.com";
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

    // ✅ FIXED: Use environment variable for frontend URL
    const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL || 'http://localhost:3105';
    const redirectUri = `${FRONTEND_URL}/login`;
    
    const scope = "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";
    
    // ✅ REMOVED: &hd=vnrvjiet.in (to allow Gmail admin logins)
   const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=${encodeURIComponent(
  scope
)}&include_granted_scopes=true&state=login`;
    
    window.location.href = url;
  };

  const handleLogout = () => {
    logout();
    setError("");
    navigate("/login");
  };

  const handleNavigate = (path) => {
    navigate(path);
  };

  // If user is authenticated, show profile
  if (isAuthenticated && user) {
    return (
      <div className="login-container">
        <div className="login-wrapper">
          <div className="logout-card">
            <div className="logout-header">
              <div className="user-avatar">
                <svg className="user-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <h2 className="logout-title">
                {user.isAdmin ? "Admin Profile" : "Student Profile"}
              </h2>
              <p className="logout-subtitle">
                VNR WALL - {user.isAdmin ? "Administrator Account" : "Verified Student Account"}
              </p>
            </div>
            
            <div className="logout-content">
              {/* Student/Admin Information */}
              <div className="student-info">
                <div className="info-card">
                  <div className="info-row">
                    <span className="info-label">{user.isAdmin ? "Admin Name:" : "Student Name:"}</span>
                    <span className="info-value">{user.name || 'User'}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Email:</span>
                    <span className="info-value">{user.email}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Role:</span>
                    <span className="info-value" style={{ 
                      color: user.isAdmin ? '#ef4444' : '#10b981',
                      fontWeight: '700'
                    }}>
                      {user.role.toUpperCase()}
                    </span>
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
                  <span className="status-text">
                    {user.isAdmin ? "Administrator Access" : "Verified Student Account"}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="action-buttons">
                {/* Admin-specific buttons */}
                {user.isAdmin && (
                  <button className="action-btn submit-btn" onClick={() => handleNavigate("/responses")}>
                    <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                    </svg>
                    View All Submissions (Admin)
                  </button>
                )}

                {/* Student-specific buttons */}
                {!user.isAdmin && (
                  <>
                    <button className="action-btn submit-btn" onClick={() => handleNavigate("/submit")}>
                      <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="22" y1="2" x2="11" y2="13"/>
                        <polygon points="22,2 15,22 11,13 2,9 22,2"/>
                      </svg>
                      Submit for Verification
                    </button>

                    <button className="action-btn home-btn" onClick={() => handleNavigate("/")}>
                      <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                        <polyline points="9,22 9,12 15,12 15,22"/>
                      </svg>
                      Go to Home Page
                    </button>
                  </>
                )}

                {/* Logout Button (for both) */}
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
                  {user.isAdmin ? (
                    <>
                      • Use "View All Submissions" to manage all student submissions<br/>
                      • Mark submissions as Genuine or Fake<br/>
                      • Use "Logout" to securely exit your account
                    </>
                  ) : (
                    <>
                      • Use "Submit for Verification" to verify new opportunities<br/>
                      • Use "Go to Home Page" to access your dashboard<br/>
                      • Use "Logout" to securely exit your account
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Login view
  return (
    <div className="login-container">
      <div className="login-wrapper">
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
            <p className="login-subtitle">Login with your college email to continue</p>
          </div>
          
          <div className="login-content">
            <div className="login-form">
              {/* Error Message */}
              {error && (
                <div style={{
                  backgroundColor: '#fee2e2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  fontSize: '0.875rem',
                  textAlign: 'center'
                }}>
                  {error}
                </div>
              )}

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
                  'Login with College Mail ID (@vnrvjiet.in)'
                )}
              </button>
            </div>

            {/* Security Message */}
            <div className="security-message">
              <div className="security-header">
                <svg className="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4"/>
                  <circle cx="12" cy="12" r="10"/>
                </svg>
                <span className="security-text">Secure & Verified</span>
              </div>
              <p className="security-quote">
                "Only college email IDs (@vnrvjiet.in) are allowed to login"
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
      </div>
    </div>
  );
};

export default Login;