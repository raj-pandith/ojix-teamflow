import React from 'react';
import { Task, TaskStatus } from '../../types/task';
import { Badge } from '../common/Badge';
import { isTaskOverdue, formatDisplayDate } from '../../domain/timezone';
import { Calendar, AlertCircle, AlertTriangle } from 'lucide-react';

interface TaskCardProps {
  task: Task;
  assigneeName?: string;
  onClick: () => void;
  onQuickMove?: (targetStatus: TaskStatus) => void;
  canMutate: boolean;
  canMove: boolean;
  lockReason?: string;
  isHighlighted?: boolean;
  isMyTask?: boolean;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  assigneeName,
  onClick,
  canMutate,
  canMove,
  lockReason,
  isHighlighted = false,
  isMyTask = false,
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
      data-my-task={isMyTask ? 'true' : 'false'}
      className={`task-card ${isOverdue ? 'task-card-overdue' : ''} ${task.status === 'blocked' ? 'task-card-blocked' : ''} ${!canMove ? 'task-card-locked' : ''} ${isHighlighted ? 'task-card-highlighted' : ''} ${isMyTask ? 'task-card-my-task' : ''}`}
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

      {/* 2. Priority Badge, 3. Category/Milestone, My Task indicator, Overdue */}
      <div className="task-card-badges-row">
        <Badge type="priority" value={task.priority} />
        {task.milestoneId && (
          <span className="task-category-pill">{task.milestoneId}</span>
        )}
        {isMyTask && (
          <span className="task-my-task-badge" title="Assigned to you">
            My Task
          </span>
        )}
        {isOverdue && <Badge type="overdue" value="OVERDUE" />}
      </div>

      {/* 6. Optional Blocker Information */}
      {task.status === 'blocked' && task.blockerReason && (
        <div className="task-blocker-banner">
          <AlertTriangle size={12} className="blocker-icon" style={{ flexShrink: 0 }} />
          <span className="blocker-text">{task.blockerReason}</span>
        </div>
      )}

      {/* 4. Due Date & 5. Assignee Avatar and Name */}
      <div className="task-card-footer">
        <div
          className={`task-due-date ${isOverdue ? 'due-date-overdue' : ''}`}
          title={`Due Date: ${task.dueDate}${isOverdue ? ' (Overdue)' : ''}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          {isOverdue ? <AlertCircle size={12} /> : <Calendar size={12} />}
          <span>{formatDisplayDate(task.dueDate)}</span>
        </div>

        {assigneeName ? (
          <div
            className={`task-assignee-chip ${isMyTask ? 'task-assignee-chip-mine' : ''}`}
            title={`Assigned to ${assigneeName}${isMyTask ? ' (You)' : ''}`}
          >
            <span className="assignee-avatar-sm">{getInitials(assigneeName)}</span>
            <span className="assignee-name-sm">{assigneeName}{isMyTask ? ' (You)' : ''}</span>
          </div>
        ) : (
          <span className="task-unassigned-chip">Unassigned</span>
        )}
      </div>
    </div>
  );
};
