import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';

interface TopbarProps {
  onOpenTriage: () => void;
  onOpenNewTask: () => void;
  canMutate: boolean;
}

export const Topbar: React.FC<TopbarProps> = ({
  onOpenTriage,
  onOpenNewTask,
  canMutate,
}) => {
  const { currentUser, personas, switchPersona, resetDemoData } = useAuth();

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="workspace-badge">
          <span className="workspace-dot" />
          <span className="workspace-title">OJIX TeamFlow Workspace</span>
        </div>
      </div>

      <div className="topbar-right">
        {/* Triage Assistant Quick-Trigger (DEC-012) */}
        <Button
          variant="secondary"
          size="sm"
          onClick={onOpenTriage}
          className="triage-trigger-btn"
          title="Open Work Triage Accelerator drawer"
        >
          ⚡ Work Triage AI
        </Button>

        {/* Create Task Button (Disabled for Viewers) */}
        {canMutate && (
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenNewTask}
            id="create-task-topbar-btn"
          >
            + Create Task
          </Button>
        )}

        {/* Demo Persona Quick-Switcher (DEC-009) */}
        <div className="persona-switcher-container">
          <label htmlFor="persona-select" className="persona-label">
            Role Persona:
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

        {/* Reset Demo Data (DEC-011) */}
        <button
          className="btn-reset-demo"
          onClick={resetDemoData}
          title="Reset back to clean synthetic seed dataset"
        >
          ↻ Reset Seed
        </button>
      </div>
    </header>
  );
};
