import React from "react";
import 'bootstrap/dist/css/bootstrap.min.css';  // ensure this is here (or in index.js)
import '../styles/Footer.css';

function Footer() {
  return (
     <div className="footer-container bg-slate-500
bg-clip-padding
backdrop-filter
backdrop-blur
bg-opacity-10
backdrop-saturate-100
backdrop-contrast-100">
      <h2 className="footer-heading">
        <div className="footer-logo-container">
          <div className="footer-logo-icon">
            <svg className="footer-shield-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
        </div>
        How to Use This Site
      </h2>

        <div className="row row-cols-1 row-cols-sm-2 row-cols-md-4 g-2 ">
          <div className="col">
            <div className="box">
              <strong>1. Submit doubtful messages:<br/></strong>
              If something looks fake, report it here in above submit page.
            </div>
          </div>
          <div className="col">
            <div className="box">
              <strong>2. Fill proper details:<br/></strong>
              More details = faster and accurate verification.
            </div>
          </div>
          <div className="col">
            <div className="box">
              <strong>3. Wait for review:</strong> Our team checks and verifies each report.
            </div>
          </div>
          <div className="col">
          <div className="box">
            <strong>4. View verified info:</strong> See if your or others' reports are marked as Fake or Genuine.
          </div>
          </div>
        </div>

        <p className="footer-tagline mt-4 text-center">
          <span style={{ fontWeight: 'bold' }}>© 2025 Verify Wall</span> — Built with 💙 to protect students from fraud
        </p>
      </div>
    
  );
}

export default Footer;
