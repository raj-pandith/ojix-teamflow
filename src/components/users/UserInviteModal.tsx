import React, { useState } from 'react';
import { UserProfile, UserRole } from '../../types/auth';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = displayName.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName || trimmedName.length < 2) {
      setError('Please provide a valid full name (at least 2 characters).');
      return;
    }
    if (!trimmedEmail || !/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      setError('Please provide a valid email address.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const newUser: UserProfile = {
        uid: `user-${Date.now().toString(36)}`,
        email: trimmedEmail,
        displayName: trimmedName,
        role,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      storageEngine.addUser(newUser, currentUser);
      showToast('success', 'User Added to Workspace', `${trimmedName} (${role.toUpperCase()}) is now active in workspace.`);
      setDisplayName('');
      setEmail('');
      setRole('member');
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add user');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Member to Workspace" maxWidth="500px">
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
          placeholder="e.g. david@ojix.local"
          required
          id="invite-user-email"
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

        <div className="modal-actions">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" isLoading={isSubmitting} id="submit-invite-user-btn">
            + Add to Workspace
          </Button>
        </div>
      </form>
    </Modal>
  );
};
