import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';

interface TopbarProps {
  onOpenTriage: () => void;
  onOpenNewTask: () => void;
  onOpenAddUser?: () => void;
  onOpenMessages?: () => void;
  unreadMessagesCount?: number;
  canMutate: boolean;
  onToggleMobileNav?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  onOpenTriage,
  onOpenNewTask,
  onOpenAddUser,
  onOpenMessages,
  unreadMessagesCount,
  canMutate,
  onToggleMobileNav,
}) => {
  const { currentUser, personas, switchPersona, resetDemoData } = useAuth();

  return (
    <header className="topbar">
      <div className="topbar-left">
        {onToggleMobileNav && (
          <button
            className="mobile-nav-toggle"
            onClick={onToggleMobileNav}
            aria-label="Toggle navigation menu"
            id="mobile-nav-toggle-btn"
          >
            <span className="hamburger-line" />
            <span className="hamburger-line" />
            <span className="hamburger-line" />
          </button>
        )}
        <div className="workspace-badge">
          <span className="workspace-dot" />
          <span className="workspace-title">OJIX TeamFlow Workspace</span>
          <span className="workspace-title-mobile">OJIX TeamFlow</span>
        </div>
      </div>

      <div className="topbar-right">
        {/* Add User Button (Workspace Admin only per RBAC) */}
        {currentUser?.role === 'workspace_admin' && onOpenAddUser && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onOpenAddUser}
            id="add-user-topbar-btn"
            title="Invite a new member to the workspace"
          >
            + Invite Member
          </Button>
        )}

        {/* Notification Bell / Message Center Trigger */}
        {onOpenMessages && (
          <button
            className="topbar-notif-btn"
            onClick={onOpenMessages}
            id="topbar-messages-btn"
            title="Open Message Center & Notifications"
            style={{
              position: 'relative',
              background: 'var(--surface-elevated, #21262d)',
              border: '1px solid var(--border-default, #30363d)',
              borderRadius: '6px',
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: '15px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span>🔔</span>
            {typeof unreadMessagesCount === 'number' && unreadMessagesCount > 0 && (
              <span
                id="topbar-unread-badge"
                style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  background: 'var(--accent-primary, #6366f1)',
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: '10px',
                  minWidth: '16px',
                  textAlign: 'center',
                  boxShadow: '0 0 4px rgba(0,0,0,0.5)',
                }}
              >
                {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
              </span>
            )}
          </button>
        )}

        {/* Triage Assistant Quick-Trigger */}
        <Button
          variant="secondary"
          size="sm"
          onClick={onOpenTriage}
          className="triage-trigger-btn"
          title="Open Work Triage to resolve blockers and parse notes"
        >
          ⚡ Work Triage
        </Button>

        {/* Create Task Button (Disabled for Viewers) */}
        {canMutate && (
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenNewTask}
            id="create-task-topbar-btn"
          >
            + New Task
          </Button>
        )}

        {/* Demo Persona Quick-Switcher */}
        <div className="persona-switcher-container">
          <label htmlFor="persona-select" className="persona-label">
            Persona:
          </label>
          <select
            id="persona-select"
            className="persona-select"
            value={currentUser?.uid || ''}
            onChange={e => switchPersona(e.target.value)}
          >
            {personas.map(p => (
              <option key={p.uid} value={p.uid}>
                {p.displayName} ({p.roleLabel})
              </option>
            ))}
          </select>
        </div>

        {/* Active Role Pill */}
        {currentUser && (
          <Badge type="role" value={currentUser.role} className="role-pill" />
        )}

        {/* Reset Demo Data */}
        <button
          className="btn-reset-demo"
          onClick={resetDemoData}
          title="Reset to clean baseline dataset"
        >
          ↻ Reset Data
        </button>
      </div>
    </header>
  );
};
