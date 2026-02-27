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

        // Refresh profile status from DB
        fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:6105'}/api/users/${parsedUser.email}`)
          .then(res => res.json())
          .then(dbUser => {
            if (dbUser) {
              const updatedUser = { ...parsedUser, ...dbUser };
              setUser(updatedUser);
              localStorage.setItem('user', JSON.stringify(updatedUser));
            }
          });
      } catch (error) {
        console.error('Error parsing stored user:', error);
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  const login = async (userData) => {
    const email = userData.email.toLowerCase();
    const isAdmin = ADMIN_EMAILS.includes(email);

    try {
      // Retrieve pending profile data from Phase 8b integrated login flow
      const pendingProfileStr = sessionStorage.getItem('pendingProfile');
      let extendedProfileData = { email, name: userData.name };

      if (pendingProfileStr) {
        extendedProfileData = { ...extendedProfileData, ...JSON.parse(pendingProfileStr) };
      }

      // Sync with backend
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:6105'}/api/users/upsert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(extendedProfileData)
      });
      const upsertResult = await res.json();

      // Get full profile
      const profileRes = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:6105'}/api/users/${email}`);
      const dbProfile = await profileRes.json();

      const userWithRole = {
        ...userData,
        ...dbProfile,
        email: email,
        isAdmin: isAdmin,
        role: isAdmin ? 'admin' : 'student',
        isProfileComplete: dbProfile?.is_profile_complete === 1
      };

      setUser(userWithRole);
      localStorage.setItem('user', JSON.stringify(userWithRole));

      // Clear pending profile from session storage after successful login
      sessionStorage.removeItem('pendingProfile');

      return userWithRole;
    } catch (err) {
      console.error('Auth sync failed:', err);
      throw new Error('Failed to synchronize user profile.');
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  const updateProfile = (profileData) => {
    const updatedUser = { ...user, ...profileData, isProfileComplete: true };
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  const isCollegeEmail = (email) => {
    return email?.toLowerCase().endsWith('@vnrvjiet.in');
  };

  const value = {
    user,
    login,
    logout,
    updateProfile,
    loading,
    isAuthenticated: !!user,
    isAdmin: user?.isAdmin || false,
    isProfileComplete: user?.isProfileComplete || false,
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