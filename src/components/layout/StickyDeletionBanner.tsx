import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { ProjectDeletionNotice } from '../../types/project';
import { formatDisplayDateTime } from '../../domain/timezone';

interface StickyDeletionBannerProps {
  notices: ProjectDeletionNotice[];
  onDismiss: (noticeId: string) => void;
}

export const StickyDeletionBanner: React.FC<StickyDeletionBannerProps> = ({
  notices,
  onDismiss,
}) => {
  if (!notices || notices.length === 0) return null;

  return (
    <div className="sticky-deletion-banners-container">
      {notices.map(notice => (
        <div key={notice.id} className="sticky-deletion-banner animate-fade-in">
          <div className="banner-left">
            <span className="banner-icon" aria-hidden="true" style={{ display: 'flex', alignItems: 'center' }}>
              <AlertTriangle size={18} style={{ color: 'var(--status-overdue, #ef4444)' }} />
            </span>
            <div className="banner-content">
              <span className="banner-headline">Project Deleted</span>
              <p className="banner-body">
                Project <strong className="banner-highlight">"{notice.projectName}"</strong> was deleted by{' '}
                <strong className="banner-highlight">
                  {notice.deletedByName} ({notice.deletedByRole.replace('_', ' ').toUpperCase()})
                </strong>{' '}
                on <span className="banner-time">{formatDisplayDateTime(notice.deletedAt)}</span>.
              </p>
            </div>
          </div>

          <button
            className="btn-dismiss-banner"
            onClick={() => onDismiss(notice.id)}
            title="Dismiss notification"
            aria-label="Dismiss notification"
            id={`dismiss-deletion-notice-${notice.id}`}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};
