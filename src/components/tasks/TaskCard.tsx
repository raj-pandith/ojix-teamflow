import React from 'react';
import { Task, TaskStatus } from '../../types/task';
import { Badge } from '../common/Badge';
import { isTaskOverdue, formatDisplayDate } from '../../domain/timezone';

interface TaskCardProps {
  task: Task;
  assigneeName?: string;
  onClick: () => void;
  onQuickMove?: (targetStatus: TaskStatus) => void;
  canMutate: boolean;
  canMove: boolean;
  lockReason?: string;
  isHighlighted?: boolean;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  assigneeName,
  onClick,
  canMutate,
  canMove,
  lockReason,
  isHighlighted = false,
}) => {
  const isOverdue = isTaskOverdue(task.dueDate, task.status);

  const handleDragStart = (e: React.DragEvent) => {
    if (!canMutate || !canMove) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const getInitials = (name?: string) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map(part => part.charAt(0))
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <div
      id={`task-card-${task.id}`}
      data-task-id={task.id}
      className={`task-card ${isOverdue ? 'task-card-overdue' : ''} ${task.status === 'blocked' ? 'task-card-blocked' : ''} ${!canMove ? 'task-card-locked' : ''} ${isHighlighted ? 'task-card-highlighted' : ''}`}
      draggable={canMutate && canMove}
      onDragStart={handleDragStart}
      onClick={onClick}
      role="button"
      tabIndex={0}
      title={!canMove && lockReason ? lockReason : undefined}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick();
        }
      }}
    >
      {/* 1. Task Title */}
      <h4 className="task-card-title">{task.title}</h4>

      {/* 2. Priority Badge, 3. Category/Milestone, 7. Overdue/Restricted Indicator */}
      <div className="task-card-badges-row">
        <Badge type="priority" value={task.priority} />
        {task.milestoneId && (
          <span className="task-category-pill">{task.milestoneId}</span>
        )}
        {isOverdue && <Badge type="overdue" value="OVERDUE" />}
        {!canMove && (
          <span
            className="task-lock-indicator"
            title={lockReason || 'Locked: Only the assigned member or Project Lead can move this task'}
          >
            🔒
          </span>
        )}
      </div>

      {/* 6. Optional Blocker Information */}
      {task.status === 'blocked' && task.blockerReason && (
        <div className="task-blocker-banner">
          <span className="blocker-icon">⚠️</span>
          <span className="blocker-text">{task.blockerReason}</span>
        </div>
      )}

      {/* 4. Due Date & 5. Assignee Avatar and Name */}
      <div className="task-card-footer">
        <div className="task-due-date" title={`Due Date: ${task.dueDate}`}>
          <span className="due-date-icon">📅</span>
          <span>{formatDisplayDate(task.dueDate)}</span>
        </div>

        {assigneeName ? (
          <div className="task-assignee-chip" title={`Assigned to ${assigneeName}`}>
            <span className="assignee-avatar-sm">{getInitials(assigneeName)}</span>
            <span className="assignee-name-sm">{assigneeName}</span>
          </div>
        ) : (
          <span className="task-unassigned-chip">Unassigned</span>
        )}
      </div>
    </div>
  );
};
