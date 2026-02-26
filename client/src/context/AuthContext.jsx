import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // ✅ UPDATED: Admin emails (Gmail addresses)
  const ADMIN_EMAILS = ['mr.ani30617@gmail.com', 'bandarubhargavi664@gmail.com'];

  useEffect(() => {
    // Check if user is stored in localStorage
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
      } catch (error) {
        console.error('Error parsing stored user:', error);
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  const login = (userData) => {
    const email = userData.email.toLowerCase();

    // ✅ UPDATED: Check if user is admin first
    const isAdmin = ADMIN_EMAILS.includes(email);

    // ✅ UPDATED: Only check college email for non-admin users
    if (!isAdmin && !email.endsWith('@vnrvjiet.in')) {
      throw new Error('Access restricted to VNRVJIET students only.');
    }

    const userWithRole = {
      ...userData,
      email: email,
      isAdmin: isAdmin,
      role: isAdmin ? 'admin' : 'student'
    };

    setUser(userWithRole);
    localStorage.setItem('user', JSON.stringify(userWithRole));

    return userWithRole;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  const isCollegeEmail = (email) => {
    return email.toLowerCase().endsWith('@vnrvjiet.in');
  };

  const value = {
    user,
    login,
    logout,
    loading,
    isAuthenticated: !!user,
    isAdmin: user?.isAdmin || false,
    isCollegeEmail
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};