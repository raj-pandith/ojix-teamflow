import React, { useState, useEffect } from 'react';
import { Task } from '../../types/task';
import { UserProfile } from '../../types/auth';
import { ActivityLogEntry } from '../../types/audit';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { auditService } from '../../services/auditService';
import { storageEngine } from '../../services/storageEngine';
import { formatDisplayDate } from '../../domain/timezone';

interface TaskDetailModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onDeleteTask: (taskId: string) => void;
  onUpdateTask?: (taskId: string, updates: { assigneeId: string | null }) => Promise<unknown>;
  canMutate: boolean;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  task,
  isOpen,
  onClose,
  currentUser,
  onDeleteTask,
  onUpdateTask,
  canMutate,
}) => {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>(() => storageEngine.getUsers());

  useEffect(() => {
    setUsers(storageEngine.getUsers());
    return storageEngine.subscribe(() => {
      setUsers(storageEngine.getUsers());
    });
  }, [isOpen]);

  useEffect(() => {
    if (!task || !currentUser) {
      setLogs([]);
      return;
    }
    const unsubscribe = auditService.subscribe(task.id, currentUser, entries => {
      setLogs(entries);
    });
    return () => unsubscribe();
  }, [task, currentUser]);

  if (!task) return null;

  const assignableUsers = users.filter(u => u.role !== 'viewer');
  const assignee = users.find(u => u.uid === task.assigneeId);

  const handleReassign = async (newAssigneeId: string) => {
    if (!onUpdateTask || !task) return;
    if (newAssigneeId && task.projectId) {
      storageEngine.addMemberToProject(task.projectId, newAssigneeId);
    }
    await onUpdateTask(task.id, { assigneeId: newAssigneeId || null });
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !currentUser) return;
    setSubmittingComment(true);
    try {
      await auditService.addComment(task.id, task.projectId, newComment, currentUser);
      setNewComment('');
    } finally {
      setSubmittingComment(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={task.title} maxWidth="720px">
      <div className="task-detail-container">
        {/* Top Badges & Meta */}
        <div className="task-detail-meta-row">
          <div className="meta-item">
            <span className="meta-label">Status</span>
            <Badge type="status" value={task.status} />
          </div>
          <div className="meta-item">
            <span className="meta-label">Priority</span>
            <Badge type="priority" value={task.priority} />
          </div>
          <div className="meta-item">
            <span className="meta-label">Due Date</span>
            <span className="meta-value">📅 {formatDisplayDate(task.dueDate)}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Assignee</span>
            {canMutate && onUpdateTask ? (
              <select
                className="task-assignee-select"
                value={task.assigneeId || ''}
                onChange={e => handleReassign(e.target.value)}
                id="task-detail-assignee-select"
                style={{
                  background: 'var(--color-surface)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '4px 8px',
                  fontSize: 'var(--text-xs)',
                  cursor: 'pointer',
                }}
              >
                <option value="">👤 Unassigned</option>
                {assignableUsers.map(u => (
                  <option key={u.uid} value={u.uid}>
                    👤 {u.displayName} ({u.role.replace('_', ' ')})
                  </option>
                ))}
              </select>
            ) : (
              <span className="meta-value">👤 {assignee?.displayName || 'Unassigned'}</span>
            )}
          </div>
        </div>

        {/* Blocker Notice if Blocked */}
        {task.status === 'blocked' && task.blockerReason && (
          <div className="task-blocker-banner">
            <span className="blocker-icon">⚠️</span>
            <div className="blocker-details">
              <strong>Blocker:</strong> {task.blockerReason}
            </div>
          </div>
        )}

        {/* Description */}
        <div className="task-detail-section">
          <h4 className="section-heading">Description</h4>
          <p className="task-description-body">
            {task.description || 'No description provided.'}
          </p>
        </div>

        {/* Activity & Comments Timeline */}
        <div className="task-detail-section">
          <h4 className="section-heading">Activity & Discussion Notes ({logs.length})</h4>

          {/* Comment Input */}
          {canMutate && (
            <form onSubmit={handlePostComment} className="comment-form">
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="Post a progress note or team comment..."
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                id="task-comment-input"
              />
              <div className="comment-form-actions">
                <Button
                  type="submit"
                  size="sm"
                  variant="primary"
                  isLoading={submittingComment}
                  disabled={!newComment.trim()}
                  id="submit-comment-btn"
                >
                  Post Note
                </Button>
              </div>
            </form>
          )}

          {/* Timeline Entries */}
          <div className="activity-timeline">
            {logs.map(log => (
              <div key={log.id} className="timeline-item">
                <div className="timeline-marker" />
                <div className="timeline-content">
                  <div className="timeline-header">
                    <span className="timeline-user">{log.userDisplayName}</span>
                    <span className="timeline-time">
                      {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {formatDisplayDate(log.createdAt.slice(0, 10))}
                    </span>
                  </div>
                  {log.commentText && (
                    <div className="timeline-text">{log.commentText}</div>
                  )}
                  {log.fieldChanged && (
                    <div className="timeline-field-diff">
                      Changed <span className="diff-field">{log.fieldChanged}</span> from{' '}
                      <span className="diff-old">{log.oldValue || 'none'}</span> ➔{' '}
                      <span className="diff-new">{log.newValue}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {logs.length === 0 && (
              <div className="empty-timeline-note">No comments or activity logged yet.</div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="modal-actions task-detail-footer">
          {canMutate && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this task?')) {
                  onDeleteTask(task.id);
                  onClose();
                }
              }}
            >
              Delete Task
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};
