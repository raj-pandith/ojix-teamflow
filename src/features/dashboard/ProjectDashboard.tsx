import React from 'react';
import { Project } from '../../types/project';
import { Task } from '../../types/task';
import { UserProfile } from '../../types/auth';
import { Badge } from '../../components/common/Badge';
import { isTaskOverdue, formatDisplayDate } from '../../domain/timezone';
import { storageEngine } from '../../services/storageEngine';

interface ProjectDashboardProps {
  project: Project | null;
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  onGoToKanban: () => void;
  onDeleteProject?: (projectId: string) => void;
  onRequestDelete?: (projectId: string, projectName: string) => void;
  currentUser?: UserProfile | null;
}

export const ProjectDashboard: React.FC<ProjectDashboardProps> = ({
  project,
  tasks,
  onSelectTask,
  onGoToKanban,
  onDeleteProject,
  onRequestDelete,
  currentUser,
}) => {
  if (!project) {
    return (
      <div className="empty-panel-state">
        <p>Please select a project to view its executive dashboard.</p>
      </div>
    );
  }

  const users = storageEngine.getUsers();
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'done');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const blockedTasks = tasks.filter(t => t.status === 'blocked');
  const overdueTasks = tasks.filter(t => isTaskOverdue(t.dueDate, t.status));

  const completionPercentage = totalTasks > 0 ? Math.round((doneTasks.length / totalTasks) * 100) : 0;

  const canDelete =
    currentUser?.role === 'workspace_admin' || currentUser?.role === 'project_lead';

  return (
    <div className="dashboard-container">
      {/* Project Banner & Overall Progress */}
      <div className="project-hero-card">
        <div className="project-hero-top">
          <div>
            <div className="project-status-row">
              <Badge type="status" value={project.status} />
              <span className="project-date-range">
                🗓️ {formatDisplayDate(project.startDate)} ➔ {formatDisplayDate(project.dueDate)}
              </span>
            </div>
            <h2 className="project-hero-title">{project.name}</h2>
            <p className="project-hero-desc">{project.objective}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="btn btn-primary btn-sm" onClick={onGoToKanban}>
              Open Project Board ➔
            </button>
            {canDelete && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  if (onRequestDelete) {
                    onRequestDelete(project.id, project.name);
                  } else if (onDeleteProject) {
                    onDeleteProject(project.id);
                  }
                }}
                id="delete-project-dashboard-btn"
                title="Delete this project"
              >
                🗑️ Delete Project
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="progress-section">
          <div className="progress-labels">
            <span>Overall Milestone Completion</span>
            <span className="progress-pct">{completionPercentage}%</span>
          </div>
          <div className="progress-bar-track">
            <div
              className="progress-bar-fill"
              style={{ width: `${completionPercentage}%` }}
              role="progressbar"
              aria-valuenow={completionPercentage}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Total Scope</div>
          <div className="metric-value">{totalTasks}</div>
          <div className="metric-meta">Active tasks</div>
        </div>

        <div className={`metric-card ${overdueTasks.length > 0 ? 'metric-card-danger' : ''}`}>
          <div className="metric-label">Overdue Tasks</div>
          <div className="metric-value">{overdueTasks.length}</div>
          <div className="metric-meta">Schedule risk</div>
        </div>

        <div className="metric-card metric-card-info">
          <div className="metric-label">In Progress</div>
          <div className="metric-value">{inProgressTasks.length}</div>
          <div className="metric-meta">Work underway</div>
        </div>

        <div className={`metric-card ${blockedTasks.length > 0 ? 'metric-card-warning' : ''}`}>
          <div className="metric-label">Blocked Work</div>
          <div className="metric-value">{blockedTasks.length}</div>
          <div className="metric-meta">Bottlenecks identified</div>
        </div>

        <div className="metric-card metric-card-success">
          <div className="metric-label">Completed</div>
          <div className="metric-value">{doneTasks.length}</div>
          <div className="metric-meta">Deliverables verified</div>
        </div>
      </div>

      {/* Blocker & Risk Breakdown */}
      <div className="dashboard-sections-grid">
        <div className="dashboard-panel">
          <div className="panel-header">
            <h3 className="panel-title">⚠️ Active Blockers & Dependencies ({blockedTasks.length})</h3>
          </div>
          <div className="panel-body">
            {blockedTasks.map(task => {
              const assignee = users.find(u => u.uid === task.assigneeId);
              return (
                <div
                  key={task.id}
                  className="action-item-card action-item-blocked"
                  onClick={() => onSelectTask(task)}
                >
                  <div className="action-item-header">
                    <Badge type="priority" value={task.priority} />
                    <span className="action-assignee">👤 {assignee?.displayName || 'Unassigned'}</span>
                  </div>
                  <h4 className="action-item-title">{task.title}</h4>
                  <div className="blocker-reason-highlight">
                    <strong>Reason:</strong> {task.blockerReason}
                  </div>
                </div>
              );
            })}
            {blockedTasks.length === 0 && (
              <div className="empty-panel-state">
                <span className="empty-panel-icon">🟢</span>
                <p>No blocked tasks in this project. Work is flowing smoothly.</p>
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="panel-header">
            <h3 className="panel-title">👥 Team Allocation ({project.memberIds.length} Members)</h3>
          </div>
          <div className="panel-body">
            <div className="team-allocations-list">
              {project.memberIds.map(uid => {
                const member = users.find(u => u.uid === uid);
                const memberTasks = tasks.filter(t => t.assigneeId === uid);
                const memberDone = memberTasks.filter(t => t.status === 'done');
                const memberBlocked = memberTasks.filter(t => t.status === 'blocked');

                return (
                  <div key={uid} className="team-member-row">
                    <div className="team-member-info">
                      <span className="member-avatar">{member?.displayName.charAt(0) || 'U'}</span>
                      <div>
                        <strong className="member-name">{member?.displayName}</strong>
                        <span className="member-role">{member?.role.replace('_', ' ').toUpperCase()}</span>
                      </div>
                    </div>
                    <div className="member-stats">
                      <span className="stat-pill">{memberTasks.length} tasks</span>
                      <span className="stat-pill stat-done">{memberDone.length} done</span>
                      {memberBlocked.length > 0 && (
                        <span className="stat-pill stat-blocked">{memberBlocked.length} blocked</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
