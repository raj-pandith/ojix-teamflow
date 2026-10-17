import React, { useState, useEffect } from 'react';
import { Task, TaskFormData, TaskPriority, TaskStatus } from '../../types/task';
import { Project } from '../../types/project';
import { UserProfile } from '../../types/auth';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { storageEngine } from '../../services/storageEngine';

interface TaskUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  project?: Project | null;
  currentUser: UserProfile | null;
  onUpdateTask: (taskId: string, updates: Partial<TaskFormData>) => Promise<unknown>;
  onOpenDetail?: (task: Task) => void;
}

export const TaskUpdateModal: React.FC<TaskUpdateModalProps> = ({
  isOpen,
  onClose,
  task,
  project,
  onUpdateTask,
  onOpenDetail,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [blockerReason, setBlockerReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [users, setUsers] = useState<UserProfile[]>(() => storageEngine.getUsers());

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setPriority(task.priority);
      setStatus(task.status);
      setAssigneeId(task.assigneeId || '');
      setDueDate(task.dueDate);
      setBlockerReason(task.blockerReason || '');
      setError('');
    }
  }, [task, isOpen]);

  useEffect(() => {
    setUsers(storageEngine.getUsers());
    return storageEngine.subscribe(() => {
      setUsers(storageEngine.getUsers());
    });
  }, [isOpen]);

  if (!isOpen || !task) return null;

  // Mandatory Team Membership: Only eligible, active workspace users already in this project team
  const projectTeamMembers = users
    .filter(u => (project ? project.memberIds.includes(u.uid) : true) && u.status === 'active' && u.role !== 'viewer')
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  // If the task was previously assigned to a user who has since been removed from the team or deactivated,
  // display them with an alert so current state is clear, but prompt for reassignment.
  const currentAssignedUser = task.assigneeId ? users.find(u => u.uid === task.assigneeId) : null;
  const isCurrentAssigneeOutOfTeam =
    currentAssignedUser &&
    project &&
    (!project.memberIds.includes(currentAssignedUser.uid) || currentAssignedUser.status !== 'active');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;

    if (!title.trim()) {
      setError('Task title is required.');
      return;
    }
    if (status === 'blocked' && (!blockerReason || blockerReason.trim().length < 5)) {
      setError('A blocker reason (min 5 characters) is required when status is Blocked.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
    if (assigneeId && project && !project.memberIds.includes(assigneeId)) {
      setError('Selected assignee is not an active member of this project team. Please add them via Manage Team first.');
      return;
    }
      const updated = await onUpdateTask(task.id, {
        title: title.trim(),
        description: description.trim(),
        priority,
        status,
        assigneeId: assigneeId || null,
        dueDate,
        blockerReason: status === 'blocked' ? blockerReason.trim() : undefined,
      });

      onClose();
      if (onOpenDetail && updated) {
        onOpenDetail(updated as Task);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update task');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Update Task: ${task.title}`} maxWidth="600px">
      <form onSubmit={handleSubmit} className="task-update-form">
        {error && <div className="form-alert-error">{error}</div>}

        <Input
          label="Task Title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Implement zero-downtime database migration"
          required
          autoFocus
          id="update-task-title-input"
        />

        <div className="form-group">
          <label className="form-label" htmlFor="update-task-desc-input">
            Description
          </label>
          <textarea
            className="form-textarea"
            id="update-task-desc-input"
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Key deliverables, acceptance conditions, links..."
          />
        </div>

        <div className="form-row-2">
          <Select
            label="Priority"
            value={priority}
            onChange={e => setPriority(e.target.value as TaskPriority)}
            options={[
              { value: 'urgent', label: 'Urgent' },
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' },
            ]}
            id="update-task-priority-select"
          />

          <Select
            label="Status"
            value={status}
            onChange={e => setStatus(e.target.value as TaskStatus)}
            options={[
              { value: 'todo', label: 'To Do' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'in_review', label: 'In Review' },
              { value: 'backlog', label: 'Backlog' },
              { value: 'blocked', label: 'Blocked' },
              { value: 'done', label: 'Done' },
            ]}
            id="update-task-status-select"
          />
        </div>

        <div className="form-row-2">
          <div>
            <Select
              label="Assignee (Project Team Only)"
              value={assigneeId}
              onChange={e => setAssigneeId(e.target.value)}
              options={[
                { value: '', label: 'Unassigned' },
                ...(isCurrentAssigneeOutOfTeam && currentAssignedUser
                  ? [
                      {
                        value: currentAssignedUser.uid,
                        label: `⚠️ ${currentAssignedUser.displayName} (Removed from Team — Reassign)`,
                      },
                    ]
                  : []),
                ...projectTeamMembers.map(m => ({
                  value: m.uid,
                  label: `${m.displayName} (${m.role.replace('_', ' ')})`,
                })),
              ]}
              id="update-task-assignee-select"
            />
            {isCurrentAssigneeOutOfTeam && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--status-blocked)', display: 'block', marginTop: '4px' }}>
                ⚠️ Current assignee is no longer in this project team. Please reassign to an active team member.
              </span>
            )}
            {projectTeamMembers.length === 0 && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--status-blocked)', display: 'block', marginTop: '4px' }}>
                ⚠️ No active members in this project team. Add members via <strong>Manage Team</strong> to assign tasks.
              </span>
            )}
          </div>

          <Input
            label="Due Date"
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            required
            id="update-task-duedate-input"
          />
        </div>

        {status === 'blocked' && (
          <div className="form-group animate-slide-down">
            <Input
              label="Blocker Reason *"
              value={blockerReason}
              onChange={e => setBlockerReason(e.target.value)}
              placeholder="State the bottleneck, dependency, or issue preventing progress..."
              required
              id="update-task-blocker-reason"
            />
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 'var(--space-4)' }}>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" isLoading={isSubmitting} id="submit-update-task-btn">
            Save & View Post ➔
          </Button>
        </div>
      </form>
    </Modal>
  );
};
