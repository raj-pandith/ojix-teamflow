import React, { useState, useEffect, useMemo } from 'react';
import { Task, TaskStatus, TaskPriority, TaskFilterOptions, TaskFormData } from '../../types/task';
import { UserProfile } from '../../types/auth';
import { Project } from '../../types/project';
import { Badge } from '../../components/common/Badge';
import { Pagination } from '../../components/common/Pagination';
import { TaskDetailModal } from '../../components/tasks/TaskDetailModal';
import { BlockerModal } from '../../components/tasks/BlockerModal';
import { storageEngine } from '../../services/storageEngine';
import { isTaskOverdue, formatDisplayDate } from '../../domain/timezone';
import { ALLOWED_TRANSITIONS, canUserMoveTask } from '../../domain/taskStateMachine';
import { Search, X, AlertTriangle, ArrowRight, FolderOpen, User, RotateCcw, FilterX } from 'lucide-react';

interface GroupedListViewProps {
  tasks: Task[];
  filters: TaskFilterOptions;
  onFilterChange: (filters: TaskFilterOptions) => void;
  canMutate: boolean;
  currentUser: UserProfile | null;
  project?: Project | null;
  onTransitionStatus: (taskId: string, status: TaskStatus, blockerReason?: string) => Promise<unknown>;
  onUpdateTask?: (taskId: string, updates: Partial<TaskFormData>) => Promise<unknown>;
  onDeleteTask: (taskId: string) => Promise<unknown>;
}

