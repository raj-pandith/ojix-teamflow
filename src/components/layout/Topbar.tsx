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
  canCreateTask?: boolean;
  onToggleMobileNav?: () => void;
  onOpenPersonaModal?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  onOpenTriage,
  onOpenNewTask,
  onOpenAddUser,
  onOpenMessages,
  unreadMessagesCount,
  canMutate: _canMutate,
  canCreateTask,
  onToggleMobileNav,
  onOpenPersonaModal,
}) => {
  const { currentUser, personas, switchPersona, resetDemoData } = useAuth();
  const canCreate = canCreateTask !== undefined
    ? canCreateTask
    : (currentUser?.role === 'workspace_admin' || currentUser?.role === 'project_lead');
  const [permission, setPermission] = React.useState<NotificationPermission>(() => {
    return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'granted';
  });

  const handleEnableAlerts = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const p = await Notification.requestPermission();
        setPermission(p);
      } catch {}
    }
  };

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
        {/* Enable Desktop Alerts quick-prompt if not yet granted */}
        {permission === 'default' && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleEnableAlerts}
            id="enable-alerts-btn"
            style={{
              borderColor: 'var(--accent-primary, #6366f1)',
              color: 'var(--accent-primary-light, #818cf8)',
            }}
            title="Enable native desktop browser notifications"
          >
            🔔 Enable Alerts
          </Button>
        )}

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

        {/* Create Task Button (Workspace Admin and Project Lead only) */}
        {canCreate && (
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
                {p.displayName} ({p.roleLabel}{p.status === 'blocked' ? ' — Blocked' : p.status === 'terminated' ? ' — Terminated' : ''})
              </option>
            ))}
          </select>
          {onOpenPersonaModal && (
            <button
              type="button"
              className="persona-info-btn"
              onClick={onOpenPersonaModal}
              id="topbar-inspect-persona-btn"
              title="Inspect active persona profile & permitted projects"
              style={{
                background: 'var(--surface-elevated, #21262d)',
                border: '1px solid var(--border-default, #30363d)',
                borderRadius: '6px',
                padding: '4px 7px',
                cursor: 'pointer',
                fontSize: '13px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-text-secondary, #8b949e)',
                transition: 'all 0.15s ease',
              }}
            >
              ℹ️
            </button>
          )}
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
