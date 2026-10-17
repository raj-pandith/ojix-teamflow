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
      <div className="task-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Badge type="priority" value={task.priority} />
          {!canMove && (
            <span
              className="task-lock-indicator"
              title={lockReason || 'Locked: Only the assigned member or Project Lead can move this task'}
              style={{ fontSize: '11px', opacity: 0.65 }}
            >
              🔒
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isOverdue && <Badge type="overdue" value="OVERDUE" />}
        </div>
      </div>

      <h3 className="task-card-title">{task.title}</h3>

      {task.status === 'blocked' && task.blockerReason && (
        <div className="task-blocker-banner">
          <span className="blocker-icon">⚠️</span>
          <span className="blocker-text">{task.blockerReason}</span>
        </div>
      )}

      <div className="task-card-footer">
        <div className="task-meta-left">
          <span className="task-due-date" title={`Due Date: ${task.dueDate}`}>
            Due {formatDisplayDate(task.dueDate)}
          </span>
          {assigneeName && (
            <span className="task-assignee" title={`Assigned to ${assigneeName}`}>
              {assigneeName}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
