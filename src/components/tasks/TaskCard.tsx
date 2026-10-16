import React from 'react';
import { Task, TaskStatus } from '../../types/task';
import { Badge } from '../common/Badge';
import { isTaskOverdue, formatDisplayDate } from '../../domain/timezone';
import { ALLOWED_TRANSITIONS } from '../../domain/taskStateMachine';

interface TaskCardProps {
  task: Task;
  assigneeName?: string;
  onClick: () => void;
  onQuickMove: (targetStatus: TaskStatus) => void;
  canMutate: boolean;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  assigneeName,
  onClick,
  onQuickMove,
  canMutate,
}) => {
  const isOverdue = isTaskOverdue(task.dueDate, task.status);
  const allowedMoves = ALLOWED_TRANSITIONS[task.status] || [];

  const handleDragStart = (e: React.DragEvent) => {
    if (!canMutate) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      className={`task-card ${isOverdue ? 'task-card-overdue' : ''} ${task.status === 'blocked' ? 'task-card-blocked' : ''}`}
      draggable={canMutate}
      onDragStart={handleDragStart}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick();
        }
      }}
    >
      <div className="task-card-header">
        <Badge type="priority" value={task.priority} />
        {isOverdue && <Badge type="overdue" value="OVERDUE" />}
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
            📅 {formatDisplayDate(task.dueDate)}
          </span>
          {assigneeName && (
            <span className="task-assignee" title={`Assigned to ${assigneeName}`}>
              👤 {assigneeName}
            </span>
          )}
        </div>

        {/* Click-to-Move Menu per DEC-010 */}
        {canMutate && allowedMoves.length > 0 && (
          <div className="task-quick-move" onClick={e => e.stopPropagation()}>
            <select
              className="quick-move-select"
              value=""
              onChange={e => {
                if (e.target.value) {
                  onQuickMove(e.target.value as TaskStatus);
                }
              }}
              title="Quick status change (Click-to-Move)"
              aria-label="Change status"
            >
              <option value="" disabled>Move ▾</option>
              {allowedMoves.map(st => (
                <option key={st} value={st}>
                  ➔ {st.replace('_', ' ').toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
};
