import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';

interface ActivateAccountPageProps {
  onNavigateToLogin: () => void;
}

export const ActivateAccountPage: React.FC<ActivateAccountPageProps> = ({ onNavigateToLogin }) => {
  const { activateAccount, loading } = useAuth();

  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Parse token and email from URL if present
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      const urlEmail = params.get('email');
      if (urlToken) setToken(urlToken);
      if (urlEmail) setEmail(urlEmail);
    }
  }, []);

  const hasMinLength = password.length >= 8;
  const hasSpecialOrNumber = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isValid = hasMinLength && hasSpecialOrNumber && passwordsMatch && token.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!token.trim()) {
      setErrorMessage('Activation token is required.');
      return;
    }

    if (!hasMinLength) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    if (!hasSpecialOrNumber) {
      setErrorMessage('Password must contain at least one number or special character.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await activateAccount(token.trim(), password, confirmPassword);
      setSuccessMessage(res.message || 'Account successfully activated! You can now log in.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Activation failed.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page-container">
      <div className="login-card activate-card">
        {/* Header */}
        <div className="login-brand-header">
          <div className="login-logo-mark">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <polyline points="16 11 18 13 22 9" />
            </svg>
          </div>
          <h1 className="login-title">Activate Account</h1>
          <p className="login-subtitle">
            {email ? `Welcome to OJIX TeamFlow, ${email}` : 'Set up your password to activate your workspace account'}
          </p>
        </div>

        {/* Success Banner */}
        {successMessage ? (
          <div className="activate-success-box">
            <div className="activate-success-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="activate-success-title">Account Ready!</h3>
            <p className="activate-success-desc">{successMessage}</p>
            <button
              type="button"
              className="login-submit-btn"
              onClick={onNavigateToLogin}
            >
              Proceed to Sign In
            </button>
          </div>
        ) : (
          <>
            {/* Error Banner */}
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

            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-group">
                <label htmlFor="activate-token" className="form-label">
                  Activation Token
                </label>
                <input
                  id="activate-token"
                  type="text"
                  className="form-input font-mono"
                  placeholder="Paste your 64-character token"
                  value={token}
                  onChange={e => {
                    setToken(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  required
                  disabled={isSubmitting || loading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="activate-password" className="form-label">
                  Create Password
                </label>
                <div className="password-input-wrapper">
                  <input
                    id="activate-password"
                    type={showPassword ? 'text' : 'password'}
                    className="form-input password-input"
                    placeholder="Enter a strong password"
                    value={password}
                    onChange={e => {
                      setPassword(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    autoComplete="new-password"
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

              <div className="form-group">
                <label htmlFor="activate-confirm" className="form-label">
                  Confirm Password
                </label>
                <input
                  id="activate-confirm"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input password-input"
                  placeholder="Repeat your new password"
                  value={confirmPassword}
                  onChange={e => {
                    setConfirmPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  autoComplete="new-password"
                  required
                  disabled={isSubmitting || loading}
                />
              </div>

              {/* Password Requirements Checklist */}
              <div className="password-checklist">
                <div className={`checklist-item ${hasMinLength ? 'met' : ''}`}>
                  <span className="check-icon">{hasMinLength ? '✓' : '•'}</span>
                  <span>Minimum 8 characters</span>
                </div>
                <div className={`checklist-item ${hasSpecialOrNumber ? 'met' : ''}`}>
                  <span className="check-icon">{hasSpecialOrNumber ? '✓' : '•'}</span>
                  <span>At least one number or special symbol</span>
                </div>
                <div className={`checklist-item ${passwordsMatch ? 'met' : ''}`}>
                  <span className="check-icon">{passwordsMatch ? '✓' : '•'}</span>
                  <span>Passwords match</span>
                </div>
              </div>

              <button
                type="submit"
                className="login-submit-btn"
                disabled={!isValid || isSubmitting || loading}
              >
                {isSubmitting || loading ? (
                  <>
                    <span className="spinner-inline" />
                    <span>Activating Account...</span>
                  </>
                ) : (
                  <span>Activate &amp; Set Password</span>
                )}
              </button>
            </form>

            <div className="activate-back-footer">
              <button
                type="button"
                className="back-to-login-btn"
                onClick={onNavigateToLogin}
              >
                ← Back to Sign In
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
