import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { SunMedium, MoonStar } from 'lucide-react';
import HomePage from './pages/HomePage';
import SubmitPage from './pages/SubmitPage';
import ViewResponsesPage from './pages/ViewResponsePage.jsx';
import Login from './pages/Login';
import './App.css';
import NavigationBar from './components/NavigationBar';
import './styles/theme.css';
import { Profiler } from 'react';

function App() {
  const [theme, setTheme] = useState('light'); // 'light' or 'dark'
  const themeBtnRef = useRef(null);
  const themeIconRef = useRef(null);

  // Detect initial theme from localStorage or system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      console.log(savedTheme);
      setTheme(savedTheme);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
    }
  }, []);

  // Listen for system theme changes if no manual override
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = e => {
      if (!localStorage.getItem('theme')) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Apply theme & save it whenever it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Toggle theme on button click
  const toggleTheme = () => {
    setTheme(prev => {
      const newTheme = prev === 'light' ? 'dark' : 'light';
      if (themeBtnRef.current && themeIconRef.current) {
        themeBtnRef.current.style.backgroundColor =
          newTheme === 'light' ? 'lightgrey' : '#D7AEFB';
        themeIconRef.current.style.transform =
          newTheme === 'light' ? 'translateX(-100%)' : 'translateX(0%)';
        themeIconRef.current.style.transition = 'all 0.3s ease';
      }
      return newTheme;
    });
  };
  // window.location.reload();
  return (
    <Router>
      <div className="app">
        {/* Navigation bar with mobile theme toggle */}
        <NavigationBar
          theme={theme}
          toggleTheme={toggleTheme}
          themeBtnRef={themeBtnRef}
          themeIconRef={themeIconRef}
        />

        {/* Routes */}
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/submit" element={<SubmitPage />} />
          <Route path="/responses" element={<ViewResponsesPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/profile" element={<Login />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>

        {/* Desktop-only Theme Toggle */}
        <div className="desktop-only" style={{ textAlign: 'right', padding: '0.5rem 1rem' }}>
          <button
            ref={themeBtnRef}
            onClick={toggleTheme}
            className="theme-toggle-btn"
            aria-label="Toggle Theme"
          >
            <div
              ref={themeIconRef}
              className="theme-icon"
              style={{ position: 'relative' }}
            >
              {theme === 'light'
                ? <SunMedium size={24} />
                : <MoonStar size={24} />}
            </div>
          </button>
        </div>
      </div>
    </Router>
  );
}

export default App;
