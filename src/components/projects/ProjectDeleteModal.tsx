import React from 'react';

interface ProjectDeleteModalProps {
  isOpen: boolean;
  projectName: string;
  projectId: string;
  onClose: () => void;
  onConfirm: (projectId: string) => void;
}

export const ProjectDeleteModal: React.FC<ProjectDeleteModalProps> = ({
  isOpen,
  projectName,
  projectId,
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop animate-fade-in" onClick={onClose}>
      <div
        className="modal-card animate-scale-in"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '480px' }}
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
          <button className="btn-close-modal" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>

        <div className="modal-body" style={{ padding: 'var(--space-4)' }}>
          <p style={{ margin: '0 0 var(--space-3) 0', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
            Are you sure you want to permanently delete project <strong style={{ color: 'var(--text-primary)' }}>"{projectName}"</strong>?
          </p>
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
              <li>A sticky notification banner will immediately notify all project members that this project was deleted.</li>
            </ul>
          </div>
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            id="confirm-delete-project-btn"
            onClick={() => {
              onConfirm(projectId);
              onClose();
            }}
          >
            🗑️ Yes, Delete Project
          </button>
        </div>
      </div>
    </div>
  );
};
