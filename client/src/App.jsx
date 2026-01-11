import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { SunMedium, MoonStar } from 'lucide-react';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import HomePage from './pages/HomePage';
import SubmitPage from './pages/SubmitPage';
import ViewResponsesPage from './pages/ViewResponsePage.jsx';
import Login from './pages/Login';
import './App.css';
import NavigationBar from './components/NavigationBar';
import './styles/theme.css';

function App() {
  const [theme, setTheme] = useState('light');
  const themeBtnRef = useRef(null);
  const themeIconRef = useRef(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    let initialTheme;
    if (savedTheme) {
      initialTheme = savedTheme;
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      initialTheme = prefersDark ? 'dark' : 'light';
    }
    setTheme(initialTheme);

    if (themeBtnRef.current && themeIconRef.current) {
      themeBtnRef.current.style.backgroundColor =
        initialTheme === 'light' ? 'lightgrey' : '#D7AEFB';
      themeIconRef.current.style.transform =
        initialTheme === 'light' ? 'translateX(0%)' : 'translateX(100%)';
    }
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = e => {
      if (!localStorage.getItem('theme')) {
        const sysTheme = e.matches ? 'dark' : 'light';
        setTheme(sysTheme);
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => {
      const newTheme = prev === 'light' ? 'dark' : 'light';
      if (themeBtnRef.current && themeIconRef.current) {
        themeBtnRef.current.style.backgroundColor =
          newTheme === 'light' ? 'lightgrey' : '#D7AEFB';
        themeIconRef.current.style.transform =
          newTheme === 'light' ? 'translateX(0%)' : 'translateX(100%)';
        themeIconRef.current.style.transition = 'all 0.3s ease';
      }
      return newTheme;
    });
  };

  return (
    <AuthProvider>
      <Router>
        <div className="app">
          <NavigationBar
            theme={theme}
            toggleTheme={toggleTheme}
            themeBtnRef={themeBtnRef}
            themeIconRef={themeIconRef}
          />

          <Routes>
            {/* Public route */}
            <Route path="/login" element={<Login />} />
            
            {/* Protected routes - require login */}
            <Route 
              path="/" 
              element={
                <ProtectedRoute>
                  <HomePage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/submit" 
              element={
                <ProtectedRoute>
                  <SubmitPage />
                </ProtectedRoute>
              } 
            />
            
            {/* ✅ FIXED: View Responses accessible to ALL logged-in users */}
            <Route 
              path="/responses" 
              element={
                <ProtectedRoute>
                  <ViewResponsesPage />
                </ProtectedRoute>
              } 
            />
            
            {/* Catch all */}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>

          <div className="desktop-only">
            <button
              ref={themeBtnRef}
              onClick={toggleTheme}
              className="theme-toggle-btn"
              aria-label="Toggle Theme"
            >
              <div
                ref={themeIconRef}
                className="theme-icon"
              >
                {theme === 'light'
                  ? <SunMedium size={24} />
                  : <MoonStar size={24} />}
              </div>
            </button>
          </div>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
