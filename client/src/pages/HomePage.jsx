import React from 'react';
import { useAuth } from '../context/AuthContext';
import ActionCard from '../components/ActionCard';
import '../styles/HomePage.css';
import Footer from '../components/Footer';
import logo from '../assets/logo2.jpeg';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileExport } from "@fortawesome/free-solid-svg-icons";
import { Album } from "../components/Album.jsx";
import Hero from '../components/Hero.jsx';
import '../styles/theme.css';
import '../styles/HomePage.css';

const HomePage = () => {
  const { user } = useAuth();

  let fname = "Student";
  if (user) {
    fname = user.family_name || user.name?.split(' ')[0] || "Student";
  }

  return (
    <div className="homepage-container">
      <header className="hero1">
        <div className="hero-content">
          <div className="main-logo">
            <img src={logo} alt="VerifyWall Logo" className="subnav-logo" />
          </div>
          <h1 id="welcomeMessage">
            <svg className="welcome-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Welcome, {fname}
          </h1>
          <p className='verify'>
            VerifyWall<span> - The Verify Zone</span>
          </p>
          <p className='secondaryPara'>To find out the genuine opportunities for the Relentless seeker in you.</p>
        </div>
      </header>

      <section className="card-section">
        <div className="row">
          <div className="col-md-6 col-sm-12 pri-card"><Hero /></div>

          <div className="col-sm-12 col-md-6">
            <ActionCard
              logo={<FontAwesomeIcon icon={faFileExport} />}
              title="Submit a Message"
              className='col-md-4 home-card'
              description="Got a suspicious internship or placement opportunity? Let us verify it for you!"
              buttonText="Go to Submit Page"
              linkTo="/submit"
            />

            {/* ✅ FIXED: Show for ALL users, not just admin */}
            <ActionCard
              logo={<Album width={48} height={48} className='view-responses' />}
              title={user?.isAdmin ? "View Submissions (Admin)" : "View Submissions"}
              className='col-md-4 home-card'
              description={user?.isAdmin
                ? "Review and verify all student submissions. Mark as genuine or scam."
                : "Want to check the messages submitted and verified? Browse the responses."}
              buttonText="View Responses"
              linkTo="/responses"
            />
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default HomePage;