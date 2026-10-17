import React, { useState, useEffect } from 'react';
import { Task, TaskFormData } from '../../types/task';
import { Project } from '../../types/project';
import { UserProfile } from '../../types/auth';
import { ActivityLogEntry } from '../../types/audit';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { TaskUpdateModal } from './TaskUpdateModal';
import { auditService } from '../../services/auditService';
import { storageEngine } from '../../services/storageEngine';
import { formatDisplayDate } from '../../domain/timezone';

interface TaskDetailModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  project?: Project | null;
  onDeleteTask: (taskId: string) => void;
  onUpdateTask?: (taskId: string, updates: Partial<TaskFormData>) => Promise<unknown>;
  canMutate: boolean;
  zIndex?: number;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  task,
  isOpen,
  onClose,
  currentUser,
  project,
  onDeleteTask,
  onUpdateTask,
  canMutate,
  zIndex = 1200,
}) => {
  const [currentTask, setCurrentTask] = useState<Task | null>(task);
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>(() => storageEngine.getUsers());

  useEffect(() => {
    setCurrentTask(task);
  }, [task]);

  useEffect(() => {
    setUsers(storageEngine.getUsers());
    return storageEngine.subscribe(() => {
      setUsers(storageEngine.getUsers());
    });
  }, [isOpen]);

  useEffect(() => {
    if (!currentTask || !currentUser) {
      setLogs([]);
      return;
    }

    const refreshState = () => {
      const fresh = storageEngine.getTaskById(currentTask.id, currentUser);
      if (fresh) setCurrentTask(fresh);
      setUsers(storageEngine.getUsers());
    };

    const unsubscribeAudit = auditService.subscribe(currentTask.id, currentUser, entries => {
      setLogs(entries);
    });
    const unsubscribeStorage = storageEngine.subscribe(refreshState);

    return () => {
      unsubscribeAudit();
      unsubscribeStorage();
    };
  }, [currentTask?.id, currentUser]);

  const activeTask = currentTask || task;
  if (!activeTask) return null;

  const assignee = users.find(u => u.uid === activeTask.assigneeId);

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !currentUser) return;
    setSubmittingComment(true);
    try {
      await auditService.addComment(activeTask.id, activeTask.projectId, newComment, currentUser);
      setNewComment('');
    } finally {
      setSubmittingComment(false);
    }
  };

  // Only Workspace Admin and Project Lead can delete or update tasks
  const canDelete = currentUser?.role === 'workspace_admin' || currentUser?.role === 'project_lead';
  const canUpdate = currentUser?.role === 'workspace_admin' || currentUser?.role === 'project_lead';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={activeTask.title} maxWidth="720px" zIndex={zIndex}>
      <div className="task-detail-container">
        {/* Top Badges & Meta */}
        <div className="task-detail-meta-row">
          <div className="meta-item">
            <span className="meta-label">Status</span>
            <Badge type="status" value={activeTask.status} />
          </div>
          <div className="meta-item">
            <span className="meta-label">Priority</span>
            <Badge type="priority" value={activeTask.priority} />
          </div>
          <div className="meta-item">
            <span className="meta-label">Due Date</span>
            <span className="meta-value">{formatDisplayDate(activeTask.dueDate)}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Assignee</span>
            <span className="meta-value">{assignee?.displayName || 'Unassigned'}</span>
          </div>
        </div>

        {/* Blocker Notice if Blocked */}
        {activeTask.status === 'blocked' && activeTask.blockerReason && (
          <div className="task-blocker-banner">
            <span className="blocker-icon">⚠️</span>
            <div className="blocker-details">
              <strong>Blocker:</strong> {activeTask.blockerReason}
            </div>
          </div>
        )}

        {/* Description */}
        <div className="task-detail-section">
          <h4 className="section-heading">Description</h4>
          <p className="task-description-body">
            {activeTask.description || 'No description provided.'}
          </p>
        </div>

        {/* Activity & Comments Timeline */}
        <div className="task-detail-section">
          <h4 className="section-heading">Activity & Comments ({logs.length})</h4>

          {/* Comment Input */}
          {canMutate && (
            <form onSubmit={handlePostComment} className="comment-form">
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="Write an update or comment..."
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
                  Post Comment
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
                    <span className="timeline-user">👤 {log.userDisplayName}</span>
                    <span className={`timeline-action-badge action-badge-${log.action}`}>
                      {log.action.replace('_', ' ')}
                    </span>
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
          {canDelete && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this task?')) {
                  onDeleteTask(activeTask.id);
                  onClose();
                }
              }}
              id="delete-task-modal-btn"
            >
              Delete Task
            </Button>
          )}
          {canUpdate && onUpdateTask && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsUpdateOpen(true)}
              id="footer-update-task-btn"
            >
              ✏️ Update Task
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {/* Admin & Project Lead Task Update Modal */}
      {canUpdate && onUpdateTask && activeTask && (
        <TaskUpdateModal
          isOpen={isUpdateOpen}
          onClose={() => setIsUpdateOpen(false)}
          task={activeTask}
          project={project}
          currentUser={currentUser}
          onUpdateTask={onUpdateTask}
          onOpenDetail={updated => {
            setCurrentTask(updated);
            setIsUpdateOpen(false);
          }}
        />
      )}
    </Modal>
  );
};
