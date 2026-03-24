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
Report any suspicious or fake-looking message through the Submit Page along with the source.
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
              <strong>3. Instant AI verification: </strong> 
Our system automatically analyzes and gives a quick result.
            </div>
          </div>
          <div className="col">
          <div className="box">
            <strong>4. View results</strong> Check the final status of reports anytime, updated in real-time.
          </div>
          </div>
        </div>


      </div>
    
  );
}

export default Footer;
