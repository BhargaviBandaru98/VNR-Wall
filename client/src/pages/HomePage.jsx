import React from 'react';
import ActionCard from '../components/ActionCard';
import '../styles/HomePage.css';
import Footer from '../components/Footer';
import logo from '../assets/logo2.jpeg';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFileExport } from "@fortawesome/free-solid-svg-icons";
import { Album } from "../components/Album.jsx";
import Hero from '../components/Hero.jsx';
import '../styles/theme.css';
import '../styles/HomePage.css'




const HomePage = () => {
  const [user, setUser] = React.useState(null);
  React.useEffect(() => {
    fetch(`${import.meta.env.VITE_AUTH_SERVER_URL}/check-auth`, {
      method: 'GET',
      credentials: 'include',
    })
      .then(res => res.json())
      .then(data => {
        if (data && data.user) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      });
  }, []);

  let fname = "Student";
  if (user && user.family_name) {
    fname = user.family_name;
  }

  return (
    <div className="homepage-container">
      <header className="hero1">
        <div className="hero-content">
          <div className="main-logo">
            <img src={logo} alt="VNR Wall Logo" className="subnav-logo" />
          </div>
          <h1 id="welcomeMessage">
            <svg className="welcome-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            Welcome, {fname}
          </h1>
          <p className='verify'>
           Verify Wall<span> - The Verify Zone</span>
          </p>
          <p className='secondaryPara'> To find out the genuine opportunities for the Relentless seeker in you.</p>
        </div>
      </header>

      <section className="card-section">
        <div className="row">
          <div className="col-md-6 col-sm-12 pri-card "><Hero /></div>
            
          <div className="col-sm-12 col-md-6">
        <ActionCard 
          logo={<FontAwesomeIcon icon={faFileExport} />}
          title="Submit a Message"
          className= 'col-md-4 home-card'
          description="Got a suspicious internship or placement opportunity? Let us verify it for you!"
          buttonText="Go to Submit Page"
          linkTo="/submit"
        />
        <ActionCard 
          logo={
            <Album width={48} height={48} className='view-responses'/>
          }
          title="View Submissions"
          className= 'col-md-4 home-card'
          description="Want to check the messages submitted and verified? Browse the responses."
          buttonText="View Responses"
          linkTo="/responses"
        />
        </div>
        </div>
      </section>
      <Footer/>
    </div>
  );
};

export default HomePage;