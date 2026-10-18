import React, { useState } from 'react';
import { Task, TaskStatus, TaskPriority, TaskFormData } from '../../types/task';
import { UserProfile } from '../../types/auth';
import { Project } from '../../types/project';
import { TaskCard } from '../../components/tasks/TaskCard';
import { BlockerModal } from '../../components/tasks/BlockerModal';
import { TaskDetailModal } from '../../components/tasks/TaskDetailModal';
import { storageEngine } from '../../services/storageEngine';
import { canUserMoveTask } from '../../domain/taskStateMachine';

interface KanbanBoardProps {
  tasks: Task[];
  canMutate: boolean;
  currentUser: UserProfile | null;
  project?: Project | null;
  onTransitionStatus: (taskId: string, status: TaskStatus, blockerReason?: string) => Promise<unknown>;
  onUpdateTask?: (taskId: string, updates: Partial<TaskFormData>) => Promise<unknown>;
  onDeleteTask: (taskId: string) => Promise<unknown>;
  highlightedTaskId?: string | null;
  onClearHighlight?: () => void;
  onOpenNewTask?: () => void;
  onSwitchToListView?: () => void;
  canCreateProject?: boolean;
  canCreateTask?: boolean;
}

// 5 Columns in exact requested order
const COLUMNS: Array<{ status: TaskStatus; label: string; icon: string }> = [
  { status: 'todo', label: 'To Do', icon: '📝' },
  { status: 'in_progress', label: 'In Progress', icon: '⚙️' },
  { status: 'blocked', label: 'Blocked', icon: '⚠️' },
  { status: 'in_review', label: 'In Review', icon: '👀' },
  { status: 'done', label: 'Done', icon: '✅' },
];

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  tasks,
  canMutate,
  currentUser,
  project,
  onTransitionStatus,
  onUpdateTask,
  onDeleteTask,
  highlightedTaskId,
  onClearHighlight,
  onOpenNewTask,
  onSwitchToListView,
  canCreateProject: propCanCreateProject,
  canCreateTask: propCanCreateTask,
}) => {
  const canCreateProject =
    propCanCreateProject !== undefined
      ? propCanCreateProject
      : (currentUser?.role === 'workspace_admin' || currentUser?.role === 'project_lead');
  const canCreateTask =
    propCanCreateTask !== undefined
      ? propCanCreateTask
      : (currentUser?.role === 'workspace_admin' || currentUser?.role === 'project_lead');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [pendingBlockerTask, setPendingBlockerTask] = useState<Task | null>(null);
  const [activeDragOverCol, setActiveDragOverCol] = useState<TaskStatus | null>(null);

  // Local Filter & Sort Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all');
  const [sortBy, setSortBy] = useState<'due_date' | 'priority' | 'title'>('due_date');
  const [mobileActiveColumn, setMobileActiveColumn] = useState<TaskStatus | 'all'>('all');

  // Auto-scroll and emphasize highlighted task (DEC-013)
  React.useEffect(() => {
    if (!highlightedTaskId) return;

    const scrollTimer = setTimeout(() => {
      const cardElement = document.getElementById(`task-card-${highlightedTaskId}`);
      if (cardElement) {
        cardElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center',
        });
      }
    }, 120);

    const clearTimer = setTimeout(() => {
      if (onClearHighlight) {
        onClearHighlight();
      }
    }, 3400);

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(clearTimer);
    };
  }, [highlightedTaskId, onClearHighlight]);

  const users = storageEngine.getUsers();

  // Summary Metrics (Calculated from project real tasks)
  const totalTasksCount = tasks.length;
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
  const blockedCount = tasks.filter(t => t.status === 'blocked').length;
  const completedCount = tasks.filter(t => t.status === 'done').length;

  // Filter tasks
  const filteredTasks = tasks.filter(task => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = task.title.toLowerCase().includes(q);
      const matchDesc = task.description.toLowerCase().includes(q);
      const matchMilestone = task.milestoneId?.toLowerCase().includes(q) || false;
      if (!matchTitle && !matchDesc && !matchMilestone) return false;
    }
    if (assigneeFilter !== 'all') {
      if (task.assigneeId !== assigneeFilter) return false;
    }
    if (priorityFilter !== 'all') {
      if (task.priority !== priorityFilter) return false;
    }
    return true;
  });

  // Sort tasks
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (sortBy === 'due_date') {
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    }
    if (sortBy === 'priority') {
      const priorityWeights: Record<TaskPriority, number> = {
        urgent: 4,
        high: 3,
        medium: 2,
        low: 1,
      };
      return priorityWeights[b.priority] - priorityWeights[a.priority];
    }
    if (sortBy === 'title') {
      return a.title.localeCompare(b.title);
    }
    return 0;
  });

  const handleDragOver = (e: React.DragEvent, colStatus: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (activeDragOverCol !== colStatus) {
      setActiveDragOverCol(colStatus);
    }
  };

  const handleDragLeave = () => {
    setActiveDragOverCol(null);
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    setActiveDragOverCol(null);
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;

    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === targetStatus) return;

    const moveAuth = canUserMoveTask(task, currentUser, project);
    if (!moveAuth.allowed) return;

    if (targetStatus === 'blocked') {
      setPendingBlockerTask(task);
      return;
    }

    try {
      await onTransitionStatus(task.id, targetStatus);
    } catch {
      // Toast handles error display
    }
  };

  const handleBlockerConfirm = async (reason: string) => {
    if (!pendingBlockerTask) return;
    try {
      await onTransitionStatus(pendingBlockerTask.id, 'blocked', reason);
    } finally {
      setPendingBlockerTask(null);
    }
  };

  const hasActiveFilters = searchQuery.trim() !== '' || assigneeFilter !== 'all' || priorityFilter !== 'all';

  return (
    <div className="kanban-view-root">
      {/* A. Clean Page Heading & Compact Stats Row */}
      <div className="kanban-page-header">
        <div className="kanban-header-left">
          <div className="kanban-title-row">
            <h1 className="kanban-page-title">Kanban Board</h1>
            {project && (
              <span className="kanban-project-tag">
                📁 {project.name}
              </span>
            )}
          </div>
          <p className="kanban-page-subtitle">
            {project?.objective || 'Manage sprint pipeline, resolve blockers, and track delivery progress.'}
          </p>
        </div>

        {/* Compact Statistic Chips */}
        <div className="kanban-stat-chips-group">
          <div className="stat-chip chip-total" title="Total Tasks in this project">
            <span className="stat-chip-label">Total</span>
            <span className="stat-chip-value">{totalTasksCount}</span>
          </div>
          <div className="stat-chip chip-inprogress" title="Tasks currently in progress">
            <span className="stat-chip-label">In Progress</span>
            <span className="stat-chip-value">{inProgressCount}</span>
          </div>
          <div className="stat-chip chip-blocked" title="Tasks blocked by dependencies or impediments">
            <span className="stat-chip-label">Blocked</span>
            <span className="stat-chip-value">{blockedCount}</span>
          </div>
          <div className="stat-chip chip-completed" title="Completed tasks">
            <span className="stat-chip-label">Completed</span>
            <span className="stat-chip-value">{completedCount}</span>
          </div>
        </div>
      </div>

      {/* Toolbar: Filters, Sorting, View Toggle, Add Task */}
      <div className="kanban-toolbar">
        <div className="kanban-toolbar-filters">
          <div className="kanban-search-box">
            <span className="toolbar-search-icon">🔍</span>
            <input
              type="text"
              placeholder="Filter tasks..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="kanban-search-input"
              id="kanban-search-input"
            />
            {searchQuery && (
              <button
                className="kanban-search-clear"
                onClick={() => setSearchQuery('')}
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <select
            className="kanban-filter-select"
            value={assigneeFilter}
            onChange={e => setAssigneeFilter(e.target.value)}
            id="kanban-assignee-filter"
            title="Filter by Assignee"
          >
            <option value="all">All Assignees</option>
            {users.map(u => (
              <option key={u.uid} value={u.uid}>
                {u.displayName}
              </option>
            ))}
          </select>

          <select
            className="kanban-filter-select"
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value as TaskPriority | 'all')}
            id="kanban-priority-filter"
            title="Filter by Priority"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">🔴 Urgent</option>
            <option value="high">🟠 High</option>
            <option value="medium">🟡 Medium</option>
            <option value="low">🟢 Low</option>
          </select>

          <select
            className="kanban-filter-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as 'due_date' | 'priority' | 'title')}
            id="kanban-sort-select"
            title="Sort tasks"
          >
            <option value="due_date">Sort: Due Date</option>
            <option value="priority">Sort: Priority</option>
            <option value="title">Sort: Title</option>
          </select>

          {hasActiveFilters && (
            <button
              className="btn-clear-kanban-filters"
              onClick={() => {
                setSearchQuery('');
                setAssigneeFilter('all');
                setPriorityFilter('all');
              }}
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="kanban-toolbar-actions">
          {/* Board / List View Toggle */}
          <div className="view-mode-toggle-group">
            <button
              type="button"
              className="btn-toggle-view active"
              title="Board View"
            >
              📋 Board
            </button>
            {onSwitchToListView && (
              <button
                type="button"
                className="btn-toggle-view"
                onClick={onSwitchToListView}
                title="Switch to List View"
                id="toggle-to-list-view-btn"
              >
                📑 List
              </button>
            )}
          </div>

          {/* Quick Create Task Trigger */}
          {canMutate && onOpenNewTask && (
            <button
              type="button"
              className="btn-add-task-toolbar"
              onClick={onOpenNewTask}
              id="kanban-toolbar-create-task-btn"
            >
              + New Task
            </button>
          )}
        </div>
      </div>

      {/* B. Board Columns Container */}
      {!project && (
        <div
          className="empty-project-hero"
          style={{
            margin: '20px 24px',
            padding: '40px 24px',
            background: 'var(--surface-primary, #161b22)',
            border: '1px dashed var(--border-default, #30363d)',
            borderRadius: '12px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>📁</div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary, #f0f6fc)', marginBottom: '8px' }}>
            No Projects Yet
          </h2>
          <p style={{ color: 'var(--text-secondary, #8b949e)', maxWidth: '440px', margin: '0 auto 20px', fontSize: '14px', lineHeight: 1.5 }}>
            All seed data has been removed. Create your first project to begin adding tasks, assigning team members, and organizing your sprint board.
          </p>
          {canCreateProject && onOpenNewTask && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onOpenNewTask}
              id="kanban-create-first-project-btn"
              style={{ padding: '8px 20px', fontWeight: 600 }}
            >
              + Create Project
            </button>
          )}
          {!canCreateProject && (
            <p style={{ color: 'var(--text-muted, #8b949e)', fontSize: '13px', margin: '0 auto' }}>
              Members and Viewers cannot create projects. Contact a Workspace Admin or Project Lead to set up a project.
            </p>
          )}
        </div>
      )}

      <div className="kanban-board-container">
        {/* Mobile Column Quick Switcher */}
        <div className="kanban-mobile-tabs" role="tablist" aria-label="Columns">
          <button
            type="button"
            role="tab"
            aria-selected={mobileActiveColumn === 'all'}
            className={`mobile-tab-btn ${mobileActiveColumn === 'all' ? 'active' : ''}`}
            onClick={() => setMobileActiveColumn('all')}
          >
            All Columns ({sortedTasks.length})
          </button>
          {COLUMNS.map(c => {
            const count = sortedTasks.filter(t =>
              c.status === 'todo' ? (t.status === 'todo' || t.status === 'backlog') : t.status === c.status
            ).length;
            return (
              <button
                key={c.status}
                type="button"
                role="tab"
                aria-selected={mobileActiveColumn === c.status}
                className={`mobile-tab-btn ${mobileActiveColumn === c.status ? 'active' : ''}`}
                onClick={() => setMobileActiveColumn(c.status)}
              >
                {c.icon} {c.label} ({count})
              </button>
            );
          })}
        </div>

        <div className={`kanban-grid ${mobileActiveColumn !== 'all' ? 'has-single-active-column' : ''}`}>
          {COLUMNS.map(col => {
            // In To Do column, show both 'todo' and legacy/seeded 'backlog' tasks so none are hidden
            const colTasks = sortedTasks.filter(t => {
              if (col.status === 'todo') {
                return t.status === 'todo' || t.status === 'backlog';
              }
              return t.status === col.status;
            });
            const isDragOver = activeDragOverCol === col.status;
            const isMobileHidden = mobileActiveColumn !== 'all' && mobileActiveColumn !== col.status;

            return (
              <div
                key={col.status}
                className={`kanban-column ${isDragOver ? 'kanban-column-dragover' : ''} col-${col.status} ${isMobileHidden ? 'kanban-col-mobile-hidden' : ''}`}
                onDragOver={e => handleDragOver(e, col.status)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, col.status)}
              >
                {/* Column Header */}
                <div className="kanban-column-header">
                  <div className="column-title-group">
                    <span className="column-icon">{col.icon}</span>
                    <h3 className="column-name">{col.label}</h3>
                    <span className="column-count-badge">{colTasks.length}</span>
                  </div>
                  {canCreateTask && onOpenNewTask && (
                    <button
                      type="button"
                      className="btn-col-add-task"
                      onClick={onOpenNewTask}
                      title={`Add task to ${col.label}`}
                    >
                      +
                    </button>
                  )}
                </div>

                {/* Vertically Stacked Cards List */}
                <div className="kanban-cards-list">
                  {colTasks.map(task => {
                    const assignee = users.find(u => u.uid === task.assigneeId);
                    const moveAuth = canUserMoveTask(task, currentUser, project);
                    const canMove = canMutate && moveAuth.allowed;

                    return (
                      <TaskCard
                        key={task.id}
                        task={task}
                        assigneeName={assignee?.displayName}
                        onClick={() => {
                          setSelectedTask(task);
                          setIsDetailOpen(true);
                        }}
                        canMutate={canMutate}
                        canMove={canMove}
                        lockReason={moveAuth.reason}
                        isHighlighted={task.id === highlightedTaskId}
                      />
                    );
                  })}

                  {colTasks.length === 0 && (
                    <div className="kanban-empty-dropzone">
                      <span>No tasks in {col.label}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Task Detail Modal */}
      <TaskDetailModal
        task={selectedTask}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedTask(null);
        }}
        currentUser={currentUser}
        project={project}
        onDeleteTask={onDeleteTask}
        onUpdateTask={onUpdateTask}
        canMutate={canMutate}
      />

      {/* Mandatory Blocker Reason Modal */}
      <BlockerModal
        isOpen={!!pendingBlockerTask}
        onClose={() => setPendingBlockerTask(null)}
        onConfirm={handleBlockerConfirm}
        taskTitle={pendingBlockerTask?.title || ''}
      />
    </div>
  );
};
