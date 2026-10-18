import React from 'react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { AppNotification } from '../../types/message';
import { formatDisplayDate } from '../../domain/timezone';

interface ProjectDeletionSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  notification: AppNotification | null;
}

export const ProjectDeletionSummaryModal: React.FC<ProjectDeletionSummaryModalProps> = ({
  isOpen,
  onClose,
  notification,
}) => {
  if (!notification) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Project Deletion Summary"
      maxWidth="560px"
      zIndex={1400}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '8px',
          }}
        >
          <span style={{ fontSize: '28px' }}>🗑️</span>
          <div>
            <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--text-primary, #f0f6fc)' }}>
              Project Permanently Removed
            </h4>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--text-secondary, #8b949e)' }}>
              This project was decommissioned and deleted from the workspace.
            </p>
          </div>
        </div>

        <div
          style={{
            background: 'var(--surface-subtle, #161b22)',
            border: '1px solid var(--border-default, #30363d)',
            borderRadius: '8px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted, #8b949e)', marginBottom: '4px' }}>
              Project Name
            </div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary, #f0f6fc)' }}>
              {notification.projectName || notification.entityId || 'Decommissioned Project'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted, #8b949e)', marginBottom: '4px' }}>
              Deleted By
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text-primary, #f0f6fc)' }}>
              👤 {notification.actorDisplayName || 'Workspace Administrator'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted, #8b949e)', marginBottom: '4px' }}>
              Deletion Timestamp
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary, #8b949e)' }}>
              📅 {new Date(notification.createdAt).toLocaleString()} (
              {formatDisplayDate(notification.createdAt.slice(0, 10))})
            </div>
          </div>

          {notification.deletionReason && (
            <div>
              <div style={{ fontSize: '12px', color: 'var(--color-danger, #ef4444)', fontWeight: 600, marginBottom: '4px' }}>
                Reason for Deletion
              </div>
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--text-primary, #f0f6fc)',
                  lineHeight: 1.5,
                  background: 'rgba(239, 68, 68, 0.08)',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderLeft: '4px solid #ef4444',
                  fontWeight: 500,
                }}
              >
                {notification.deletionReason}
              </div>
            </div>
          )}

          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted, #8b949e)', marginBottom: '4px' }}>
              Notice Summary
            </div>
            <div
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary, #8b949e)',
                lineHeight: 1.5,
                background: 'rgba(255, 255, 255, 0.02)',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle, #21262d)',
              }}
            >
              {notification.body}
            </div>
          </div>
        </div>

        <div
          style={{
            fontSize: '12px',
            color: 'var(--text-muted, #8b949e)',
            lineHeight: 1.5,
          }}
        >
          🔒 <strong>Audit Record Preserved:</strong> In accordance with retention policy, this deletion notice
          remains accessible in your inbox history to prevent broken links or ambiguous state.
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close Summary
          </Button>
        </div>
      </div>
    </Modal>
  );
};
