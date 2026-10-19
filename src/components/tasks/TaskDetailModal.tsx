import React, { useState, useEffect } from 'react';
import { Task, TaskFormData } from '../../types/task';
import { Project } from '../../types/project';
import { UserProfile } from '../../types/auth';
import { ActivityLogEntry } from '../../types/audit';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { TaskUpdateModal } from './TaskUpdateModal';
import { BlockerModal } from './BlockerModal';
import { RequestChangesModal } from './RequestChangesModal';
import { auditService } from '../../services/auditService';
import { storageEngine } from '../../services/storageEngine';
import { taskService } from '../../services/taskService';
import { useToast } from '../../hooks/useToast';
import { formatDisplayDate } from '../../domain/timezone';
import { isUserEligibleForAssignment } from '../../domain/validation';
import { getMentionSuggestions } from '../../domain/mentionParser';
import { UserCheck } from 'lucide-react';

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
  const [isChangesModalOpen, setIsChangesModalOpen] = useState(false);
  const [isBlockerModalOpen, setIsBlockerModalOpen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const { showToast } = useToast();
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

  const activeTask = (currentTask && task && currentTask.id === task.id) ? currentTask : task;

  const suggestions = React.useMemo(() => {
    if (!showMentionSuggestions || mentionQuery === null || !currentUser) return [];
    return getMentionSuggestions(mentionQuery, users, project, currentUser);
  }, [showMentionSuggestions, mentionQuery, users, project, currentUser]);

  useEffect(() => {
    if (highlightCommentId && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightCommentId, logs]);

  if (!isOpen || !activeTask) return null;

  const assignee = users.find(u => u.uid === activeTask.assigneeId);
  const isAssigneeIneligible = Boolean(assignee && project && !isUserEligibleForAssignment(assignee, project));

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

  const findMentionedUser = (token: string): UserProfile | undefined => {
    const clean = token.replace(/^@/, '').trim().toLowerCase();
    if (!clean) return undefined;
    return users.find(u => {
      const emailLower = u.email.toLowerCase();
      const localPart = emailLower.split('@')[0];
      const nameLower = u.displayName.toLowerCase();
      const parts = nameLower.split(/\s+/);
      const firstName = parts[0];
      const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
      const nameNoSpaces = nameLower.replace(/\s+/g, '');
      const nameWithDots = nameLower.replace(/\s+/g, '.');

      return (
        clean === nameLower ||
        clean === emailLower ||
        clean === localPart ||
        clean === nameNoSpaces ||
        clean === nameWithDots ||
        clean === firstName ||
        (Boolean(lastName) && clean === lastName)
      );
    });
  };

  const handleSelectMention = (sUser: UserProfile) => {
    if (!textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart;
    const textBeforeCursor = newComment.slice(0, cursorPos);
    const textAfterCursor = newComment.slice(cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    if (atIndex !== -1) {
      const inserted = `@${sUser.displayName} `;
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
    if (!text) return null;

    // Dynamically build regex to match full display names first, followed by email and token patterns
    const escapedNames = users
      .map(u => u.displayName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    const namePatterns = escapedNames.length > 0 ? `${escapedNames.join('|')}|` : '';
    const mentionRegex = new RegExp(
      `(@(?:${namePatterns}[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\\.[a-zA-Z0-9._-]+|[a-zA-Z0-9._-]+))`,
      'gi'
    );

    const parts = text.split(mentionRegex);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        const matchedUser = findMentionedUser(part);
        const displayName = matchedUser ? matchedUser.displayName : part.slice(1);
        const emailInfo = matchedUser ? ` • ${matchedUser.email}` : '';

        return (
          <span
            key={i}
            className="comment-mention-pill"
            title={matchedUser ? `${matchedUser.displayName}${emailInfo} (${matchedUser.role.replace('_', ' ')})` : part}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              background: 'rgba(99, 102, 241, 0.18)',
              color: 'var(--accent-primary-light, #818cf8)',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '6px',
              margin: '0 2px',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              fontSize: '12px',
              verticalAlign: 'baseline',
            }}
          >
            <span style={{ opacity: 0.75 }}>@</span>
            <span>{displayName}</span>
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

  const reviewer = users.find(u => u.uid === activeTask.reviewerId);
  const isAssignee = Boolean(currentUser && activeTask.assigneeId === currentUser.uid);
  const isAuthorizedManager = Boolean(
    currentUser && (currentUser.role === 'workspace_admin' || currentUser.role === 'project_lead')
  );
  const isDesignatedReviewer = Boolean(currentUser && activeTask.reviewerId === currentUser.uid);

  // Review permissions:
  // Authorized reviewer, project lead, or workspace admin can make decisions on In Review tasks.
  // Enforces self-review policy: Assignee cannot approve their own task.
  const canApprove = Boolean(
    currentUser &&
    activeTask.status === 'in_review' &&
    !isAssignee &&
    (isDesignatedReviewer || isAuthorizedManager)
  );

  const canRequestChanges = Boolean(
    currentUser &&
    activeTask.status === 'in_review' &&
    !isAssignee &&
    (isDesignatedReviewer || isAuthorizedManager)
  );

  const canResumeFromBlocked = Boolean(
    currentUser &&
    activeTask.status === 'blocked' &&
    (isAssignee || isAuthorizedManager)
  );

  const handleApprove = async () => {
    if (!currentUser || !activeTask) return;
    setIsTransitioning(true);
    try {
      const updated = await taskService.approveTask(activeTask.id, currentUser);
      setCurrentTask(updated);
      showToast('success', 'Task Approved', 'Task marked as Done.');
    } catch (err) {
      showToast('error', 'Approval Rejected', err instanceof Error ? err.message : 'Failed to approve task.');
    } finally {
      setIsTransitioning(false);
    }
  };

  const handleConfirmChanges = async (comment: string) => {
    if (!currentUser || !activeTask) return;
    setIsTransitioning(true);
    try {
      const updated = await taskService.requestChanges(activeTask.id, comment, currentUser);
      setCurrentTask(updated);
      setIsChangesModalOpen(false);
      showToast('info', 'Changes Requested', 'Task returned to In Progress.');
    } catch (err) {
      showToast('error', 'Failed to Request Changes', err instanceof Error ? err.message : 'Error requesting changes.');
    } finally {
      setIsTransitioning(false);
    }
  };

  const handleConfirmBlocker = async (reason: string) => {
    if (!currentUser || !activeTask) return;
    setIsTransitioning(true);
    try {
      const updated = await taskService.transitionStatus(activeTask.id, 'blocked', reason, currentUser);
      setCurrentTask(updated);
      setIsBlockerModalOpen(false);
      showToast('warning', 'Task Blocked', 'Task flagged as blocked and reviewer notified.');
    } catch (err) {
      showToast('error', 'Blocker Update Failed', err instanceof Error ? err.message : 'Failed to block task.');
    } finally {
      setIsTransitioning(false);
    }
  };

  const handleResumeWork = async () => {
    if (!currentUser || !activeTask) return;
    setIsTransitioning(true);
    try {
      const updated = await taskService.transitionStatus(activeTask.id, 'in_progress', undefined, currentUser);
      setCurrentTask(updated);
      showToast('success', 'Work Resumed', 'Task returned to In Progress.');
    } catch (err) {
      showToast('error', 'Resume Failed', err instanceof Error ? err.message : 'Failed to resume task.');
    } finally {
      setIsTransitioning(false);
    }
  };

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
          <div className="meta-item">
            <span className="meta-label">Reviewer</span>
            <span className="meta-value" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <UserCheck size={14} style={{ color: 'var(--color-primary, #6366f1)', flexShrink: 0 }} />
              <strong>{reviewer?.displayName || 'Unassigned'}</strong>
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

        {/* Changes Requested Banner */}
        {activeTask.changesRequestedComment && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderLeft: '4px solid var(--status-blocked, #f59e0b)',
              marginBottom: '16px',
              fontSize: '13px',
              color: 'var(--text-primary)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', fontWeight: 600, color: '#f59e0b' }}>
              <span>⚠️ Changes Requested</span>
              {activeTask.changesRequestedAt && (
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 400 }}>
                  ({formatDisplayDate(activeTask.changesRequestedAt.slice(0, 10))})
                </span>
              )}
            </div>
            <div style={{ whiteSpace: 'pre-line', lineHeight: 1.5 }}>{activeTask.changesRequestedComment}</div>
          </div>
        )}

        {/* In Review Workflow Banner */}
        {activeTask.status === 'in_review' && (
          <div
            style={{
              padding: '14px 18px',
              borderRadius: '8px',
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderLeft: '4px solid #38bdf8',
              marginBottom: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#38bdf8' }}>
                <span>🔍 Awaiting Review</span>
                {activeTask.submittedForReviewAt && (
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 400 }}>
                    (Submitted on {formatDisplayDate(activeTask.submittedForReviewAt.slice(0, 10))})
                  </span>
                )}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Reviewer: <strong>{reviewer?.displayName || 'Unassigned'}</strong>
              </div>
            </div>

            {/* Self-review warning if currentUser is the assignee */}
            {isAssignee && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '6px' }}>
                ℹ️ You submitted this task for review. In accordance with the self-review policy, assignees cannot approve their own tasks.
              </div>
            )}

            {/* Decision actions if authorized */}
            {(canApprove || canRequestChanges) && (
              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                {canApprove && (
                  <Button
                    variant="primary"
                    size="sm"
                    isLoading={isTransitioning}
                    onClick={handleApprove}
                    id="approve-review-btn"
                  >
                    ✓ Approve and Complete
                  </Button>
                )}
                {canRequestChanges && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isTransitioning}
                    onClick={() => setIsChangesModalOpen(true)}
                    id="request-changes-btn"
                  >
                    ↩ Request Changes
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Blocker Notice if Blocked */}
        {activeTask.status === 'blocked' && (
          <div className="task-blocker-banner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="blocker-icon">⚠️</span>
              <div className="blocker-details">
                <strong>Blocker:</strong> {activeTask.blockerReason || 'Blocked dependency'}
              </div>
            </div>
            {canResumeFromBlocked && (
              <Button
                variant="secondary"
                size="sm"
                isLoading={isTransitioning}
                onClick={handleResumeWork}
                id="resume-work-btn"
              >
                ▶️ Resume Work
              </Button>
            )}
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
                        <span style={{ color: 'var(--text-muted, #8b949e)', fontSize: '12px' }}>
                          ({sUser.email})
                        </span>
                        <span style={{ color: 'var(--accent-primary-light, #818cf8)', fontSize: '11px', marginLeft: 'auto' }}>
                          {sUser.role.replace('_', ' ')}
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

      {/* Request Changes Feedback Modal */}
      {isChangesModalOpen && activeTask && (
        <RequestChangesModal
          isOpen={isChangesModalOpen}
          onClose={() => setIsChangesModalOpen(false)}
          onConfirm={handleConfirmChanges}
          taskTitle={activeTask.title}
        />
      )}

      {/* Flag as Blocked Modal */}
      {isBlockerModalOpen && activeTask && (
        <BlockerModal
          isOpen={isBlockerModalOpen}
          onClose={() => setIsBlockerModalOpen(false)}
          onConfirm={handleConfirmBlocker}
          taskTitle={activeTask.title}
        />
      )}
    </Modal>
  );
};
