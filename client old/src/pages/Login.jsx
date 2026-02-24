import React, { useEffect, useState, useRef } from "react";
import "../styles/Login.css";
import '../components/NavigationBar.jsx'; // Import NavigationBar for consistent styling
// import dotenv from "dotenv";
// dotenv.config();

const API_URL = import.meta.env.VITE_AUTH_SERVER_URL; // Use .env for backend API URL

const Login = () => {
  const [user, setUser] = useState(null); // Stores the logged-in user's info
  const [isLoading, setIsLoading] = useState(false); // For general loading states (login/logout)
  const [googleClientId, setGoogleClientId] = useState(null); // Fetched Google Client ID

  // Ref for the Google Sign-In button container
  const googleSignInButtonRef = useRef(null);

  // --- Utility: Get Cookie Value (from original SSO sample) ---
  const getCookieValue = (name) => {
    const cookieString = document.cookie;
    const cookies = cookieString.split('; ');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].split('=');
      if (cookie[0] === name) {
        return decodeURIComponent(cookie[1]);
      }
    }
    return null;
  };

  // --- Utility: Decode JWT (if the user cookie is a JWT) ---
  const decodeJwt = (token) => {
    try {
      if (!token || token.split('.').length !== 3) {
        return {};
      }
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c =>
        '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      ).join(''));
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error("Error decoding JWT:", error);
      return {};
    }
  };

  // --- Function to update user state based on the 'user' cookie and localStorage ---
  const updateUserStateFromCookie = async () => {
    console.log("Login.js: updateUserStateFromCookie called");

    try {
      const response = await fetch(`${API_URL}/check-auth`, {
        credentials: "include", // important for cookies
      });

      const data = await response.json();

      console.log("Auth response:", data);

      if (data.logged_in && data.user) {
        const user = data.user;

        setUser({
          name: user.name || user.family_name || "Student",
          email: user.email || "",
          picture: user.picture || "",
        });

        // Dispatch login event for NavigationBar
        window.dispatchEvent(new Event("user-login"));
      } else {
        setUser(null);
        window.dispatchEvent(new Event("user-logout"));

      } 
    } catch (error) {
      console.error("Auth check failed:", error);
      setUser(null);
      window.dispatchEvent(new Event('user-logout'));
    }
  };

  // --- Google Credential Response Handler (from SSO sample) ---
  const handleCredentialResponse = async (response) => {
    setIsLoading(true);
    const idToken = response.credential; // This is the ID Token from Google
    console.log("Login.js: Google credential response received.");

    try {
      const res = await fetch(`${API_URL}/auth/google`, {
        method: "POST",
        credentials: "include", // Important for sending cookies
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: idToken }), // Send the ID Token to your backend
      });

      const data = await res.json();
      if (data.user) { // Assuming `data.user` indicates success and contains user info
        console.log("Login.js: Backend auth successful. Updating user state.");
        updateUserStateFromCookie(); // This will now update localStorage and dispatch event
        setUser(data.user); // Update local state immediately for responsiveness
        console.log(" Dispatching 'user-login' event.");
        window.dispatchEvent(new Event("user-login"));
        // window.location.reload(); // Reload to ensure the UI reflects the new user state
      } else {
        alert("❌ Login failed! " + (data.message || "Please try again."));
        setUser(null);
        console.log("Login.js: Login failed from backend. Dispatching 'loginStatusChanged' event.");
        window.dispatchEvent(new Event('loginStatusChanged')); // <--- EXPLICIT DISPATCH ON FAILURE
      }
    } catch (error) {
      console.error("Login.js: Error during Google authentication:", error);
      alert("Error during login. Please try again.");
      setUser(null);
      console.log("Login.js: Error during auth fetch. Dispatching 'loginStatusChanged' event.");
      window.dispatchEvent(new Event('loginStatusChanged')); // <--- EXPLICIT DISPATCH ON ERROR
    } finally {
      setIsLoading(false);
    }
  };

  // --- Initialize Google Sign-In Library ---
  const initializeGoogleSignIn = () => {
    if (!googleClientId || !window.google || !window.google.accounts || !googleSignInButtonRef.current) {
      console.log("Login.js: GSI initialization requirements not met.", { googleClientId, googleAPILoaded: !!(window.google && window.google.accounts), buttonRef: !!googleSignInButtonRef.current });
      return;
    }

    try {
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleCredentialResponse,
        hosted_domain: "vnrvjiet.in", // Crucial for filtering accounts
        ux_mode: "popup", // Opens Google's sign-in flow in a popup
      });

      // Render the Google Sign-In button into the div with the ref
      window.google.accounts.id.renderButton(
        googleSignInButtonRef.current,
        { theme: "outline", size: "large", text: "signin_with", shape: "rectangular" } // Customize button appearance
      );
      console.log("Login.js: Google Sign-In button rendered.");

    } catch (error) {
      console.error("Login.js: Error initializing Google Sign-In:", error);
    }
  };

  // --- Fetch Google Client ID from backend ---
  const fetchGoogleClientId = async () => {
    try {
      // For demonstration, hardcoding the client ID.
      // In a real application, fetch this from your backend endpoint:
      // const res = await fetch('/get-google-client-id');
      // const data = await res.json();
      // setGoogleClientId(data.apiKey);
      setGoogleClientId(import.meta.env.VITE_GOOGLE_CLIENT_ID);
      console.log("Login.js: Google Client ID fetched successfully.");
    } catch (error) {
      console.error("Login.js: Error fetching Google Client ID:", error);
    }
  };

  // --- Logout Handler (adapted from SSO sample) ---
  const handleLogout = async () => {
    const confirmLogout = window.confirm("Are you sure you want to log out?");
    if (!confirmLogout) return;

    setIsLoading(true);
    console.log("Login.js: Attempting logout.");

    try {
      await fetch(`${API_URL}/logout`, {
        method: "POST",
        credentials: "include", // Important for sending cookies to clear session
      });
      // window.location.reload(); // Reload to ensure the UI reflects the new user state
      window.dispatchEvent(new Event("user-logout"));
      // Do not clear user state or localStorage here directly,
      // let updateUserStateFromCookie handle it based on the cleared cookie
      console.log("Login.js: Backend logout successful. Updating user state.");
      updateUserStateFromCookie(); // This will read the now-cleared cookie, update state, localStorage, and dispatch event
      // Optionally, redirect to login page after logout
      // window.location.href = "/login";
    } catch (error) {
      console.error("Login.js: Error logging out:", error);
      alert("Error logging out. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Effect 1: Initial load and GSI script loading
  useEffect(() => {
    console.log("Login.js: Initial useEffect run.");
    updateUserStateFromCookie(); // Check for existing session on mount
    fetchGoogleClientId(); // Fetch client ID once

    // Dynamically load Google Identity Services script if not already present
    if (!window.google || !window.google.accounts) {
      const script = document.createElement('script');
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);

      script.onload = () => {
        console.log("Login.js: Google GSI script loaded.");
        if (googleClientId) {
          initializeGoogleSignIn();
        }
      };
      script.onerror = (e) => console.error("Login.js: Failed to load Google GSI client script", e);

      return () => {
        document.head.removeChild(script);
      };
    } else {
      console.log("Login.js: Google GSI script already present.");
      if (googleClientId) {
        initializeGoogleSignIn();
      }
    }
  }, [googleClientId]);

  // Effect 2: Re-initialize GSI button when user state changes (e.g., after logout)
  // This ensures the button is re-rendered correctly when the login view becomes active.
  useEffect(() => {
    if (!user && googleClientId && window.google && window.google.accounts && googleSignInButtonRef.current) {
      console.log("Login.js: User logged out, attempting to re-initialize GSI button.");
      // Small delay to ensure the DOM element is fully painted after state change
      const timer = setTimeout(() => {
        initializeGoogleSignIn();
      }, 100); // Short delay

      return () => clearTimeout(timer);
    }
  }, [user, googleClientId]);


  return (
    <div className="login-container">
      <div className="login-wrapper">
        {user ? (
          // Student Profile/Logout View
          <div className="logout-card profile-card">
            <div className="logout-header profile-header">
              <div className="user-avatar">
                <svg className="user-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <h2 className="logout-title profile-title">Student Profile</h2>
              <p className="logout-subtitle profile-subtitle">VNR WALL - Verified Student Account</p>
            </div>

            <div className="logout-content profile-content">
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
              </div>

              {/* Action Buttons */}
              <div className="action-buttons">
                {/* Submit for Verification Button */}
                <button
                  className="action-btn submit-btn"
                  onClick={() => window.location.href = "/submit"} // Example URL for verification
                >
                  <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22,2 15,22 11,13 2,9 22,2" />
                  </svg>
                  Submit for Verification
                </button>

                {/* Responses Button */}
                <button
                  className="action-btn responses-btn"
                  onClick={() => window.location.href = "/"} // Example URL for home page
                >
                  <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9,22 9,12 15,12 15,22" />
                  </svg>
                  Go to Responses Page
                </button>

                {/* Home Page Button */}
                <button
                  className="action-btn home-btn"
                  onClick={() => window.location.href = "/"} // Example URL for home page
                >
                  <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9,22 9,12 15,12 15,22" />
                  </svg>
                  Go to Home Page
                </button>

                {/* Logout Button */}
                <button onClick={handleLogout} className="action-btn logout-btn" disabled={isLoading}>
                  {isLoading ? (
                    <div className="loading-content">
                      <div className="spinner"></div>
                      Logging out...
                    </div>
                  ) : (
                    <>
                      <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16,17 21,12 16,7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      Logout
                    </>
                  )}
                </button>
              </div>

              {/* Instructions */}
              {/* <div className="instructions">
                <p className="instructions-title">Quick Navigation Guide:</p>
                <p className="instructions-text">
                  • Use "Submit for Verification" to verify new opportunities<br />
                  • Use "Go to Home Page" to access your dashboard<br />
                  • Use "Logout" to securely exit your account
                </p>
              </div> */}
            </div>
          </div>
        ) : (
          // Login View with New UI and Google Sign-In
          <>
            {/* Logo and Branding */}
            <div className="login-branding">
              <div className="logo-container">
                <div className="logo-icon">
                  <svg className="shield-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
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
                  {/* The Google Sign-In button will be rendered into this div by the GSI library */}
                  {/* This div is crucial for the GSI button to be rendered, and its centering is handled by CSS */}
                  <div
                    ref={googleSignInButtonRef}
                    id="g_id_signin"
                    className="google-login-btn"
                  ></div>
                </div>

                {/* Motivational Message */}
                <div className="security-message">
                  <div className="security-header">
                    <svg className="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 12l2 2 4-4" />
                      <circle cx="12" cy="12" r="10" />
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
