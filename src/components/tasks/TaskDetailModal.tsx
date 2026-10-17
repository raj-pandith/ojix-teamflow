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
import { isUserEligibleForAssignment } from '../../domain/validation';
import { getMentionSuggestions } from '../../domain/mentionParser';

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
  highlightCommentId?: string | null;
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
  highlightCommentId,
}) => {
  const [currentTask, setCurrentTask] = useState<Task | null>(task);
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>(() => storageEngine.getUsers());
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const highlightedRef = React.useRef<HTMLDivElement>(null);

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
  const isAssigneeIneligible = Boolean(assignee && project && !isUserEligibleForAssignment(assignee, project));

  const suggestions = React.useMemo(() => {
    if (!showMentionSuggestions || mentionQuery === null || !currentUser) return [];
    return getMentionSuggestions(mentionQuery, users, project, currentUser);
  }, [showMentionSuggestions, mentionQuery, users, project, currentUser]);

  useEffect(() => {
    if (highlightCommentId && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightCommentId, logs]);

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNewComment(val);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const match = textBeforeCursor.match(/@([a-zA-Z0-9._-]*)$/);

    if (match) {
      setMentionQuery(match[1]);
      setShowMentionSuggestions(true);
    } else {
      setShowMentionSuggestions(false);
      setMentionQuery(null);
    }
  };

  const handleSelectMention = (sUser: UserProfile) => {
    if (!textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart;
    const textBeforeCursor = newComment.slice(0, cursorPos);
    const textAfterCursor = newComment.slice(cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    if (atIndex !== -1) {
      const localPart = sUser.email.split('@')[0];
      const inserted = `@${localPart} `;
      const updated = textBeforeCursor.slice(0, atIndex) + inserted + textAfterCursor;
      setNewComment(updated);
      setShowMentionSuggestions(false);
      setMentionQuery(null);
      setTimeout(() => {
        if (textareaRef.current) {
          const newPos = atIndex + inserted.length;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newPos, newPos);
        }
      }, 0);
    }
  };

  const renderCommentWithMentions = (text: string) => {
    const parts = text.split(/(@[a-zA-Z0-9._-]+(?:@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)?)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return (
          <span
            key={i}
            className="comment-mention-pill"
            style={{
              display: 'inline-block',
              background: 'rgba(99, 102, 241, 0.2)',
              color: 'var(--accent-primary-light, #818cf8)',
              fontWeight: 600,
              padding: '1px 6px',
              borderRadius: '4px',
              margin: '0 2px',
            }}
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !currentUser) return;
    setSubmittingComment(true);
    try {
      await auditService.addComment(activeTask.id, activeTask.projectId, newComment, currentUser);
      setNewComment('');
      setShowMentionSuggestions(false);
      setMentionQuery(null);
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
            <span className="meta-value">
              {assignee?.displayName || 'Unassigned'}
              {isAssigneeIneligible && assignee && (
                <span
                  style={{
                    display: 'inline-block',
                    marginLeft: '6px',
                    fontSize: '11px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: 'var(--status-blocked, #ef4444)',
                    fontWeight: 600,
                  }}
                  title="This user is ineligible to receive task assignments under the project role policy."
                >
                  ⚠️ Ineligible ({assignee.role.replace('_', ' ')})
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Reassignment Prompt if Ineligible */}
        {isAssigneeIneligible && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '6px',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              marginBottom: '16px',
            }}
          >
            <div>
              <strong>Reassignment Recommended:</strong> Current assignee (<strong>{assignee?.displayName}</strong>) is no longer eligible to hold tasks in this project.
            </div>
            {canUpdate && (
              <Button size="sm" variant="secondary" onClick={() => setIsUpdateOpen(true)}>
                Reassign Task
              </Button>
            )}
          </div>
        )}

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
            <div className="comment-input-wrapper" style={{ position: 'relative' }}>
              <form onSubmit={handlePostComment} className="comment-form">
                <textarea
                  ref={textareaRef}
                  className="form-textarea"
                  rows={2}
                  placeholder="Write an update or comment (type @ to mention a team member)..."
                  value={newComment}
                  onChange={handleCommentChange}
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      setShowMentionSuggestions(false);
                    }
                  }}
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

              {/* Autocomplete Dropdown */}
              {showMentionSuggestions && suggestions.length > 0 && (
                <div
                  className="mention-autocomplete-dropdown"
                  id="mention-suggestions-list"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 1300,
                    background: 'var(--surface-overlay, #1e2430)',
                    border: '1px solid var(--border-default, #30363d)',
                    borderRadius: '8px',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                    maxHeight: '220px',
                    overflowY: 'auto',
                    padding: '6px',
                    marginTop: '4px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      color: 'var(--text-muted, #8b949e)',
                      padding: '4px 8px',
                      fontWeight: 600,
                    }}
                  >
                    Mention a team member:
                  </div>
                  {suggestions.map(sUser => {
                    const localPart = sUser.email.split('@')[0];
                    return (
                      <button
                        key={sUser.uid}
                        type="button"
                        className="mention-suggestion-item"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          width: '100%',
                          padding: '8px 10px',
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--text-primary, #f0f6fc)',
                          cursor: 'pointer',
                          borderRadius: '6px',
                          textAlign: 'left',
                          fontSize: '13px',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                        onClick={() => handleSelectMention(sUser)}
                      >
                        <span style={{ fontWeight: 600 }}>{sUser.displayName}</span>
                        <span style={{ color: 'var(--accent-primary-light, #818cf8)', fontSize: '12px' }}>
                          @{localPart}
                        </span>
                        <span style={{ color: 'var(--text-muted, #8b949e)', fontSize: '11px', marginLeft: 'auto' }}>
                          ({sUser.role.replace('_', ' ')})
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Timeline Entries */}
          <div className="activity-timeline">
            {logs.map(log => {
              const isHighlighted = highlightCommentId === log.id;
              return (
                <div
                  key={log.id}
                  ref={isHighlighted ? highlightedRef : undefined}
                  className={`timeline-item ${isHighlighted ? 'highlighted-comment' : ''}`}
                  style={
                    isHighlighted
                      ? {
                          border: '1px solid var(--accent-primary, #6366f1)',
                          background: 'rgba(99, 102, 241, 0.08)',
                          borderRadius: '8px',
                          padding: '10px',
                          boxShadow: '0 0 12px rgba(99, 102, 241, 0.25)',
                          transition: 'all 0.3s ease',
                        }
                      : undefined
                  }
                >
                  <div className="timeline-marker" />
                  <div className="timeline-content">
                    <div className="timeline-header">
                      <span className="timeline-user">👤 {log.userDisplayName}</span>
                      <span className={`timeline-action-badge action-badge-${log.action}`}>
                        {log.action.replace('_', ' ')}
                      </span>
                      <span className="timeline-time">
                        {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} •{' '}
                        {formatDisplayDate(log.createdAt.slice(0, 10))}
                      </span>
                    </div>
                    {log.commentText && (
                      <div className="timeline-text">{renderCommentWithMentions(log.commentText)}</div>
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
              );
            })}
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
