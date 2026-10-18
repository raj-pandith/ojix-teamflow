import React, { useState, useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Project, RemoveMemberResult, TaskReassignmentDecision } from '../../types/project';
import { UserProfile } from '../../types/auth';
import { Task } from '../../types/task';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { storageEngine } from '../../services/storageEngine';
import { projectService } from '../../services/projectService';
import { isTaskOverdue, formatDisplayDate } from '../../domain/timezone';
import { TaskDetailModal } from '../tasks/TaskDetailModal';
import { taskService } from '../../services/taskService';
import { getEligibleProjectAssignees } from '../../domain/validation';

export interface RemoveMemberConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  member: UserProfile | null;
  currentUser: UserProfile;
  onSuccess: (result: RemoveMemberResult) => void;
}

export const RemoveMemberConfirmModal: React.FC<RemoveMemberConfirmModalProps> = ({
  isOpen,
  onClose,
  project,
  member,
  currentUser,
  onSuccess,
}) => {
  const [activeTasks, setActiveTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [reassignmentMap, setReassignmentMap] = useState<Record<string, string | null>>({});
  const [bulkAssignee, setBulkAssignee] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);

  // Load member's tasks whenever the modal opens or the target member changes
  useEffect(() => {
    if (isOpen && member && project) {
      setErrorMessage(null);
      setBulkAssignee('');
      try {
        const { activeTasks: active, completedTasks: completed } =
          projectService.getMemberProjectTasks(project.id, member.uid, currentUser);
        setActiveTasks(active);
        setCompletedTasks(completed);

        // Default all active tasks to unassigned (null)
        const initialMap: Record<string, string | null> = {};
        active.forEach(t => {
          initialMap[t.id] = null;
        });
        setReassignmentMap(initialMap);
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load member tasks');
      }
    }
  }, [isOpen, member?.uid, project?.id, currentUser]);

  if (!isOpen || !member || !project) return null;

  // Eligible replacement members: active workspace users with assignable role (Member or Project Lead) who belong to this project team (excluding the member being removed)
  const allWorkspaceUsers = storageEngine.getUsers();
  const eligibleMembers = getEligibleProjectAssignees(allWorkspaceUsers, project).filter(
    u => u.uid !== member.uid
  );

  const handleTaskAssigneeChange = (taskId: string, newAssigneeId: string) => {
    setReassignmentMap(prev => ({
      ...prev,
      [taskId]: newAssigneeId ? newAssigneeId : null,
    }));
  };

  const handleApplyBulkAssignee = () => {
    const nextMap: Record<string, string | null> = {};
    activeTasks.forEach(t => {
      nextMap[t.id] = bulkAssignee ? bulkAssignee : null;
    });
    setReassignmentMap(nextMap);
  };

  const handleResetAllToUnassigned = () => {
    const nextMap: Record<string, string | null> = {};
    activeTasks.forEach(t => {
      nextMap[t.id] = null;
    });
    setReassignmentMap(nextMap);
    setBulkAssignee('');
  };

  const handleConfirmRemoval = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const reassignments: TaskReassignmentDecision[] = activeTasks.map(t => ({
        taskId: t.id,
        newAssigneeId: reassignmentMap[t.id] || null,
      }));

      const result = await projectService.removeTeamMember(
        project.id,
        member.uid,
        currentUser,
        reassignments
      );

      onSuccess(result);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setIsSubmitting(false);
    }
  };

  const reassignedCount = Object.values(reassignmentMap).filter(val => val !== null).length;
  const unassignedCount = activeTasks.length - reassignedCount;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Remove Member: ${member.displayName}`}
        maxWidth="780px"
      >
      <div className="remove-member-flow-container">
        {/* Member Profile Header */}
        <div className="removal-member-card">
          <div className="member-avatar-large">
            {member.displayName.charAt(0)}
          </div>
          <div className="member-info-col">
            <div className="member-name-row">
              <strong className="member-title">{member.displayName}</strong>
              <Badge type="role" value={member.role} />
              <Badge type="user-status" value={member.status || 'active'} />
            </div>
            <div className="member-email-text">{member.email}</div>
          </div>
        </div>

        {/* Consequences & Governance Warning Notice */}
        <div className="removal-consequences-banner">
          <div className="consequences-header">
            <span className="warning-icon">⚠️</span>
            <strong>Team Governance & Access Impact</strong>
          </div>
          <ul className="consequences-list">
            <li>
              <strong>Immediate Access Revocation:</strong> {member.displayName} will immediately lose access to project <em>"{project.name}"</em> and its tasks.
            </li>
            <li>
              <strong>Workspace Account Preserved:</strong> Their workspace account remains intact and active. Access to other independent projects is unaffected.
            </li>
            <li>
              <strong>Historical Work Ownership:</strong> All {completedTasks.length} completed task(s) and historical comments remain permanently attributed to {member.displayName}.
            </li>
            <li>
              <strong>Task Reassignment:</strong> Any unfinished task ({activeTasks.length}) can be reassigned to an active project team member below or left unassigned temporarily.
            </li>
          </ul>
        </div>

        {/* Task Statistics Chips */}
        <div className="removal-task-stats-row">
          <div className="removal-stat-chip">
            <span className="stat-label">Active / Unfinished Tasks</span>
            <span className="stat-value active-count">{activeTasks.length}</span>
          </div>
          <div className="removal-stat-chip">
            <span className="stat-label">Completed Tasks (Preserved)</span>
            <span className="stat-value done-count">{completedTasks.length}</span>
          </div>
          <div className="removal-stat-chip">
            <span className="stat-label">Total Historical Tasks</span>
            <span className="stat-value total-count">{activeTasks.length + completedTasks.length}</span>
          </div>
        </div>

        {/* Error Alert with Retry */}
        {errorMessage && (
          <div className="removal-error-banner" role="alert">
            <span className="error-icon">❌</span>
            <div className="error-text">
              <strong>Operation Failed:</strong> {errorMessage}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleConfirmRemoval}
              disabled={isSubmitting}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Unfinished Tasks Reassignment Section */}
        <div className="removal-tasks-section">
          <div className="section-title-row">
            <div>
              <h4 className="section-title">
                Unfinished Tasks Reassignment ({activeTasks.length})
              </h4>
              <p className="section-subtitle">
                Select an eligible active project member for each task, or leave it unassigned.
              </p>
            </div>
            {activeTasks.length > 1 && (
              <div className="bulk-reassign-bar">
                <select
                  className="filter-select bulk-select"
                  value={bulkAssignee}
                  onChange={e => setBulkAssignee(e.target.value)}
                  id="bulk-reassign-select"
                >
                  <option value="">— Choose member for all —</option>
                  {eligibleMembers.map(u => (
                    <option key={u.uid} value={u.uid}>
                      {u.displayName} ({u.role.replace('_', ' ')})
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!bulkAssignee || isSubmitting}
                  onClick={handleApplyBulkAssignee}
                  id="apply-bulk-reassign-btn"
                >
                  Apply All
                </Button>
                <button
                  type="button"
                  className="btn-link"
                  onClick={handleResetAllToUnassigned}
                  disabled={isSubmitting}
                  id="reset-all-unassigned-btn"
                >
                  Leave All Unassigned
                </button>
              </div>
            )}
          </div>

          {activeTasks.length > 0 ? (
            <div className="removal-tasks-table-wrapper">
              <table className="tasks-table removal-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: '40%' }}>Task</th>
                    <th>Status / Priority</th>
                    <th>Due Date</th>
                    <th style={{ width: '35%' }}>New Assignee</th>
                  </tr>
                </thead>
                <tbody>
                  {activeTasks.map(task => {
                    const selectedAssignee = reassignmentMap[task.id];
                    const isOverdue = isTaskOverdue(task.dueDate, task.status);
                    const isBlocked = task.status === 'blocked';
                    const targetUser = selectedAssignee
                      ? eligibleMembers.find(m => m.uid === selectedAssignee)
                      : null;

                    return (
                      <tr key={task.id} className="removal-task-row">
                        <td>
                          <div className="task-row-title-box">
                            <button
                              type="button"
                              className="task-title-link-btn"
                              onClick={() => setViewingTask(task)}
                              title="Click to inspect task details"
                              id={`view-task-details-${task.id}`}
                            >
                              <span className="task-title-text">{task.title}</span>
                              <span className="task-inspect-icon" aria-hidden="true">↗</span>
                            </button>
                            {task.dependencies && task.dependencies.length > 0 && (
                              <span className="task-dep-badge" title={`Depends on ${task.dependencies.join(', ')}`}>
                                🔗 {task.dependencies.length} Dep
                              </span>
                            )}
                            {isBlocked && task.blockerReason && (
                              <div className="task-blocker-note" title={task.blockerReason}>
                                ⚠️ Blocked: {task.blockerReason}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                            <Badge type="status" value={task.status} />
                            <Badge type="priority" value={task.priority} />
                          </div>
                        </td>
                        <td>
                          <div className={`task-due-box ${isOverdue ? 'due-overdue' : ''}`}>
                            <span>{formatDisplayDate(task.dueDate)}</span>
                            {isOverdue && <span className="overdue-tag">Overdue</span>}
                          </div>
                        </td>
                        <td>
                          <div className="reassignment-control-box">
                            <select
                              className="filter-select task-assignee-select"
                              value={selectedAssignee || ''}
                              onChange={e => handleTaskAssigneeChange(task.id, e.target.value)}
                              disabled={isSubmitting}
                              id={`reassign-select-${task.id}`}
                              aria-label={`Reassign task ${task.title}`}
                            >
                              <option value="">— Leave Unassigned —</option>
                              {eligibleMembers.map(u => (
                                <option key={u.uid} value={u.uid}>
                                  {u.displayName} ({u.role.replace('_', ' ')})
                                </option>
                              ))}
                            </select>

                            <div className="reassignment-indicator">
                              {targetUser ? (
                                <span className="badge-reassigned">
                                  ➔ Reassigned to {targetUser.displayName}
                                </span>
                              ) : (
                                <span className="badge-unassigned">
                                  ⏸ Will be Unassigned
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="removal-empty-tasks-box">
              <span className="empty-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={20} style={{ color: 'var(--status-done, #10b981)' }} />
              </span>
              <div className="empty-tasks-text">
                <strong>No Unfinished Tasks</strong>
                <p>
                  {completedTasks.length > 0
                    ? `This member has no pending or active tasks. All ${completedTasks.length} completed task(s) will remain intact in project history.`
                    : 'This member has no assigned tasks in this project. Safe to remove immediately.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Summary Footer & Action Buttons */}
        <div className="removal-modal-footer">
          <div className="removal-summary-stats">
            {activeTasks.length > 0 && (
              <span>
                Reassigning <strong>{reassignedCount}</strong> task(s), leaving{' '}
                <strong>{unassignedCount}</strong> unassigned.
              </span>
            )}
          </div>
          <div className="removal-actions-group">
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
              id="cancel-remove-member-btn"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmRemoval}
              disabled={isSubmitting}
              id="confirm-remove-member-btn"
            >
              {isSubmitting ? 'Removing Member...' : 'Confirm & Remove from Team'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>

    {/* Inner View of the Task Modal */}
    {viewingTask && (
      <TaskDetailModal
        task={viewingTask}
        isOpen={!!viewingTask}
        onClose={() => setViewingTask(null)}
        currentUser={currentUser}
        project={project}
        onDeleteTask={taskId => {
          storageEngine.deleteTask(taskId, currentUser);
          setActiveTasks(prev => prev.filter(t => t.id !== taskId));
          setViewingTask(null);
        }}
        onUpdateTask={async (taskId, updates) => {
          const updated = await taskService.updateTask(taskId, updates, currentUser);
          setActiveTasks(prev => prev.map(t => (t.id === taskId ? updated : t)));
          setViewingTask(updated);
          return updated;
        }}
        canMutate={currentUser.role !== 'viewer'}
        zIndex={1250}
      />
    )}
  </>
  );
};
