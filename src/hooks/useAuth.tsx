import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, DemoPersona } from '../types/auth';
import { authService } from '../services/authService';
import { useToast } from './useToast';

interface AuthContextType {
  currentUser: UserProfile | null;
  personas: readonly DemoPersona[];
  loading: boolean;
  switchPersona: (uid: string) => void;
  loginWithEmail: (email: string) => void;
  logout: () => void;
  resetDemoData: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(authService.getCurrentUser());
  const [personas, setPersonas] = useState<readonly DemoPersona[]>(() => authService.getPersonas());
  const [loading, setLoading] = useState<boolean>(false);
  const { showToast } = useToast();

  useEffect(() => {
    return authService.subscribe(user => {
      setCurrentUser(user);
      setPersonas(authService.getPersonas());
    });
  }, []);

  const switchPersona = (uid: string) => {
    try {
      const switched = authService.switchPersona(uid);
      showToast('info', `Switched to ${switched.displayName}`, `Active Role: ${switched.role.replace('_', ' ').toUpperCase()}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to switch persona';
      showToast('error', 'Persona Switch Error', msg);
    }
  };

  const loginWithEmail = (email: string) => {
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
  };

  const logout = () => {
    authService.logout();
    showToast('info', 'Signed Out', 'You have been logged out.');
  };

  const resetDemoData = () => {
    authService.resetDemoData();
    setPersonas(authService.getPersonas());
    showToast('success', 'Demo Reset', 'Pristine synthetic test data restored.');
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        personas,
        loading,
        switchPersona,
        loginWithEmail,
        logout,
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
