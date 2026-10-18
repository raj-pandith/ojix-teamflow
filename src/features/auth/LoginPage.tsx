import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';

interface LoginPageProps {
  onNavigateToActivate?: () => void;
}

const DEMO_ACCOUNTS = [
  {
    name: 'Alex Morgan',
    email: 'admin@ojix.local',
    role: 'Workspace Admin',
    roleKey: 'workspace_admin',
    desc: 'Full workspace governance & user management',
    badgeColor: '#a855f7',
  },
  {
    name: 'Sarah Chen',
    email: 'lead@ojix.local',
    role: 'Project Lead',
    roleKey: 'project_lead',
    desc: 'Project oversight, task assignment & execution',
    badgeColor: '#38bdf8',
  },
  {
    name: 'Marcus Vance',
    email: 'member@ojix.local',
    role: 'Member',
    roleKey: 'member',
    desc: 'Active task execution, status updates & notes',
    badgeColor: '#34d399',
  },
  {
    name: 'Elena Rostova',
    email: 'viewer@ojix.local',
    role: 'Viewer (Read-Only)',
    roleKey: 'viewer',
    desc: 'Read-only observer access across permitted projects',
    badgeColor: '#fbbf24',
  },
];

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigateToActivate }) => {
  const { login, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Please enter your workspace email address.');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(trimmedEmail, password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid email or password.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickFill = (accEmail: string) => {
    setEmail(accEmail);
    setPassword('Password123!');
    setErrorMessage(null);
  };

  return (
    <div className="login-page-container">
      <div className="login-card">
        {/* Brand Header */}
        <div className="login-brand-header">
          <div className="login-logo-mark">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="login-title">OJIX TeamFlow</h1>
          <p className="login-subtitle">Team Tasks &amp; Project Execution OS</p>
        </div>

        {/* Status / Error Banner */}
        {errorMessage && (
          <div className="login-error-alert" role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="login-email" className="form-label">
              Workspace Email
            </label>
            <input
              id="login-email"
              type="email"
              className="form-input"
              placeholder="you@ojix-corp.com"
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              autoComplete="username"
              required
              disabled={isSubmitting || loading}
            />
          </div>

          <div className="form-group">
            <div className="form-label-row">
              <label htmlFor="login-password" className="form-label">
                Password
              </label>
              {onNavigateToActivate && (
                <button
                  type="button"
                  className="login-activate-link"
                  onClick={onNavigateToActivate}
                >
                  Activate invitation?
                </button>
              )}
            </div>
            <div className="password-input-wrapper">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className="form-input password-input"
                placeholder="Enter your password"
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                autoComplete="current-password"
                required
                disabled={isSubmitting || loading}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="login-submit-btn"
            disabled={isSubmitting || loading || !email.trim() || !password}
          >
            {isSubmitting || loading ? (
              <>
                <span className="spinner-inline" />
                <span>Authenticating...</span>
              </>
            ) : (
              <span>Sign In to Workspace</span>
            )}
          </button>
        </form>

        {/* Quick Demo Personas Helper */}
        <div className="login-quickfill-section">
          <div className="quickfill-header">
            <span className="quickfill-title">Quick-Fill Demo Credentials</span>
            <span className="quickfill-note">Password: Password123!</span>
          </div>

          <div className="quickfill-grid">
            {DEMO_ACCOUNTS.map(acc => (
              <button
                key={acc.email}
                type="button"
                className={`quickfill-card ${email === acc.email ? 'active' : ''}`}
                onClick={() => handleQuickFill(acc.email)}
              >
                <div className="quickfill-card-top">
                  <span className="quickfill-name">{acc.name}</span>
                  <span
                    className="quickfill-role-badge"
                    style={{ borderColor: acc.badgeColor, color: acc.badgeColor }}
                  >
                    {acc.role}
                  </span>
                </div>
                <div className="quickfill-email">{acc.email}</div>
                <div className="quickfill-desc">{acc.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer info */}
        <div className="login-footer">
          <span>Enterprise Role-Based Access Control • Server-Enforced RBAC</span>
        </div>
      </div>
    </div>
  );
};
