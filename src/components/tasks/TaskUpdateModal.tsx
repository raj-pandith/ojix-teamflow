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

  const assignableUsers = users.filter(u => u.role !== 'viewer');
  const sortedAssignableUsers = [...assignableUsers].sort((a, b) => {
    const aIn = project ? project.memberIds.includes(a.uid) : true;
    const bIn = project ? project.memberIds.includes(b.uid) : true;
    if (aIn && !bIn) return -1;
    if (!aIn && bIn) return 1;
    return a.displayName.localeCompare(b.displayName);
  });

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
        storageEngine.addMemberToProject(project.id, assigneeId);
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
          <Select
            label="Assignee"
            value={assigneeId}
            onChange={e => setAssigneeId(e.target.value)}
            options={[
              { value: '', label: 'Unassigned' },
              ...sortedAssignableUsers.map(m => ({
                value: m.uid,
                label: project && project.memberIds.includes(m.uid)
                  ? `${m.displayName} (${m.role.replace('_', ' ')})`
                  : `${m.displayName} (${m.role.replace('_', ' ')}) — Add to Project`,
              })),
            ]}
            id="update-task-assignee-select"
          />

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
