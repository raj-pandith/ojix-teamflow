import React, { useState, useEffect } from 'react';

interface ProjectDeleteModalProps {
  isOpen: boolean;
  projectName: string;
  projectId: string;
  onClose: () => void;
  onConfirm: (projectId: string, reason: string) => void;
}

export const ProjectDeleteModal: React.FC<ProjectDeleteModalProps> = ({
  isOpen,
  projectName,
  projectId,
  onClose,
  onConfirm,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    setReason('');
    setError('');
    onClose();
  };

  const handleConfirm = () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('Please provide a reason for deleting this project.');
      return;
    }
    onConfirm(projectId, trimmed);
    handleClose();
  };

  return (
    <div className="modal-backdrop animate-fade-in" onClick={handleClose}>
      <div
        className="modal-card animate-scale-in"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '500px' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-project-modal-title"
      >
        <div className="modal-header" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>⚠️</span>
            <h3 id="delete-project-modal-title" style={{ color: 'var(--color-danger, #ef4444)', margin: 0 }}>
              Delete Project
            </h3>
          </div>
          <button className="btn-close-modal" onClick={handleClose} aria-label="Close dialog">
            ✕
          </button>
        </div>

        <div className="modal-body" style={{ padding: 'var(--space-4)' }}>
          <p style={{ margin: '0 0 var(--space-3) 0', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
            Are you sure you want to permanently delete project <strong style={{ color: 'var(--text-primary)' }}>"{projectName}"</strong>?
          </p>

          {/* Reason for Deletion Input */}
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label
              htmlFor="delete-project-reason"
              style={{
                display: 'block',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Reason for Deletion <span style={{ color: 'var(--color-danger, #ef4444)' }}>*</span>
            </label>
            <textarea
              id="delete-project-reason"
              className="form-control"
              rows={3}
              placeholder="e.g. Project completed, scope merged into another initiative, cancelled by stakeholder..."
              value={reason}
              onChange={e => {
                setReason(e.target.value);
                if (error) setError('');
              }}
              style={{
                width: '100%',
                resize: 'vertical',
                borderColor: error ? 'var(--color-danger, #ef4444)' : undefined,
                fontSize: '13px',
              }}
              autoFocus
            />
            {error && (
              <p
                style={{
                  color: 'var(--color-danger, #ef4444)',
                  fontSize: '12px',
                  margin: '4px 0 0',
                  fontWeight: 500,
                }}
              >
                ⚠️ {error}
              </p>
            )}
          </div>

          <div
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            <p style={{ margin: '0 0 6px 0', fontWeight: 600, color: 'var(--color-danger, #ef4444)' }}>
              Important consequences:
            </p>
            <ul style={{ margin: 0, paddingLeft: '18px' }}>
              <li>All tasks and activity logs under this project will be removed.</li>
              <li>A high-priority alert will be sent to this project's team members containing your deletion reason.</li>
            </ul>
          </div>
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" className="btn btn-secondary" onClick={handleClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            id="confirm-delete-project-btn"
            onClick={handleConfirm}
          >
            🗑️ Yes, Delete Project
          </button>
        </div>
      </div>
    </div>
  );
};
