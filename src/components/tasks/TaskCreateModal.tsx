import React, { useState, useEffect } from 'react';
import { TaskFormData, TaskPriority, TaskStatus } from '../../types/task';
import { Project } from '../../types/project';
import { UserProfile } from '../../types/auth';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { storageEngine } from '../../services/storageEngine';
import { getLocalTodayDateString } from '../../domain/timezone';
import { getEligibleProjectAssignees, validateAssigneeEligibility } from '../../domain/validation';

interface TaskCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  currentUser: UserProfile;
  onCreateTask: (data: TaskFormData) => Promise<unknown>;
}

export const TaskCreateModal: React.FC<TaskCreateModalProps> = ({
  isOpen,
  onClose,
  project,
  currentUser,
  onCreateTask,
}) => {
  const canCreateTask = currentUser?.role === 'workspace_admin' || currentUser?.role === 'project_lead';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>(getLocalTodayDateString());
  const [blockerReason, setBlockerReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [users, setUsers] = useState<UserProfile[]>(() => storageEngine.getUsers());

  useEffect(() => {
    setUsers(storageEngine.getUsers());
    return storageEngine.subscribe(() => {
      setUsers(storageEngine.getUsers());
    });
  }, [isOpen]);

  // Task Assignment Eligibility: Only active project team members with eligible role (Member or Project Lead)
  const projectTeamMembers = getEligibleProjectAssignees(users, project)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateTask) {
      setError('Permission denied: Members and Viewers cannot create new tasks.');
      return;
    }
    if (!title.trim()) {
      setError('Task title is required.');
      return;
    }
    if (status === 'blocked' && (!blockerReason || blockerReason.trim().length < 5)) {
      setError('A blocker reason (min 5 characters) is required when starting as Blocked.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      if (assigneeId) {
        const targetUser = users.find(u => u.uid === assigneeId);
        const eligibility = validateAssigneeEligibility(targetUser, project);
        if (!eligibility.eligible) {
          setError(eligibility.reason || 'Selected assignee is not eligible for assignment in this project.');
          return;
        }
      }
      await onCreateTask({
        title: title.trim(),
        description: description.trim(),
        priority,
        status,
        assigneeId: assigneeId || null,
        dueDate,
        blockerReason: status === 'blocked' ? blockerReason.trim() : undefined,
      });
      // Reset form
      setTitle('');
      setDescription('');
      setStatus('todo');
      setPriority('medium');
      setBlockerReason('');
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Create Task in ${project.name}`} maxWidth="600px">
      <form onSubmit={handleSubmit} className="task-create-form">
        {error && <div className="form-alert-error">{error}</div>}

        <Input
          label="Task Title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Implement zero-downtime database migration"
          required
          autoFocus
          id="new-task-title-input"
        />

        <div className="form-group">
          <label htmlFor="new-task-desc-input" className="form-label">
            Description
          </label>
          <textarea
            id="new-task-desc-input"
            className="form-textarea"
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
            id="new-task-priority-select"
          />

          <Select
            label="Initial Status"
            value={status}
            onChange={e => setStatus(e.target.value as TaskStatus)}
            options={[
              { value: 'todo', label: 'To Do' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'in_review', label: 'In Review' },
              { value: 'backlog', label: 'Backlog' },
              { value: 'blocked', label: 'Blocked' },
            ]}
            id="new-task-status-select"
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
                ...projectTeamMembers.map(m => ({
                  value: m.uid,
                  label: `${m.displayName} (${m.role.replace('_', ' ')})`,
                })),
              ]}
              id="new-task-assignee-select"
            />
            {projectTeamMembers.length === 0 && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--status-blocked)', display: 'block', marginTop: '4px' }}>
                ⚠️ No members in this project team yet. Add members via <strong>Manage Team</strong> to assign tasks.
              </span>
            )}
          </div>

          <Input
            label="Due Date"
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            required
            id="new-task-due-date-input"
          />
        </div>

        {status === 'blocked' && (
          <div className="form-group animate-fade-in">
            <label htmlFor="initial-blocker-reason" className="form-label">
              Blocker Explanation <span className="required-indicator">*</span>
            </label>
            <input
              id="initial-blocker-reason"
              className="form-input"
              value={blockerReason}
              onChange={e => setBlockerReason(e.target.value)}
              placeholder="Why is this task blocked?"
              required
            />
          </div>
        )}

        <div className="modal-actions">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            isLoading={isSubmitting}
            id="submit-create-task-btn"
          >
            Create Task
          </Button>
        </div>
      </form>
    </Modal>
  );
};
