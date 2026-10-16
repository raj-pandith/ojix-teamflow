import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';

interface BlockerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  taskTitle: string;
}

export const BlockerModal: React.FC<BlockerModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  taskTitle,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setError('Please provide a specific blocker reason (minimum 5 characters).');
      return;
    }
    setError('');
    onConfirm(trimmed);
    setReason('');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Flag Task as Blocked" maxWidth="500px">
      <form onSubmit={handleSubmit} className="blocker-modal-form">
        <div className="blocker-modal-notice">
          <strong>Task:</strong> {taskTitle}
        </div>
        <p className="blocker-instruction">
          State clearly what dependency, external team, or technical bottleneck is preventing progress.
        </p>

        <div className={`form-group ${error ? 'has-error' : ''}`}>
          <label htmlFor="blocker-reason-input" className="form-label">
            Blocker Explanation <span className="required-indicator">*</span>
          </label>
          <textarea
            id="blocker-reason-input"
            className="form-textarea"
            rows={4}
            value={reason}
            onChange={e => {
              setReason(e.target.value);
              if (error) setError('');
            }}
            placeholder="e.g., Awaiting security audit sign-off; staging environment database credentials required..."
            required
            autoFocus
          />
          {error && <span className="form-error-msg">{error}</span>}
        </div>

        <div className="modal-actions">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" type="submit" id="confirm-blocker-btn">
            Confirm & Flag Blocked
          </Button>
        </div>
      </form>
    </Modal>
  );
};
