'use client';

import { useState, useCallback } from 'react';

interface UseStaffAuthReturn {
  isLoggedIn: boolean;
  email: string;
  password: string;
  loginError: string;
  isLoggingIn: boolean;
  setEmail: (val: string) => void;
  setPassword: (val: string) => void;
  handleLogin: (e: React.FormEvent) => Promise<void>;
  handleLogout: () => void;
}

export function useStaffAuth(onLoginSuccess?: () => void): UseStaffAuthReturn {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('nurse@healthcentre.gh');
  const [password, setPassword] = useState('password123');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    // Simulate auth delay
    await new Promise(resolve => setTimeout(resolve, 800));

    if (email.trim() === 'nurse@healthcentre.gh' && password === 'password123') {
      setIsLoggedIn(true);
      onLoginSuccess?.();
    } else {
      setLoginError('Email or password is incorrect. Please try again.');
    }
    setIsLoggingIn(false);
  }, [email, password, onLoginSuccess]);

  const handleLogout = useCallback(() => {
    setIsLoggedIn(false);
  }, []);

  return {
    isLoggedIn,
    email,
    password,
    loginError,
    isLoggingIn,
    setEmail,
    setPassword,
    handleLogin,
    handleLogout,
  };
}
