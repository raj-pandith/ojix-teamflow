import React, { useState } from 'react';
import { UserProfile, UserRole } from '../../types/auth';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { authService } from '../../services/authService';
import { storageEngine } from '../../services/storageEngine';
import { useToast } from '../../hooks/useToast';

interface UserInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
}

export const UserInviteModal: React.FC<UserInviteModalProps> = ({
  isOpen,
  onClose,
  currentUser,
}) => {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('member');
  const [phone, setPhone] = useState('');
  const [directPassword, setDirectPassword] = useState('');
  const [isDirectPasswordMode, setIsDirectPasswordMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [activationResult, setActivationResult] = useState<{
    activationUrl: string;
    email: string;
    displayName: string;
    token: string;
  } | null>(null);

  const { showToast } = useToast();

  const handleReset = () => {
    setDisplayName('');
    setEmail('');
    setRole('member');
    setPhone('');
    setDirectPassword('');
    setIsDirectPasswordMode(false);
    setError('');
    setActivationResult(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = displayName.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName || trimmedName.length < 2) {
      setError('Please provide a valid full name (at least 2 characters).');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      setError('Please provide a valid email address.');
      return;
    }

    if (isDirectPasswordMode) {
      if (!directPassword || directPassword.length < 8) {
        setError('Direct password must be at least 8 characters long.');
        return;
      }
    }

    setIsSubmitting(true);
    setError('');

    try {
      if (isDirectPasswordMode) {
        // Direct password provisioning
        const res = await fetch('/api/auth/admin/create-user', {
          method: 'POST',
          headers: authService.getAuthHeaders(),
          body: JSON.stringify({
            displayName: trimmedName,
            email: trimmedEmail,
            role,
            password: directPassword,
            phone: phone.trim() || undefined,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to create user account');
        }

        // Sync with storageEngine
        try {
          storageEngine.addUser(data.user, currentUser);
        } catch {}

        showToast('success', 'User Account Provisioned', `Account created for "${trimmedName}" with initial password.`);
        handleClose();
      } else {
        // Secure activation link flow
        const result = await authService.inviteUser({
          displayName: trimmedName,
          email: trimmedEmail,
          role,
          phone: phone.trim() || undefined,
        });

        showToast('success', 'Invitation Created', `Activation link generated for "${trimmedName}".`);
        setActivationResult({
          activationUrl: result.activationUrl,
          email: trimmedEmail,
          displayName: trimmedName,
          token: result.invitation.token,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create invitation';
      setError(msg);
      showToast('error', 'Invitation Error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = async () => {
    if (!activationResult?.activationUrl) return;
    try {
      await navigator.clipboard.writeText(activationResult.activationUrl);
      showToast('success', 'Copied to Clipboard!', 'Account activation URL copied.');
    } catch {
      showToast('info', 'Copy Link', activationResult.activationUrl);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={activationResult ? 'Invitation Generated' : 'Invite Member to Workspace'}
      maxWidth="540px"
    >
      {activationResult ? (
        <div className="invite-success-container">
          <div className="invite-success-banner">
            <div className="invite-badge-check">✓</div>
            <div>
              <h4 className="invite-success-title">Account Created &amp; Activation Link Ready</h4>
              <p className="invite-success-desc">
                An account in <strong>Pending Activation</strong> status was created for{' '}
                <strong>{activationResult.displayName}</strong> ({activationResult.email}).
              </p>
            </div>
          </div>

          <div className="activation-link-box">
            <label className="form-label">Single-Use Activation Link (Expires in 48 hours):</label>
            <div className="link-copy-row">
              <input
                type="text"
                readOnly
                className="form-input link-input font-mono"
                value={activationResult.activationUrl}
              />
              <Button variant="primary" size="sm" onClick={handleCopyLink}>
                Copy Link
              </Button>
            </div>
            <p className="link-note">
              Provide this link to {activationResult.displayName}. They will use it to set their password and immediately access their workspace.
            </p>
          </div>

          <div className="modal-actions">
            <Button variant="secondary" onClick={handleClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="user-invite-form">
          {error && <div className="form-alert-error">{error}</div>}

          <Input
            label="Full Name"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="e.g. David Kim"
            required
            autoFocus
            id="invite-user-name"
          />

          <Input
            label="Work Email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="e.g. david@ojix-corp.com"
            required
            id="invite-user-email"
          />

          <Input
            label="Phone Number (Optional)"
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="e.g. +1 (555) 019-9988"
            id="invite-user-phone"
          />

          <Select
            label="Workspace Role"
            value={role}
            onChange={e => setRole(e.target.value as UserRole)}
            options={[
              { value: 'member', label: 'Member (Active Contributor)' },
              { value: 'project_lead', label: 'Project Lead (Creates & Manages Projects)' },
              { value: 'viewer', label: 'Viewer (Read-Only Observer)' },
              { value: 'workspace_admin', label: 'Workspace Admin (Full Governance)' },
            ]}
            id="invite-user-role"
          />

          {/* Option to toggle direct password provisioning */}
          <div className="invite-mode-toggle" style={{ margin: '14px 0', padding: '10px 12px', background: 'var(--surface-sunken, #161b22)', borderRadius: '6px', border: '1px solid var(--border-subtle, #30363d)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary, #8b949e)' }}>
              <input
                type="checkbox"
                checked={isDirectPasswordMode}
                onChange={e => setIsDirectPasswordMode(e.target.checked)}
              />
              <span>Set initial password directly instead of generating activation link</span>
            </label>

            {isDirectPasswordMode && (
              <div style={{ marginTop: '10px' }}>
                <Input
                  label="Initial Password (Min 8 chars)"
                  type="password"
                  value={directPassword}
                  onChange={e => setDirectPassword(e.target.value)}
                  placeholder="Enter initial password"
                  required={isDirectPasswordMode}
                  id="invite-direct-password"
                />
              </div>
            )}
          </div>

          <div className="modal-actions">
            <Button variant="secondary" type="button" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              isLoading={isSubmitting}
              id="submit-invite-user-btn"
            >
              {isDirectPasswordMode ? '+ Provision Account' : 'Generate Activation Link'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};
