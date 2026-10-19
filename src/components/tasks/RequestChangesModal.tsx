import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';

interface RequestChangesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (comment: string) => void;
  taskTitle: string;
}

export const RequestChangesModal: React.FC<RequestChangesModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  taskTitle,
}) => {
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = comment.trim();
    if (trimmed.length < 5) {
      setError('Please provide a specific explanation of the changes required (minimum 5 characters).');
      return;
    }
    setError('');
    onConfirm(trimmed);
    setComment('');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Request Task Changes" maxWidth="500px">
      <form onSubmit={handleSubmit} className="changes-modal-form">
        <div
          style={{
            padding: '10px 14px',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '6px',
            marginBottom: '14px',
            fontSize: '13px',
            color: 'var(--text-primary)',
          }}
        >
          <strong>Task:</strong> {taskTitle}
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Explain what needs revision or refinement before this task can be approved and completed. The task will be moved back to <strong>In Progress</strong> and the assignee will be notified.
        </p>

        <div className={`form-group ${error ? 'has-error' : ''}`}>
          <label htmlFor="changes-comment-input" className="form-label">
            Feedback / Required Changes <span className="required-indicator">*</span>
          </label>
          <textarea
            id="changes-comment-input"
            className="form-textarea"
            rows={4}
            value={comment}
            onChange={e => {
              setComment(e.target.value);
              if (error) setError('');
            }}
            placeholder="e.g., Code review feedback: please add unit tests for edge cases and update documentation..."
            required
            autoFocus
          />
          {error && <span className="form-error-msg">{error}</span>}
        </div>

        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" id="confirm-request-changes-btn">
            Submit & Return to In Progress
          </Button>
        </div>
      </form>
    </Modal>
  );
};
