import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import {
  Bell,
  BellRing,
  UserPlus,
  Plus,
  Zap,
  ChevronDown,
  ShieldCheck,
  LogOut,
  RotateCcw,
  Settings,
} from 'lucide-react';

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
              borderColor: 'var(--accent-primary, #C9662F)',
              color: 'var(--accent-primary, #C9662F)',
            }}
            title="Enable native desktop browser notifications"
          >
            <BellRing size={14} style={{ marginRight: '6px' }} />
            <span>Enable Alerts</span>
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
            <UserPlus size={14} style={{ marginRight: '6px' }} />
            <span>Invite Member</span>
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
              background: 'var(--bg-surface, #FFFFFF)',
              border: '1px solid var(--border-subtle, #E8DED5)',
              borderRadius: '8px',
              padding: '7px 9px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-primary, #1E293B)',
              boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05))',
              transition: 'background-color 0.15s ease, border-color 0.15s ease',
            }}
          >
            <Bell size={16} />
            {typeof unreadMessagesCount === 'number' && unreadMessagesCount > 0 && (
              <span
                id="topbar-unread-badge"
                style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  background: 'var(--accent-primary, #C9662F)',
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: '10px',
                  minWidth: '16px',
                  textAlign: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
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
          <Zap size={14} style={{ marginRight: '6px', color: 'var(--accent-primary)' }} />
          <span>Work Triage</span>
        </Button>

        {/* Create Task Button (Workspace Admin and Project Lead only) */}
        {canCreate && (
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenNewTask}
            id="create-task-topbar-btn"
          >
            <Plus size={14} style={{ marginRight: '6px' }} />
            <span>New Task</span>
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
              <ChevronDown
                size={14}
                className={`menu-caret-icon ${isUserMenuOpen ? 'open' : ''}`}
                style={{
                  transition: 'transform 0.2s ease',
                  transform: isUserMenuOpen ? 'rotate(180deg)' : 'none',
                  color: 'var(--text-muted, #64748B)',
                }}
              />
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
                    <ShieldCheck size={16} className="item-icon" />
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
                      <Settings size={14} style={{ marginRight: '6px' }} />
                      <span>Dev Impersonation ({showDevSwitcher ? 'Hide' : 'Show'})</span>
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
                          <RotateCcw size={14} style={{ marginRight: '6px' }} />
                          <span>Reset Test Data</span>
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
                  <LogOut size={16} className="item-icon" />
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
