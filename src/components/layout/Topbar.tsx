import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';

interface TopbarProps {
  onOpenTriage: () => void;
  onOpenNewTask: () => void;
  onOpenAddUser?: () => void;
  canMutate: boolean;
  onToggleMobileNav?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  onOpenTriage,
  onOpenNewTask,
  onOpenAddUser,
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