export const GroupedListView: React.FC<GroupedListViewProps> = ({
  tasks,
  filters,
  onFilterChange,
  canMutate,
  currentUser,
  project,
  onTransitionStatus,
  onUpdateTask,
  onDeleteTask,
}) => {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [pendingBlockerTask, setPendingBlockerTask] = useState<Task | null>(null);

  const [users, setUsers] = useState<UserProfile[]>(() => storageEngine.getUsers());

  // Pagination states
  const [taskPage, setTaskPage] = useState(1);
  const [taskPageSize, setTaskPageSize] = useState(10);

  // Reset page when filters change
  useEffect(() => {
    setTaskPage(1);
  }, [filters]);

  const paginatedTasks = useMemo(() => {
    const startIndex = (taskPage - 1) * taskPageSize;
    return tasks.slice(startIndex, startIndex + taskPageSize);
  }, [tasks, taskPage, taskPageSize]);

  useEffect(() => {
    setUsers(storageEngine.getUsers());
    return storageEngine.subscribe(() => {
      setUsers(storageEngine.getUsers());
    });
  }, []);

  const handleStatusChange = async (task: Task, targetStatus: TaskStatus) => {
    if (targetStatus === 'blocked') {
      setPendingBlockerTask(task);
      return;
    }
    await onTransitionStatus(task.id, targetStatus);
  };

  const handleBlockerConfirm = async (reason: string) => {
    if (!pendingBlockerTask) return;
    try {
      await onTransitionStatus(pendingBlockerTask.id, 'blocked', reason);
    } finally {
      setPendingBlockerTask(null);
    }
  };

  const hasActiveFilters = Boolean(
    filters.searchQuery ||
    (filters.status && filters.status !== 'all') ||
    (filters.priority && filters.priority !== 'all') ||
    (filters.dueDateRange && filters.dueDateRange !== 'all') ||
    (filters.assigneeId && filters.assigneeId !== 'all')
  );

  const handleResetFilters = () => {
    onFilterChange({
      searchQuery: '',
      status: 'all',
      priority: 'all',
      assigneeId: 'all',
      dueDateRange: 'all',
    });
  };

  return (
    <div className="grouped-list-view">
      {/* Universal Multi-Filter & Search Bar */}
      <div className="filter-bar">
        <div className="search-input-wrapper">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search tasks by title or keywords..."
            value={filters.searchQuery || ''}
            onChange={e => onFilterChange({ ...filters, searchQuery: e.target.value })}
            id="task-search-input"
          />
          {filters.searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => onFilterChange({ ...filters, searchQuery: '' })}
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="filter-selects-row">
          <select
            className={`filter-select ${filters.status && filters.status !== 'all' ? 'is-active-filter' : ''}`}
            value={filters.status || 'all'}
            onChange={e => onFilterChange({ ...filters, status: e.target.value as TaskStatus | 'all' | 'pending' })}
            id="filter-status-select"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending (Active)</option>
            <option value="backlog">Backlog</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="in_review">In Review</option>
            <option value="blocked">Blocked</option>
            <option value="done">Done</option>
          </select>

          <select
            className={`filter-select ${filters.priority && filters.priority !== 'all' ? 'is-active-filter' : ''}`}
            value={filters.priority || 'all'}
            onChange={e => onFilterChange({ ...filters, priority: e.target.value as TaskPriority | 'all' })}
            id="filter-priority-select"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select
            className={`filter-select ${filters.dueDateRange && filters.dueDateRange !== 'all' ? 'is-active-filter' : ''}`}
            value={filters.dueDateRange || 'all'}
            onChange={e => onFilterChange({ ...filters, dueDateRange: e.target.value as TaskFilterOptions['dueDateRange'] })}
            id="filter-duedate-select"
          >
            <option value="all">All Due Dates</option>
            <option value="overdue">Overdue Only</option>
            <option value="today">Due Today</option>
            <option value="this_week">Due This Week</option>
          </select>

          <select
            className={`filter-select ${filters.assigneeId && filters.assigneeId !== 'all' ? 'is-active-filter' : ''}`}
            value={filters.assigneeId || 'all'}
            onChange={e => onFilterChange({ ...filters, assigneeId: e.target.value })}
            id="filter-assignee-select"
          >
            <option value="all">All Assignees</option>
            <option value="unassigned">Unassigned Only</option>
            {users.filter(u => u.role !== 'viewer').map(u => (
              <option key={u.uid} value={u.uid}>
                {u.displayName}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              className="btn-clear-all-filters"
              onClick={handleResetFilters}
            >
              <RotateCcw size={12} />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Structured Tasks Table */}
      <div className="table-container">
        <table className="tasks-table">
          <thead>
            <tr>
              <th style={{ width: '15%' }}>Status</th>
              <th style={{ width: '38%' }}>Task Title</th>
              <th style={{ width: '12%' }}>Priority</th>
              <th style={{ width: '13%' }}>Due Date</th>
              <th style={{ width: '14%' }}>Assignee</th>
              <th style={{ width: '8%', textAlign: 'right' }} className="th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedTasks.map(task => {
              const assignee = users.find(u => u.uid === task.assigneeId);
              const isOverdue = isTaskOverdue(task.dueDate, task.status);
              const allowedMoves = ALLOWED_TRANSITIONS[task.status] || [];
              const moveAuth = canUserMoveTask(task, currentUser, project);
              const canMove = canMutate && moveAuth.allowed;

              return (
                <tr
                  key={task.id}
                  className={`task-row ${isOverdue ? 'row-overdue' : ''} ${task.status === 'blocked' ? 'row-blocked' : ''}`}
                  onClick={() => {
                    setSelectedTask(task);
                    setIsDetailOpen(true);
                  }}
                >
                  <td className="td-status" onClick={e => e.stopPropagation()}>
                    {canMove && allowedMoves.length > 0 ? (
                      <select
                        className="status-dropdown-cell"
                        value={task.status}
                        onChange={e => handleStatusChange(task, e.target.value as TaskStatus)}
                        title="Click to advance status"
                      >
                        <option value={task.status}>
                          {task.status.replace('_', ' ').toUpperCase()}
                        </option>
                        {allowedMoves.map(st => (
                          <option key={st} value={st}>
                            ➔ {st.replace('_', ' ').toUpperCase()}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Badge type="status" value={task.status} />
                    )}
                  </td>

                  <td className="td-title">
                    <span className="row-task-title">{task.title}</span>
                    {task.status === 'blocked' && task.blockerReason && (
                      <span className="row-blocker-tag" title={task.blockerReason} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <AlertTriangle size={12} />
                        <span>{task.blockerReason}</span>
                      </span>
                    )}
                  </td>

                  <td className="td-priority">
                    <Badge type="priority" value={task.priority} />
                  </td>

                  <td className="td-date">
                    <span className={`date-val ${isOverdue ? 'text-overdue' : ''}`}>
                      {formatDisplayDate(task.dueDate)}
                    </span>
                    {isOverdue && <span className="overdue-dot" title="Overdue!" />}
                  </td>

                  <td className="td-assignee">
                    {assignee ? (
                      <span className="assignee-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <User size={12} />
                        <span>{assignee.displayName}</span>
                      </span>
                    ) : (
                      <span className="unassigned-text">Unassigned</span>
                    )}
                  </td>

                  <td className="td-actions" onClick={e => e.stopPropagation()}>
                    <button
                      className="btn-view-details"
                      onClick={() => {
                        setSelectedTask(task);
                        setIsDetailOpen(true);
                      }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <span>Inspect</span>
                      <ArrowRight size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}

            {tasks.length === 0 && (
              <tr>
                <td colSpan={6} className="td-empty-table">
                  <div className="empty-table-state">
                    <div className="empty-table-icon-circle">
                      {hasActiveFilters ? (
                        <FilterX size={26} style={{ color: 'var(--accent-primary, #C9662F)' }} />
                      ) : (
                        <FolderOpen size={26} style={{ color: 'var(--accent-primary, #C9662F)' }} />
                      )}
                    </div>
                    <h4 className="empty-title">
                      {hasActiveFilters ? 'No tasks matching current filter' : 'No tasks in this project yet'}
                    </h4>
                    <p className="empty-subtitle">
                      {hasActiveFilters
                        ? 'Try adjusting your search criteria or resetting filters to view all project deliverables.'
                        : 'Get started by creating your first task to track milestones and deliverables.'}
                    </p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        className="empty-action-btn"
                        onClick={handleResetFilters}
                      >
                        <RotateCcw size={13} />
                        <span>Reset Filters</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {tasks.length > 0 && (
          <Pagination
            currentPage={taskPage}
            totalItems={tasks.length}
            pageSize={taskPageSize}
            onPageChange={setTaskPage}
            pageSizeOptions={[10, 20, 50]}
            onPageSizeChange={size => {
              setTaskPageSize(size);
              setTaskPage(1);
            }}
            itemLabel="tasks"
          />
        )}
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
