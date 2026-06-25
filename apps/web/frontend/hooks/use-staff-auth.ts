'use client';

import { useState, useCallback } from 'react';
import { apiPost, setIdToken } from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { ApiHttpError, ApiNetworkError } from '@/lib/api/errors';
import type { LoginResponse } from '@/types/api';

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

/** Decode a JWT payload without verification (client-side display only). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

export function useStaffAuth(onLoginSuccess?: () => void): UseStaffAuthReturn {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    try {
      const response = await apiPost<LoginResponse>(
        ENDPOINTS.auth.login,
        { email, password },
      );

      if (!response.success) {
        setLoginError('Login failed. Please check your credentials.');
        return;
      }

      // Persist the ID token so subsequent API calls are authenticated.
      setIdToken(response.data.idToken);

      // Extract display email from the JWT claims (fall back to typed email).
      const decoded = decodeJwtPayload(response.data.idToken);
      const tokenEmail = (decoded?.email as string) || email;

      setEmail(tokenEmail);
      setIsLoggedIn(true);
      onLoginSuccess?.();
    } catch (err) {
      if (err instanceof ApiHttpError) {
        if (err.status === 401) {
          setLoginError('Invalid email or password. Please try again.');
        } else {
          setLoginError(err.getUserMessage());
        }
      } else if (err instanceof ApiNetworkError) {
        setLoginError('Unable to connect. Please check your connection and try again.');
      } else {
        setLoginError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  }, [email, password, onLoginSuccess]);

  const handleLogout = useCallback(() => {
    setIdToken(null);
    setIsLoggedIn(false);
    setEmail('');
    setPassword('');
    setLoginError('');
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
