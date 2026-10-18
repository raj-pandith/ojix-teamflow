import React, { useState, useRef, useEffect } from 'react';
import { Project, ProjectFormData, ProjectStatus } from '../../types/project';
import { Task, TaskStatus } from '../../types/task';
import { UserProfile } from '../../types/auth';
import { Badge } from '../../components/common/Badge';
import { ManageTeamModal } from '../../components/projects/ManageTeamModal';
import { ProjectEditModal } from '../../components/projects/ProjectEditModal';
import { isTaskOverdue, formatDisplayDate } from '../../domain/timezone';
import { storageEngine } from '../../services/storageEngine';
import {
  Calendar,
  Pencil,
  Trash2,
  PanelsTopLeft,
  Users,
  User,
  Eye,
  Search,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ListTodo,
  Mail,
  ChevronRight,
  MoreVertical,
} from 'lucide-react';

interface ProjectDashboardProps {
  project: Project | null;
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  onGoToKanban: () => void;
  onUpdateProject?: (projectId: string, updates: Partial<ProjectFormData>) => Promise<unknown>;
  onDeleteProject?: (projectId: string) => void;
  onRequestDelete?: (projectId: string, projectName: string) => void;
  currentUser?: UserProfile | null;
  onNavigateToTasks?: (filter: {
    assigneeId?: string;
    status?: TaskStatus | 'all' | 'pending';
    view?: 'list' | 'kanban';
  }) => void;
  onOpenDirectMessage?: (memberId: string) => void;
}

