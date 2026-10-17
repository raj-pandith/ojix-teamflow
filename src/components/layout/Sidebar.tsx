import React from 'react';
import { Project } from '../../types/project';
import { UserProfile } from '../../types/auth';

export type ActiveNavTab = 'kanban' | 'list' | 'dashboard' | 'my-tasks' | 'security' | 'projects';

interface SidebarProps {
  currentTab: ActiveNavTab;
  onSelectTab: (tab: ActiveNavTab) => void;
  projects: Project[];
  activeProjectId: string;
  onSelectProject: (projectId: string) => void;
  onOpenNewProject: () => void;
  currentUser: UserProfile | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  projects,
  activeProjectId,
  onSelectProject,
  onOpenNewProject,
  currentUser,
}) => {
  const canCreateProject =
    currentUser?.role === 'workspace_admin' || currentUser?.role === 'project_lead';

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-logo">OJIX</div>
        <div className="brand-text">
          <span className="brand-name">TeamFlow</span>
          <span className="brand-tagline">Execution OS</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-title">Navigation</div>
        <button
          className={`nav-item ${currentTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => onSelectTab('dashboard')}
          id="nav-project-dashboard"
        >
          <span className="nav-icon">📊</span>
          <span className="nav-label">Project Dashboard</span>
        </button>

        <button
          className={`nav-item ${currentTab === 'my-tasks' ? 'active' : ''}`}
          onClick={() => onSelectTab('my-tasks')}
          id="nav-my-tasks"
        >
          <span className="nav-icon">👤</span>
          <span className="nav-label">My Work & Tasks</span>
        </button>

        <button
          className={`nav-item ${currentTab === 'kanban' ? 'active' : ''}`}
          onClick={() => onSelectTab('kanban')}
          id="nav-kanban-board"
        >
          <span className="nav-icon">📋</span>
          <span className="nav-label">Kanban Board</span>
        </button>

        <button
          className={`nav-item ${currentTab === 'list' ? 'active' : ''}`}
          onClick={() => onSelectTab('list')}
          id="nav-list-view"
        >
          <span className="nav-icon">📑</span>
          <span className="nav-label">Grouped List View</span>
        </button>

        {currentUser?.role === 'workspace_admin' && (
          <button
            className={`nav-item ${currentTab === 'security' ? 'active' : ''}`}
            onClick={() => onSelectTab('security')}
            id="nav-security-assurance"
          >
            <span className="nav-icon">🛡️</span>
            <span className="nav-label">Assurance & RBAC</span>
          </button>
        )}
      </nav>

      <div className="sidebar-projects-section">
        <div className="projects-header">
          <span className="nav-section-title">Permitted Projects ({projects.length})</span>
          {canCreateProject && (
            <button
              className="btn-add-project"
              onClick={onOpenNewProject}
              title="Create new project"
              id="create-project-sidebar-btn"
            >
              +
            </button>
          )}
        </div>

        <div className="project-list-scroll">
          {projects.map(proj => {
            const isActive = proj.id === activeProjectId;

            return (
              <div
                key={proj.id}
                className={`project-nav-item-row ${isActive ? 'active' : ''}`}
              >
                <button
                  className={`project-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => onSelectProject(proj.id)}
                >
                  <span className={`status-indicator status-${proj.status}`} />
                  <span className="project-nav-name" title={proj.name}>
                    {proj.name}
                  </span>
                </button>
              </div>
            );
          })}
          {projects.length === 0 && (
            <div className="empty-projects-note">No permitted projects found.</div>
          )}
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="user-profile-widget">
          <div className="user-avatar-initials">
            {currentUser?.displayName.charAt(0) || 'U'}
          </div>
          <div className="user-profile-info">
            <span className="user-name">{currentUser?.displayName}</span>
            <span className="user-role-label">
              {currentUser?.role.replace('_', ' ').toUpperCase()}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
