import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserProfile, DemoPersona } from '../types/auth';
import { authService } from '../services/authService';
import { useToast } from './useToast';

interface AuthContextType {
  currentUser: UserProfile | null;
  isAuthenticated: boolean;
  personas: readonly DemoPersona[];
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  activateAccount: (token: string, password: string, confirmPassword: string) => Promise<{ success: boolean; user: UserProfile; message: string }>;
  switchPersona: (uid: string) => void;
  loginWithEmail: (email: string) => void;
  resetDemoData: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => authService.getCurrentUser());
  const [personas, setPersonas] = useState<readonly DemoPersona[]>(() => authService.getPersonas());
  const [loading, setLoading] = useState<boolean>(false);
  const { showToast } = useToast();

  useEffect(() => {
    return authService.subscribe(user => {
      setCurrentUser(user);
      setPersonas(authService.getPersonas());
    });
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setLoading(true);
    try {
      const user = await authService.login(email, password);
      showToast('success', `Welcome back, ${user.displayName}!`, `Signed in as ${user.role.replace('_', ' ').toUpperCase()}`);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid credentials';
      showToast('error', 'Login Failed', msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const logout = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      await authService.logout();
      showToast('info', 'Signed Out', 'You have been safely signed out of OJIX TeamFlow.');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const activateAccount = useCallback(async (
    token: string,
    password: string,
    confirmPassword: string
  ): Promise<{ success: boolean; user: UserProfile; message: string }> => {
    setLoading(true);
    try {
      const res = await authService.activateAccount(token, password, confirmPassword);
      showToast('success', 'Account Activated!', res.message);
      return res;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Activation failed';
      showToast('error', 'Activation Error', msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const switchPersona = useCallback((uid: string) => {
    try {
      const switched = authService.switchPersona(uid);
      showToast('info', `Switched to ${switched.displayName}`, `Active Role: ${switched.role.replace('_', ' ').toUpperCase()}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to switch persona';
      showToast('error', 'Persona Switch Error', msg);
    }
  }, [showToast]);

  const loginWithEmail = useCallback((email: string) => {
    setLoading(true);
    try {
      const user = authService.loginWithEmail(email);
      showToast('success', `Welcome back, ${user.displayName}!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid credentials';
      showToast('error', 'Authentication Failed', msg);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const resetDemoData = useCallback(() => {
    authService.resetDemoData();
    setPersonas(authService.getPersonas());
    showToast('success', 'Demo Reset', 'Pristine synthetic test data restored.');
  }, [showToast]);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: !!currentUser && currentUser.status === 'active',
        personas,
        loading,
        login,
        logout,
        activateAccount,
        switchPersona,
        loginWithEmail,
        resetDemoData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
