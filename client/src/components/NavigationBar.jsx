import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import './Navi.css';
import logo from '../assets/logo2.jpeg';
import '../styles/Navbar.css';
import { FaHome, FaEnvelopeOpenText, FaListAlt, FaUser, FaChartBar } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';

function NavigationBar() {
  const { user } = useAuth();
  const isLoggedIn = !!user;
  const [isMobile, setIsMobile] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const navRef = useRef(null);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);

    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Toggle Menu manually
  const toggleMenu = () => {
    const nav = navRef.current;
    if (!nav) return;

    if (menuVisible) {
      collapseMenu(nav);
    } else {
      expandMenu(nav);
    }
    setMenuVisible(!menuVisible);
  };

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      const nav = navRef.current;
      const toggler = document.querySelector('.navbar-toggler');

      if (
        menuVisible &&
        nav &&
        !nav.contains(event.target) &&
        !toggler.contains(event.target)
      ) {
        collapseMenu(nav);
        setMenuVisible(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuVisible]);

  return (
    <div className="navbar navbar-expand-md p-2">
      <Link className="navbar-brand mx-md-4" to="">
        <img src={logo} alt="VerifyWall Logo" className="logo" />
      </Link>

      <button
        className="navbar-toggler ms-0"
        type="button"
        onClick={toggleMenu}
      >
        <span className="navbar-toggler-icon"></span>
      </button>

      <div
        ref={navRef}
        className={`custom-collapse navbar-collapse justify-content-end ${menuVisible ? 'showing' : ''}`}
      >
        <ul className="navbar-nav pr-5">
          <li className="nav-item">
            <Link className="nav-link" to="">
              <FaHome className="nav-icon" /> Home
            </Link>
          </li>
          <li className="nav-item">
            <Link className="nav-link" to="submit">
              <FaEnvelopeOpenText className="nav-icon" /> Submit Info
            </Link>
          </li>
          <li className="nav-item">
            <Link className="nav-link" to="responses">
              <FaListAlt className="nav-icon" /> View Responses
            </Link>
          </li>
          {user?.isAdmin && (
            <li className="nav-item">
              <Link className="nav-link" to="admin/analytics">
                <FaChartBar className="nav-icon" /> Analytics
              </Link>
            </li>
          )}
          <li className="nav-item">
            <Link className="nav" to="login">
              <button className="btn btn-primary px-3 mx-2">
                <FaUser className="nav-icon" /> {isLoggedIn ? 'Profile' : 'Login'}
              </button>
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}

// Utility to expand with animation
function expandMenu(el) {
  el.style.display = 'block';
  const height = el.scrollHeight;
  el.style.height = '0px';

  requestAnimationFrame(() => {
    el.style.transition = 'height 300ms ease';
    el.style.height = height + 'px';
  });

  el.addEventListener('transitionend', () => {
    el.style.height = '';
    el.style.transition = '';
  }, { once: true });
}

// Utility to collapse with animation
function collapseMenu(el) {
  const height = el.scrollHeight;
  el.style.height = height + 'px';

  requestAnimationFrame(() => {
    el.style.transition = 'height 300ms ease';
    el.style.height = '0px';
  });

  el.addEventListener('transitionend', () => {
    el.style.display = 'none';
    el.style.height = '';
    el.style.transition = '';
  }, { once: true });
}

export default NavigationBar;
