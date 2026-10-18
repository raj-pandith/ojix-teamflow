import React from 'react';
import { Task } from '../../types/task';
import { UserProfile } from '../../types/auth';
import { Badge } from '../../components/common/Badge';
import { isTaskOverdue, formatDisplayDate } from '../../domain/timezone';
import {
  PanelsTopLeft,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertCircle,
  ListTodo,
} from 'lucide-react';

interface PersonalDashboardProps {
  myTasks: Task[];
  currentUser: UserProfile;
  onSelectTask: (task: Task) => void;
  onGoToBoard: () => void;
}

export const PersonalDashboard: React.FC<PersonalDashboardProps> = ({
  myTasks,
  currentUser,
  onSelectTask,
  onGoToBoard,
}) => {
  const overdueTasks = myTasks.filter(t => isTaskOverdue(t.dueDate, t.status));
  const inProgressTasks = myTasks.filter(t => t.status === 'in_progress');
  const blockedTasks = myTasks.filter(t => t.status === 'blocked');
  const completedTasks = myTasks.filter(t => t.status === 'done');
  const openTasks = myTasks.filter(t => t.status !== 'done');

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="dashboard-header-text">
          <h2 className="dashboard-title">My Queue</h2>
          <p className="dashboard-subtitle">
            {currentUser.displayName} — Current task queue across active projects.
          </p>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={onGoToBoard}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <PanelsTopLeft size={14} />
          <span>Open Board</span>
        </button>
      </div>

      {/* Metric Cards Row with Asymmetric Hierarchy */}
      <div className="metrics-grid">
        <div className="metric-card metric-card-primary">
          <div className="metric-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ListTodo size={14} style={{ color: 'var(--accent-primary, #C9662F)' }} />
            <span>Assigned Queue</span>
          </div>
          <div className="metric-value">{myTasks.length}</div>
          <div className="metric-meta">{openTasks.length} open</div>
        </div>

        <div className={`metric-card ${overdueTasks.length > 0 ? 'metric-card-danger' : ''}`}>
          <div className="metric-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertCircle size={14} style={{ color: overdueTasks.length > 0 ? 'var(--status-overdue, #BA2C1D)' : 'inherit' }} />
            <span>Overdue</span>
          </div>
          <div className="metric-value">{overdueTasks.length}</div>
          <div className="metric-meta">Requires attention</div>
        </div>

        <div className="metric-card metric-card-info">
          <div className="metric-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={14} style={{ color: 'var(--status-inprogress, #1F4E79)' }} />
            <span>In Progress</span>
          </div>
          <div className="metric-value">{inProgressTasks.length}</div>
          <div className="metric-meta">In flight</div>
        </div>

        <div className={`metric-card ${blockedTasks.length > 0 ? 'metric-card-warning' : ''}`}>
          <div className="metric-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={14} style={{ color: blockedTasks.length > 0 ? 'var(--status-blocked, #A65700)' : 'inherit' }} />
            <span>Blocked</span>
          </div>
          <div className="metric-value">{blockedTasks.length}</div>
          <div className="metric-meta">Needs unblocking</div>
        </div>

        <div className="metric-card metric-card-success">
          <div className="metric-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 size={14} style={{ color: 'var(--status-done, #176E3C)' }} />
            <span>Completed</span>
          </div>
          <div className="metric-value">{completedTasks.length}</div>
          <div className="metric-meta">Finished</div>
        </div>
      </div>

      {/* Actionable Overdue & High Priority Items Section */}
      <div className="dashboard-sections-grid">
        <div className="dashboard-panel">
          <div className="panel-header">
            <h3 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} color="var(--status-overdue, #BA2C1D)" />
              <span>Urgent &amp; Overdue ({overdueTasks.length})</span>
            </h3>
          </div>
          <div className="panel-body">
            {overdueTasks.map(task => (
              <div
                key={task.id}
                className="action-item-card action-item-overdue"
                onClick={() => onSelectTask(task)}
                title="Click to view and emphasize on Kanban Board"
              >
                <div className="action-item-header">
                  <Badge type="priority" value={task.priority} />
                  <Badge type="overdue" value="OVERDUE" />
                  <span className="action-due-date">Due: {formatDisplayDate(task.dueDate)}</span>
                </div>
                <h4 className="action-item-title">{task.title}</h4>
              </div>
            ))}
            {overdueTasks.length === 0 && (
              <div className="empty-panel-state">
                <CheckCircle2 size={24} color="var(--status-done, #176E3C)" style={{ marginBottom: '6px' }} />
                <p>All clear. No overdue items on your plate.</p>
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="panel-header">
            <h3 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={16} color="var(--status-inprogress, #1F4E79)" />
              <span>In Progress ({inProgressTasks.length})</span>
            </h3>
          </div>
          <div className="panel-body">
            {inProgressTasks.map(task => (
              <div
                key={task.id}
                className="action-item-card"
                onClick={() => onSelectTask(task)}
                title="Click to view and emphasize on Kanban Board"
              >
                <div className="action-item-header">
                  <Badge type="priority" value={task.priority} />
                  <span className="action-due-date">Due: {formatDisplayDate(task.dueDate)}</span>
                </div>
                <h4 className="action-item-title">{task.title}</h4>
                <p className="action-item-desc">{task.description}</p>
              </div>
            ))}
            {inProgressTasks.length === 0 && (
              <div className="empty-panel-state">
                <Clock size={24} color="var(--text-muted, #8E9EA5)" style={{ marginBottom: '6px' }} />
                <p>Nothing active right now. Pick an item from To Do to begin.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
