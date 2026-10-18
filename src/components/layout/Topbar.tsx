import React, { useState, useRef, useEffect } from 'react';
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
  const { currentUser, personas, switchPersona, logout, resetDemoData } = useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [showDevSwitcher, setShowDevSwitcher] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const canCreate = canCreateTask !== undefined
    ? canCreateTask
    : (currentUser?.role === 'workspace_admin' || currentUser?.role === 'project_lead');

  const [permission, setPermission] = useState<NotificationPermission>(() => {
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

  // Close dropdown on outside click or escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsUserMenuOpen(false);
    };

    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isUserMenuOpen]);

  const initials = currentUser?.displayName
    ? currentUser.displayName
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'U';

  const isDevMode = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);

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

        {/* =========================================================================
            AUTHENTICATED USER PROFILE WIDGET & MENU (Replaces old persona dropdown)
            ========================================================================= */}
        {currentUser && (
          <div className="user-profile-menu-container" ref={menuRef}>
            <button
              type="button"
              className="user-profile-btn"
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              id="user-profile-menu-btn"
              aria-expanded={isUserMenuOpen}
              aria-haspopup="true"
              title={`${currentUser.displayName} (${currentUser.role.replace('_', ' ').toUpperCase()})`}
            >
              <div className="user-avatar-badge" aria-hidden="true">
                {initials}
              </div>
              <div className="user-info-text">
                <span className="user-display-name">{currentUser.displayName}</span>
                <span className="user-role-label">{currentUser.role.replace('_', ' ')}</span>
              </div>
              <svg
                className={`menu-caret-icon ${isUserMenuOpen ? 'open' : ''}`}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {/* Profile Dropdown Popover */}
            {isUserMenuOpen && (
              <div className="user-profile-dropdown" role="menu">
                <div className="dropdown-user-header">
                  <div className="dropdown-avatar">{initials}</div>
                  <div className="dropdown-details">
                    <div className="dropdown-name">{currentUser.displayName}</div>
                    <div className="dropdown-email">{currentUser.email}</div>
                    <div className="dropdown-badge-row">
                      <Badge type="role" value={currentUser.role} />
                      <span className={`status-tag ${currentUser.status}`}>
                        {currentUser.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="dropdown-divider" />

                {onOpenPersonaModal && (
                  <button
                    type="button"
                    className="dropdown-menu-item"
                    onClick={() => {
                      onOpenPersonaModal();
                      setIsUserMenuOpen(false);
                    }}
                    id="dropdown-inspect-access-btn"
                  >
                    <span className="item-icon">🛡️</span>
                    <span>View Role &amp; Permitted Projects</span>
                  </button>
                )}

                {/* Developer Persona Switcher (Only visible in Development mode) */}
                {isDevMode && (
                  <div className="dev-switcher-section">
                    <button
                      type="button"
                      className="dev-switcher-toggle"
                      onClick={() => setShowDevSwitcher(!showDevSwitcher)}
                    >
                      <span>🛠️ Dev Impersonation ({showDevSwitcher ? 'Hide' : 'Show'})</span>
                    </button>
                    {showDevSwitcher && (
                      <div className="dev-personas-list">
                        {personas.map(p => (
                          <button
                            key={p.uid}
                            type="button"
                            className={`dev-persona-btn ${p.uid === currentUser.uid ? 'active' : ''}`}
                            onClick={() => {
                              switchPersona(p.uid);
                              setIsUserMenuOpen(false);
                            }}
                          >
                            <span>{p.displayName}</span>
                            <span className="dev-persona-role">{p.roleLabel}</span>
                          </button>
                        ))}
                        <button
                          type="button"
                          className="btn-reset-demo"
                          onClick={() => {
                            resetDemoData();
                            setIsUserMenuOpen(false);
                          }}
                        >
                          ↻ Reset Test Data
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="dropdown-divider" />

                <button
                  type="button"
                  className="dropdown-menu-item logout-item"
                  onClick={async () => {
                    setIsUserMenuOpen(false);
                    await logout();
                  }}
                  id="dropdown-logout-btn"
                >
                  <span className="item-icon">🚪</span>
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
