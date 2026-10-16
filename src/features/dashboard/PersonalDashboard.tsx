import React from 'react';
import { Task } from '../../types/task';
import { UserProfile } from '../../types/auth';
import { Badge } from '../../components/common/Badge';
import { isTaskOverdue, formatDisplayDate } from '../../domain/timezone';

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
          <h2 className="dashboard-title">Personal Execution Hub</h2>
          <p className="dashboard-subtitle">
            Welcome back, {currentUser.displayName}. Here is your prioritized workstream across permitted projects.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onGoToBoard}>
          View Kanban Board ➔
        </button>
      </div>

      {/* Metric Cards Row */}
      <div className="metrics-grid">
        <div className="metric-card metric-card-primary">
          <div className="metric-label">Assigned Work</div>
          <div className="metric-value">{myTasks.length}</div>
          <div className="metric-meta">{openTasks.length} pending action</div>
        </div>

        <div className={`metric-card ${overdueTasks.length > 0 ? 'metric-card-danger' : ''}`}>
          <div className="metric-label">Overdue Tasks</div>
          <div className="metric-value">{overdueTasks.length}</div>
          <div className="metric-meta">Past local midnight deadline</div>
        </div>

        <div className="metric-card metric-card-info">
          <div className="metric-label">In Progress</div>
          <div className="metric-value">{inProgressTasks.length}</div>
          <div className="metric-meta">Active execution</div>
        </div>

        <div className={`metric-card ${blockedTasks.length > 0 ? 'metric-card-warning' : ''}`}>
          <div className="metric-label">Blocked Items</div>
          <div className="metric-value">{blockedTasks.length}</div>
          <div className="metric-meta">Require escalation</div>
        </div>

        <div className="metric-card metric-card-success">
          <div className="metric-label">Completed</div>
          <div className="metric-value">{completedTasks.length}</div>
          <div className="metric-meta">Closed deliverables</div>
        </div>
      </div>

      {/* Actionable Overdue & High Priority Items Section */}
      <div className="dashboard-sections-grid">
        <div className="dashboard-panel">
          <div className="panel-header">
            <h3 className="panel-title">🔥 Urgent & At-Risk Tasks ({overdueTasks.length})</h3>
          </div>
          <div className="panel-body">
            {overdueTasks.map(task => (
              <div
                key={task.id}
                className="action-item-card action-item-overdue"
                onClick={() => onSelectTask(task)}
              >
                <div className="action-item-header">
                  <Badge type="priority" value={task.priority} />
                  <Badge type="overdue" value="OVERDUE" />
                  <span className="action-due-date">📅 Due: {formatDisplayDate(task.dueDate)}</span>
                </div>
                <h4 className="action-item-title">{task.title}</h4>
              </div>
            ))}
            {overdueTasks.length === 0 && (
              <div className="empty-panel-state">
                <span className="empty-panel-icon">🎉</span>
                <p>No overdue tasks! You are completely on schedule.</p>
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="panel-header">
            <h3 className="panel-title">⚡ In Progress Workstream ({inProgressTasks.length})</h3>
          </div>
          <div className="panel-body">
            {inProgressTasks.map(task => (
              <div
                key={task.id}
                className="action-item-card"
                onClick={() => onSelectTask(task)}
              >
                <div className="action-item-header">
                  <Badge type="priority" value={task.priority} />
                  <span className="action-due-date">📅 Due: {formatDisplayDate(task.dueDate)}</span>
                </div>
                <h4 className="action-item-title">{task.title}</h4>
                <p className="action-item-desc">{task.description}</p>
              </div>
            ))}
            {inProgressTasks.length === 0 && (
              <div className="empty-panel-state">
                <span className="empty-panel-icon">☕</span>
                <p>No tasks currently in progress. Pick an item from To Do to get started.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