export const ProjectDashboard: React.FC<ProjectDashboardProps> = ({
  project,
  tasks,
  onSelectTask,
  onGoToKanban,
  onUpdateProject,
  onDeleteProject,
  onRequestDelete,
  currentUser,
  onNavigateToTasks,
  onOpenDirectMessage,
}) => {
  const [isManageTeamOpen, setIsManageTeamOpen] = useState(false);
  const [isEditProjectOpen, setIsEditProjectOpen] = useState(false);

  // Search, Filters & Sorting Controls for Team Allocation
  const [searchMemberQuery, setSearchMemberQuery] = useState('');
  const [memberRoleFilter, setMemberRoleFilter] = useState<'all' | 'member' | 'viewer'>('all');
  const [memberSortBy, setMemberSortBy] = useState<'name' | 'tasks' | 'pending' | 'blocked'>('name');
  const [activeMenuMemberId, setActiveMenuMemberId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut Ctrl+K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close 3-dots action menu on outside click
  useEffect(() => {
    if (!activeMenuMemberId) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.member-col-actions')) {
        setActiveMenuMemberId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeMenuMemberId]);

  if (!project) {
    return (
      <div className="empty-panel-state">
        <p>Select a project from the sidebar to inspect progress and workload.</p>
      </div>
    );
  }

  const users = storageEngine.getUsers();
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'done');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const blockedTasks = tasks.filter(t => t.status === 'blocked');
  const overdueTasks = tasks.filter(t => isTaskOverdue(t.dueDate, t.status));
  const unassignedTasks = tasks.filter(t => !t.assigneeId);

  const completionPercentage = totalTasks > 0 ? Math.round((doneTasks.length / totalTasks) * 100) : 0;

  const canDelete =
    currentUser?.role === 'workspace_admin' || currentUser?.role === 'project_lead';

  const canManageTeam =
    currentUser?.role === 'workspace_admin' ||
    (currentUser?.role === 'project_lead' && (project.ownerId === currentUser.uid || project.memberIds.includes(currentUser.uid)));

  return (
    <div className="dashboard-container">
      {/* Project Banner & Overall Progress */}
      <div className="project-hero-card">
        <div className="project-hero-top">
          <div>
            <div className="project-status-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <Badge type="status" value={project.status} />
              {canManageTeam && onUpdateProject && (
                <div className="project-status-quick-switch">
                  <select
                    className="project-status-select-control"
                    value={project.status}
                    onChange={async e => {
                      const nextStatus = e.target.value as ProjectStatus;
                      await onUpdateProject(project.id, { status: nextStatus });
                    }}
                    title="Change project status"
                    aria-label="Change project status"
                    id="project-status-quick-select"
                  >
                    <option value="planning">Planning</option>
                    <option value="active">Active</option>
                    <option value="on_hold">On Hold</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              )}
              <span className="project-date-range" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <Calendar size={13} style={{ color: 'var(--accent-primary, #C9662F)' }} />
                <span>{formatDisplayDate(project.startDate)} – {formatDisplayDate(project.dueDate)}</span>
              </span>
            </div>
            <h2 className="project-hero-title">{project.name}</h2>
            <p className="project-hero-desc">{project.objective}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={onGoToKanban}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <PanelsTopLeft size={14} />
              <span>Open Board</span>
            </button>
            {canManageTeam && onUpdateProject && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setIsEditProjectOpen(true)}
                id="edit-project-dashboard-btn"
                title="Edit project details and status"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Pencil size={13} />
                <span>Edit Project</span>
              </button>
            )}
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
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Trash2 size={13} />
                <span>Delete</span>
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="progress-section">
          <div className="progress-labels">
            <span>Milestone Progress</span>
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

      {/* Metrics Row with Asymmetrical Hierarchy */}
      <div className="metrics-grid">
        <div className="metric-card metric-card-primary">
          <div className="metric-label">Total Scope</div>
          <div className="metric-value">{totalTasks}</div>
          <div className="metric-meta">Active tasks in pipeline</div>
        </div>

        <div className={`metric-card ${overdueTasks.length > 0 ? 'metric-card-danger' : ''}`}>
          <div className="metric-label">Overdue</div>
          <div className="metric-value">{overdueTasks.length}</div>
          <div className="metric-meta">Past due date</div>
        </div>

        <div className="metric-card metric-card-info">
          <div className="metric-label">In Progress</div>
          <div className="metric-value">{inProgressTasks.length}</div>
          <div className="metric-meta">In flight</div>
        </div>

        <div className={`metric-card ${blockedTasks.length > 0 ? 'metric-card-warning' : ''}`}>
          <div className="metric-label">Blocked</div>
          <div className="metric-value">{blockedTasks.length}</div>
          <div className="metric-meta">Needs resolution</div>
        </div>

        <div className="metric-card metric-card-success">
          <div className="metric-label">Completed</div>
          <div className="metric-value">{doneTasks.length}</div>
          <div className="metric-meta">Finished deliverables</div>
        </div>
      </div>

      {/* Blocker & Risk Breakdown */}
      <div className="dashboard-sections-grid">
        <div className="dashboard-panel">
          <div className="panel-header">
            <h3 className="panel-title">Active Blockers ({blockedTasks.length})</h3>
          </div>
          <div className="panel-body">
            {blockedTasks.map(task => {
              const assignee = users.find(u => u.uid === task.assigneeId);
              return (
                <div
                  key={task.id}
                  className="action-item-card action-item-blocked"
                  onClick={() => onSelectTask(task)}
                  title="Click to navigate to Kanban board and highlight this task"
                >
                  <div className="action-item-header">
                    <Badge type="priority" value={task.priority} />
                    <span className="action-assignee" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <User size={12} />
                      <span>{assignee?.displayName || 'Unassigned'}</span>
                    </span>
                    <span className="action-goto-link" style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--accent-primary)', fontWeight: 600 }}>Inspect on Board</span>
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
                <CheckCircle2 size={24} color="var(--status-done, #176E3C)" style={{ marginBottom: '6px' }} />
                <p>No blockers reported. Everything is moving on schedule.</p>
              </div>
            )}
          </div>
        </div>

        {/* Redesigned Modern SaaS Team Allocation Section */}
        <div className="team-allocation-panel">
          {/* Header & Dynamic Summary Badges */}
          <div className="team-allocation-header">
            <div className="team-allocation-title-group">
              <div className="team-allocation-icon-box" aria-hidden="true">
                <Users size={18} color="var(--accent-primary, #C9662F)" />
              </div>
              <div className="team-allocation-title-text">
                <h3 className="team-allocation-title" id="team-allocation-heading">
                  Team Allocation ({project.memberIds.length} Members)
                </h3>
                <p className="team-allocation-subtitle">
                  Manage your team members and track their work allocation
                </p>
              </div>
            </div>

            <div className="team-allocation-header-right">
              {/* Dynamic Summary Badges: Total, Pending, Done, Blocked */}
              <div className="team-allocation-summary-badges">
                <div
                  className="summary-badge-pill badge-pastel-blue"
                  title="Total tasks across all members in this project"
                >
                  <ListTodo size={14} className="summary-badge-icon" />
                  <div className="summary-badge-content">
                    <span className="summary-badge-count">{totalTasks}</span>
                    <span className="summary-badge-label">Total Tasks</span>
                  </div>
                </div>

                <div
                  className="summary-badge-pill badge-pastel-amber"
                  title="Tasks currently pending completion"
                >
                  <Clock size={14} className="summary-badge-icon" />
                  <div className="summary-badge-content">
                    <span className="summary-badge-count">
                      {tasks.filter(t => t.status !== 'done' && t.status !== 'blocked').length}
                    </span>
                    <span className="summary-badge-label">Pending</span>
                  </div>
                </div>

                <div
                  className="summary-badge-pill badge-pastel-green"
                  title="Completed tasks in this project"
                >
                  <CheckCircle2 size={14} className="summary-badge-icon" />
                  <div className="summary-badge-content">
                    <span className="summary-badge-count">{doneTasks.length}</span>
                    <span className="summary-badge-label">Done</span>
                  </div>
                </div>

                <div
                  className="summary-badge-pill badge-pastel-red"
                  title="Tasks currently blocked"
                >
                  <AlertTriangle size={14} className="summary-badge-icon" />
                  <div className="summary-badge-content">
                    <span className="summary-badge-count">{blockedTasks.length}</span>
                    <span className="summary-badge-label">Blocked</span>
                  </div>
                </div>
              </div>

              {canManageTeam && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setIsManageTeamOpen(true)}
                  id="dashboard-manage-team-btn"
                  style={{ fontSize: 'var(--text-xs)', padding: '6px 12px', height: '36px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  title="Add or remove team members for this project"
                >
                  <Users size={14} />
                  <span>Manage Team</span>
                </button>
              )}
            </div>
          </div>

          {/* Search, Filter Tabs & Sorting Toolbar */}
          <div className="team-allocation-toolbar">
            <div className="team-search-wrapper">
              <Search size={14} className="team-search-icon" aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="text"
                className="team-search-input"
                placeholder="Search member..."
                value={searchMemberQuery}
                onChange={e => setSearchMemberQuery(e.target.value)}
                id="team-member-search-input"
                aria-label="Search team member by name or role"
              />
              <span className="team-search-shortcut" title="Press Ctrl + K to focus search">
                Ctrl + K
              </span>
            </div>

            <div className="team-toolbar-controls">
              {/* Filter Pills */}
              <div className="team-filter-pills" role="tablist" aria-label="Member filter">
                <button
                  type="button"
                  className={`team-filter-pill-btn ${memberRoleFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setMemberRoleFilter('all')}
                  id="filter-all-members-btn"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <Users size={13} />
                  <span>All Members</span>
                </button>
                <button
                  type="button"
                  className={`team-filter-pill-btn ${memberRoleFilter === 'member' ? 'active' : ''}`}
                  onClick={() => setMemberRoleFilter('member')}
                  id="filter-members-only-btn"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <User size={13} />
                  <span>Members</span>
                </button>
                <button
                  type="button"
                  className={`team-filter-pill-btn ${memberRoleFilter === 'viewer' ? 'active' : ''}`}
                  onClick={() => setMemberRoleFilter('viewer')}
                  id="filter-viewers-only-btn"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <Eye size={13} />
                  <span>Viewers</span>
                </button>
              </div>

              {/* Sort Dropdown */}
              <div className="team-sort-select-wrapper" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <ArrowUpDown size={13} className="team-sort-icon" />
                <select
                  className="team-sort-select"
                  value={memberSortBy}
                  onChange={e => setMemberSortBy(e.target.value as 'name' | 'tasks' | 'pending' | 'blocked')}
                  id="team-sort-by-select"
                  aria-label="Sort team members"
                >
                  <option value="name">Sort: Name</option>
                  <option value="tasks">Sort: Total Tasks</option>
                  <option value="pending">Sort: Pending</option>
                  <option value="blocked">Sort: Blocked</option>
                </select>
              </div>
            </div>
          </div>

          {/* Members List Container */}
          <div className="team-allocations-list">
            {/* Compact Unassigned Work Row if unassigned tasks exist */}
            {unassignedTasks.length > 0 && (
              <div className="team-member-row-card team-unassigned-row" id="unassigned-work-row">
                <div className="member-col-identity">
                  <span className="member-avatar-circle unassigned-avatar" aria-hidden="true">
                    <AlertTriangle size={15} color="#B45309" />
                  </span>
                  <div className="member-details-box">
                    <div className="member-name-row">
                      <strong className="member-name-text">Unassigned Work</strong>
                    </div>
                    <div className="member-meta-row">
                      <span className="member-role-pill" style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }}>
                        Needs Allocation
                      </span>
                    </div>
                  </div>
                </div>

                {/* 4 Clickable Statistics for Unassigned Tasks */}
                <div className="member-col-stats">
                  <button
                    type="button"
                    className="stat-badge-btn badge-pastel-blue"
                    onClick={() => {
                      if (onNavigateToTasks) {
                        onNavigateToTasks({ assigneeId: 'unassigned', status: 'all', view: 'list' });
                      } else {
                        onGoToKanban();
                      }
                    }}
                    title="View all unassigned tasks"
                    aria-label={`View ${unassignedTasks.length} unassigned tasks`}
                  >
                    <div className="stat-badge-top">
                      <span className="stat-badge-icon"><ListTodo size={12} /></span>
                      <span className="stat-badge-count">{unassignedTasks.length}</span>
                    </div>
                    <span className="stat-badge-label">Total</span>
                  </button>

                  <button
                    type="button"
                    className="stat-badge-btn badge-pastel-amber"
                    onClick={() => {
                      if (onNavigateToTasks) {
                        onNavigateToTasks({ assigneeId: 'unassigned', status: 'pending', view: 'list' });
                      } else {
                        onGoToKanban();
                      }
                    }}
                    title="View pending unassigned tasks"
                    aria-label="View pending unassigned tasks"
                  >
                    <div className="stat-badge-top">
                      <span className="stat-badge-icon"><Clock size={12} /></span>
                      <span className="stat-badge-count">
                        {unassignedTasks.filter(t => t.status !== 'done' && t.status !== 'blocked').length}
                      </span>
                    </div>
                    <span className="stat-badge-label">Pending</span>
                  </button>

                  <button
                    type="button"
                    className="stat-badge-btn badge-pastel-green"
                    onClick={() => {
                      if (onNavigateToTasks) {
                        onNavigateToTasks({ assigneeId: 'unassigned', status: 'done', view: 'list' });
                      } else {
                        onGoToKanban();
                      }
                    }}
                    title="View completed unassigned tasks"
                    aria-label="View completed unassigned tasks"
                  >
                    <div className="stat-badge-top">
                      <span className="stat-badge-icon"><CheckCircle2 size={12} /></span>
                      <span className="stat-badge-count">
                        {unassignedTasks.filter(t => t.status === 'done').length}
                      </span>
                    </div>
                    <span className="stat-badge-label">Done</span>
                  </button>

                  <button
                    type="button"
                    className="stat-badge-btn badge-pastel-red"
                    onClick={() => {
                      if (onNavigateToTasks) {
                        onNavigateToTasks({ assigneeId: 'unassigned', status: 'blocked', view: 'list' });
                      } else {
                        onGoToKanban();
                      }
                    }}
                    title="View blocked unassigned tasks"
                    aria-label="View blocked unassigned tasks"
                  >
                    <div className="stat-badge-top">
                      <span className="stat-badge-icon"><AlertTriangle size={12} /></span>
                      <span className="stat-badge-count">
                        {unassignedTasks.filter(t => t.status === 'blocked').length}
                      </span>
                    </div>
                    <span className="stat-badge-label">Blocked</span>
                  </button>
                </div>

                <div className="member-col-actions">
                  <button
                    type="button"
                    className="member-nav-arrow-btn"
                    onClick={() => {
                      if (onNavigateToTasks) {
                        onNavigateToTasks({ assigneeId: 'unassigned', status: 'all', view: 'list' });
                      } else {
                        onGoToKanban();
                      }
                    }}
                    title="Open unassigned tasks"
                    aria-label="Open unassigned tasks"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Process, Filter & Sort Members */}
            {(() => {
              // Deterministic pastel avatar palette matching reference mockup
              const AVATAR_PALETTES = [
                { bg: '#D1FAE5', color: '#065F46' }, // Mint / Soft Emerald
                { bg: '#FFE4E6', color: '#9F1239' }, // Soft Rose / Pink
                { bg: '#DBEAFE', color: '#1E40AF' }, // Soft Sky / Blue
                { bg: '#EDE9FE', color: '#5B21B6' }, // Soft Lavender / Purple
                { bg: '#FEF3C7', color: '#92400E' }, // Soft Amber
              ];

              const processedMembers = project.memberIds.map((uid, idx) => {
                const member = users.find(u => u.uid === uid);
                const memberTasks = tasks.filter(t => t.assigneeId === uid);
                const total = memberTasks.length;
                const done = memberTasks.filter(t => t.status === 'done').length;
                const blocked = memberTasks.filter(t => t.status === 'blocked').length;
                const pending = memberTasks.filter(t => t.status !== 'done' && t.status !== 'blocked').length;

                const isCurrentUser = uid === currentUser?.uid;
                const isOnline = member?.status === 'active' || isCurrentUser;

                // Determine display role
                let displayRole = 'Member';
                let roleClass = 'role-member';
                if (project.ownerId === uid || member?.role === 'project_lead') {
                  displayRole = 'Project Lead';
                  roleClass = 'role-lead';
                } else if (member?.role === 'workspace_admin') {
                  displayRole = 'Workspace Admin';
                  roleClass = 'role-admin';
                } else if (member?.role === 'viewer') {
                  displayRole = 'Viewer';
                  roleClass = 'role-viewer';
                }

                // Deterministic palette
                const palette = isCurrentUser ? AVATAR_PALETTES[0] : AVATAR_PALETTES[(idx + 1) % AVATAR_PALETTES.length];

                return {
                  uid,
                  member,
                  displayName: member?.displayName || 'Unknown Member',
                  email: member?.email || '',
                  initial: (member?.displayName?.charAt(0) || 'U').toUpperCase(),
                  role: member?.role || 'member',
                  displayRole,
                  roleClass,
                  isCurrentUser,
                  isOnline,
                  palette,
                  total,
                  pending,
                  done,
                  blocked,
                };
              });

              // Apply Filters
              const filteredMembers = processedMembers.filter(m => {
                if (memberRoleFilter === 'member') {
                  if (m.role === 'viewer') return false;
                } else if (memberRoleFilter === 'viewer') {
                  if (m.role !== 'viewer') return false;
                }

                if (searchMemberQuery.trim()) {
                  const q = searchMemberQuery.toLowerCase().trim();
                  const matchName = m.displayName.toLowerCase().includes(q);
                  const matchEmail = m.email.toLowerCase().includes(q);
                  const matchRole = m.displayRole.toLowerCase().includes(q);
                  if (!matchName && !matchEmail && !matchRole) return false;
                }

                return true;
              });

              // Apply Sorting (default name sorts current user on top if present, like reference image)
              const sortedMembers = [...filteredMembers].sort((a, b) => {
                if (memberSortBy === 'name') {
                  if (a.isCurrentUser) return -1;
                  if (b.isCurrentUser) return 1;
                  return a.displayName.localeCompare(b.displayName);
                }
                if (memberSortBy === 'tasks') {
                  return b.total - a.total;
                }
                if (memberSortBy === 'pending') {
                  return b.pending - a.pending;
                }
                if (memberSortBy === 'blocked') {
                  return b.blocked - a.blocked;
                }
                return 0;
              });

              if (sortedMembers.length === 0) {
                return (
                  <div className="empty-panel-state" style={{ padding: '32px 16px' }}>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                      {searchMemberQuery || memberRoleFilter !== 'all'
                        ? 'No team members matched your search or filter.'
                        : 'No members assigned to this project yet.'}
                    </p>
                    {(searchMemberQuery || memberRoleFilter !== 'all') && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ marginTop: '12px' }}
                        onClick={() => {
                          setSearchMemberQuery('');
                          setMemberRoleFilter('all');
                        }}
                      >
                        Reset Filters
                      </button>
                    )}
                  </div>
                );
              }

              return sortedMembers.map(m => {
                const isMenuOpen = activeMenuMemberId === m.uid;

                return (
                  <div
                    key={m.uid}
                    className={`team-member-row-card ${m.isCurrentUser ? 'is-current-user' : ''}`}
                    id={`team-member-row-${m.uid}`}
                  >
                    {/* Member Identity: Avatar, Name, Role Badge, Presence */}
                    <div className="member-col-identity">
                      <span
                        className="member-avatar-circle"
                        style={{ backgroundColor: m.palette.bg, color: m.palette.color }}
                        aria-hidden="true"
                      >
                        {m.initial}
                      </span>

                      <div className="member-details-box">
                        <div className="member-name-row">
                          <strong className="member-name-text">{m.displayName}</strong>
                          {m.isCurrentUser && (
                            <span className="member-you-pill" title="Currently logged in user">
                              <User size={10} style={{ marginRight: 3 }} /> You
                            </span>
                          )}
                        </div>

                        <div className="member-meta-row">
                          <span className={`member-role-pill ${m.roleClass}`}>
                            {m.displayRole}
                          </span>
                          <span
                            className="member-presence-indicator"
                            title={m.isOnline ? 'Online now' : 'Offline'}
                          >
                            <span className={`presence-dot ${m.isOnline ? 'online' : 'offline'}`} />
                            {m.isOnline ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Direct Message Action Button (Omitted for logged-in user, as in reference image) */}
                    {!m.isCurrentUser && (
                      <div className="member-col-message">
                        <button
                          type="button"
                          className="member-msg-btn"
                          onClick={() => onOpenDirectMessage && onOpenDirectMessage(m.uid)}
                          title={`Send direct message to ${m.displayName}`}
                          aria-label={`Send message to ${m.displayName}`}
                        >
                          <Mail size={13} />
                        </button>
                      </div>
                    )}

                    {/* 4 Interactive Task Statistic Badges */}
                    <div className="member-col-stats">
                      {/* 1. Total */}
                      <button
                        type="button"
                        className="stat-badge-btn badge-pastel-blue"
                        onClick={() => {
                          if (onNavigateToTasks) {
                            onNavigateToTasks({ assigneeId: m.uid, status: 'all', view: 'list' });
                          } else {
                            onGoToKanban();
                          }
                        }}
                        title={`View all ${m.total} tasks assigned to ${m.displayName}`}
                        aria-label={`View ${m.total} total tasks for ${m.displayName}`}
                      >
                        <div className="stat-badge-top">
                          <span className="stat-badge-icon"><ListTodo size={12} /></span>
                          <span className="stat-badge-count">{m.total}</span>
                        </div>
                        <span className="stat-badge-label">Total</span>
                      </button>

                      {/* 2. Pending */}
                      <button
                        type="button"
                        className="stat-badge-btn badge-pastel-amber"
                        onClick={() => {
                          if (onNavigateToTasks) {
                            onNavigateToTasks({ assigneeId: m.uid, status: 'pending', view: 'list' });
                          } else {
                            onGoToKanban();
                          }
                        }}
                        title={`View ${m.pending} pending tasks assigned to ${m.displayName}`}
                        aria-label={`View ${m.pending} pending tasks for ${m.displayName}`}
                      >
                        <div className="stat-badge-top">
                          <span className="stat-badge-icon"><Clock size={12} /></span>
                          <span className="stat-badge-count">{m.pending}</span>
                        </div>
                        <span className="stat-badge-label">Pending</span>
                      </button>

                      {/* 3. Done */}
                      <button
                        type="button"
                        className="stat-badge-btn badge-pastel-green"
                        onClick={() => {
                          if (onNavigateToTasks) {
                            onNavigateToTasks({ assigneeId: m.uid, status: 'done', view: 'list' });
                          } else {
                            onGoToKanban();
                          }
                        }}
                        title={`View ${m.done} completed tasks assigned to ${m.displayName}`}
                        aria-label={`View ${m.done} completed tasks for ${m.displayName}`}
                      >
                        <div className="stat-badge-top">
                          <span className="stat-badge-icon"><CheckCircle2 size={12} /></span>
                          <span className="stat-badge-count">{m.done}</span>
                        </div>
                        <span className="stat-badge-label">Done</span>
                      </button>

                      {/* 4. Blocked */}
                      <button
                        type="button"
                        className="stat-badge-btn badge-pastel-red"
                        onClick={() => {
                          if (onNavigateToTasks) {
                            onNavigateToTasks({ assigneeId: m.uid, status: 'blocked', view: 'list' });
                          } else {
                            onGoToKanban();
                          }
                        }}
                        title={`View ${m.blocked} blocked tasks assigned to ${m.displayName}`}
                        aria-label={`View ${m.blocked} blocked tasks for ${m.displayName}`}
                      >
                        <div className="stat-badge-top">
                          <span className="stat-badge-icon"><AlertTriangle size={12} /></span>
                          <span className="stat-badge-count">{m.blocked}</span>
                        </div>
                        <span className="stat-badge-label">Blocked</span>
                      </button>
                    </div>

                    {/* Navigation Arrow & 3-Dots Action Menu */}
                    <div className="member-col-actions">
                      <button
                        type="button"
                        className="member-nav-arrow-btn"
                        onClick={() => {
                          if (onNavigateToTasks) {
                            onNavigateToTasks({ assigneeId: m.uid, status: 'all', view: 'list' });
                          } else {
                            onGoToKanban();
                          }
                        }}
                        title={`View tasks for ${m.displayName}`}
                        aria-label={`View tasks for ${m.displayName}`}
                      >
                        <ChevronRight size={14} />
                      </button>

                      <button
                        type="button"
                        className="member-menu-btn"
                        onClick={e => {
                          e.stopPropagation();
                          setActiveMenuMemberId(isMenuOpen ? null : m.uid);
                        }}
                        title="More options"
                        aria-label="More options"
                        aria-expanded={isMenuOpen}
                      >
                        <MoreVertical size={14} />
                      </button>

                      {isMenuOpen && (
                        <div className="member-actions-dropdown" role="menu">
                          <button
                            type="button"
                            className="member-dropdown-item"
                            onClick={() => {
                              setActiveMenuMemberId(null);
                              if (onNavigateToTasks) {
                                onNavigateToTasks({ assigneeId: m.uid, status: 'all', view: 'list' });
                              } else {
                                onGoToKanban();
                              }
                            }}
                          >
                            <ListTodo size={13} style={{ marginRight: 6 }} /> View All Tasks
                          </button>
                          {!m.isCurrentUser && onOpenDirectMessage && (
                            <button
                              type="button"
                              className="member-dropdown-item"
                              onClick={() => {
                                setActiveMenuMemberId(null);
                                onOpenDirectMessage(m.uid);
                              }}
                            >
                              <Mail size={13} style={{ marginRight: 6 }} /> Direct Message
                            </button>
                          )}
                          {canManageTeam && (
                            <button
                              type="button"
                              className="member-dropdown-item"
                              onClick={() => {
                                setActiveMenuMemberId(null);
                                setIsManageTeamOpen(true);
                              }}
                            >
                              <Users size={13} style={{ marginRight: 6 }} /> Manage Team
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>

      <ManageTeamModal
        isOpen={isManageTeamOpen}
        onClose={() => setIsManageTeamOpen(false)}
        project={project}
        currentUser={currentUser || null}
      />

      {onUpdateProject && (
        <ProjectEditModal
          isOpen={isEditProjectOpen}
          onClose={() => setIsEditProjectOpen(false)}
          project={project}
          onUpdateProject={onUpdateProject}
        />
      )}
    </div>
  );
};
