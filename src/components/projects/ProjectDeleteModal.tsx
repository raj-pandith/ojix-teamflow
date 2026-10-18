import React, { useState, useEffect } from 'react';
import { AlertTriangle, X, Trash2 } from 'lucide-react';

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
        className="modal-container animate-scale-in"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '520px' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-project-modal-title"
      >
        <div className="modal-header modal-danger-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#FEE2E2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#DC2626',
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={18} />
            </div>
            <h3 id="delete-project-modal-title" className="modal-danger-title">
              Delete Project
            </h3>
          </div>
          <button className="modal-close-btn" onClick={handleClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: '24px' }}>
          <p
            style={{
              margin: '0 0 16px 0',
              color: '#1E293B',
              fontSize: '15px',
              lineHeight: 1.5,
              fontWeight: 500,
            }}
          >
            Are you sure you want to permanently delete project{' '}
            <strong style={{ color: '#0F172A', fontWeight: 700 }}>"{projectName}"</strong>?
          </p>

          {/* Reason for Deletion Input */}
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="delete-project-reason"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: '#1E293B',
                marginBottom: '8px',
              }}
            >
              Reason for Deletion <span style={{ color: '#DC2626', fontWeight: 700 }}>*</span>
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
                borderColor: error ? '#DC2626' : '#CBD5E1',
                borderWidth: '1.5px',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '14px',
                color: '#0F172A',
                background: '#FFFFFF',
                boxShadow: error ? '0 0 0 3px rgba(220, 38, 38, 0.15)' : 'none',
                lineHeight: 1.5,
              }}
              autoFocus
            />
            {error && (
              <p
                style={{
                  color: '#DC2626',
                  fontSize: '12px',
                  margin: '6px 0 0',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                ⚠️ {error}
              </p>
            )}
          </div>

          <div className="consequences-alert-box">
            <p className="consequences-title">
              <AlertTriangle size={15} />
              <span>Important consequences:</span>
            </p>
            <ul className="consequences-list">
              <li>All tasks and activity logs under this project will be removed.</li>
              <li>A high-priority alert will be sent to this project's team members containing your deletion reason.</li>
            </ul>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-dialog-cancel" onClick={handleClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-dialog-danger"
            id="confirm-delete-project-btn"
            onClick={handleConfirm}
          >
            <Trash2 size={16} />
            <span>Yes, Delete Project</span>
          </button>
        </div>
      </div>
    </div>
  );
};
