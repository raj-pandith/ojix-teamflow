import React from 'react';
import { Project } from '../../types/project';
import { UserProfile } from '../../types/auth';
import { authService } from '../../services/authService';
import {
  LayoutDashboard,
  ListTodo,
  PanelsTopLeft,
  List,
  MessagesSquare,
  Users,
  ShieldCheck,
  Plus,
  LogOut,
  X,
} from 'lucide-react';

export type ActiveNavTab = 'kanban' | 'list' | 'dashboard' | 'my-tasks' | 'messages' | 'security' | 'projects' | 'users';

interface SidebarProps {
  currentTab: ActiveNavTab;
  onSelectTab: (tab: ActiveNavTab) => void;
  projects: Project[];
  activeProjectId: string;
  onSelectProject: (projectId: string) => void;
  onOpenNewProject: () => void;
  currentUser: UserProfile | null;
  unreadMessagesCount?: number;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  onOpenProfile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  projects,
  activeProjectId,
  onSelectProject,
  onOpenNewProject,
  currentUser,
  unreadMessagesCount,
  isMobileOpen = false,
  onCloseMobile,
  onOpenProfile,
}) => {
  const handleLogout = () => {
    authService.logout();
  };

  const canCreateProject =
    currentUser?.role === 'workspace_admin' || currentUser?.role === 'project_lead';

  const handleSelectTab = (tab: ActiveNavTab) => {
    onSelectTab(tab);
    onCloseMobile?.();
  };

  const handleSelectProject = (projectId: string) => {
    onSelectProject(projectId);
    onCloseMobile?.();
  };

  const handleOpenNewProject = () => {
    onOpenNewProject();
    onCloseMobile?.();
  };

  return (
    <>
      {isMobileOpen && (
        <div
          className="sidebar-mobile-backdrop"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside className={`sidebar ${isMobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-logo">OJIX</div>
          <div className="brand-text">
            <span className="brand-name">TeamFlow</span>
            <span className="brand-tagline">Project OS</span>
          </div>
          {onCloseMobile && (
            <button
              className="sidebar-close-btn"
              onClick={onCloseMobile}
              aria-label="Close sidebar navigation"
            >
              <X size={18} />
            </button>
          )}
        </div>

      <nav className="sidebar-nav">
        <div className="nav-section-title">Views</div>
        <button
          className={`nav-item ${currentTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => handleSelectTab('dashboard')}
          id="nav-project-dashboard"
        >
          <LayoutDashboard size={18} className="nav-icon" />
          <span className="nav-label">Dashboard</span>
        </button>

        <button
          className={`nav-item ${currentTab === 'my-tasks' ? 'active' : ''}`}
          onClick={() => handleSelectTab('my-tasks')}
          id="nav-my-tasks"
        >
          <ListTodo size={18} className="nav-icon" />
          <span className="nav-label">My Queue</span>
        </button>

        <button
          className={`nav-item ${currentTab === 'kanban' ? 'active' : ''}`}
          onClick={() => handleSelectTab('kanban')}
          id="nav-kanban-board"
        >
          <PanelsTopLeft size={18} className="nav-icon" />
          <span className="nav-label">Board</span>
        </button>

        <button
          className={`nav-item ${currentTab === 'list' ? 'active' : ''}`}
          onClick={() => handleSelectTab('list')}
          id="nav-list-view"
        >
          <List size={18} className="nav-icon" />
          <span className="nav-label">Task List</span>
        </button>

        <button
          className={`nav-item ${currentTab === 'messages' ? 'active' : ''}`}
          onClick={() => handleSelectTab('messages')}
          id="nav-message-center"
        >
          <MessagesSquare size={18} className="nav-icon" />
          <span className="nav-label">Messages</span>
          {typeof unreadMessagesCount === 'number' && unreadMessagesCount > 0 && (
            <span
              className="nav-unread-badge"
              id="sidebar-unread-badge"
              style={{
                marginLeft: 'auto',
                background: 'var(--accent-primary, #C9662F)',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: '10px',
              }}
            >
              {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
            </span>
          )}
        </button>

        {currentUser?.role === 'workspace_admin' && (
          <button
            className={`nav-item ${currentTab === 'users' ? 'active' : ''}`}
            onClick={() => handleSelectTab('users')}
            id="nav-manage-users"
          >
            <Users size={18} className="nav-icon" />
            <span className="nav-label">Members</span>
          </button>
        )}

        {currentUser?.role === 'workspace_admin' && (
          <button
            className={`nav-item ${currentTab === 'security' ? 'active' : ''}`}
            onClick={() => handleSelectTab('security')}
            id="nav-security-assurance"
          >
            <ShieldCheck size={18} className="nav-icon" />
            <span className="nav-label">Security & Access</span>
          </button>
        )}
      </nav>

      <div className="sidebar-projects-section">
        <div className="projects-header">
          <span className="nav-section-title">Projects ({projects.length})</span>
          {canCreateProject && (
            <button
              className="btn-add-project"
              onClick={handleOpenNewProject}
              title="Add new project"
              id="create-project-sidebar-btn"
            >
              <Plus size={14} />
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
                  onClick={() => handleSelectProject(proj.id)}
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
            <div className="empty-projects-note">No active projects.</div>
          )}
        </div>
      </div>

      <div className="sidebar-footer">
        <div
          className="user-profile-widget"
          style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}
        >
          <div
            onClick={onOpenProfile}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: onOpenProfile ? 'pointer' : 'default', flex: 1, minWidth: 0 }}
            title={onOpenProfile ? 'Click to inspect your role & permitted projects' : undefined}
            id="sidebar-user-persona-widget"
          >
            <div className="user-avatar-initials">
              {currentUser?.displayName.charAt(0) || 'U'}
            </div>
            <div className="user-profile-info" style={{ overflow: 'hidden' }}>
              <span className="user-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                {currentUser?.displayName}
              </span>
              <span className="user-role-label">
                {currentUser?.role.replace('_', ' ').toUpperCase()}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="sidebar-logout-btn"
            onClick={handleLogout}
            title="Sign out of OJIX TeamFlow"
            id="sidebar-logout-btn"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted, #64748B)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s ease, background-color 0.15s ease',
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
    </>
  );
};
