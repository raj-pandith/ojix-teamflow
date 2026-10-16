import React, { useState } from 'react';
import { ProjectFormData, ProjectStatus } from '../../types/project';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { storageEngine } from '../../services/storageEngine';
import { getLocalTodayDateString } from '../../domain/timezone';

interface ProjectCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (data: ProjectFormData) => Promise<unknown>;
}

export const ProjectCreateModal: React.FC<ProjectCreateModalProps> = ({
  isOpen,
  onClose,
  onCreateProject,
}) => {
  const today = getLocalTodayDateString();
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [startDate, setStartDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>(['user-member-marcus', 'user-viewer-elena']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const users = storageEngine.getUsers();

  const handleToggleMember = (uid: string) => {
    setSelectedMemberIds(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Project name is required.');
      return;
    }
    if (!objective.trim()) {
      setError('Project objective is required.');
      return;
    }
    if (startDate > dueDate) {
      setError('Target completion date must be on or after start date.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await onCreateProject({
        name: name.trim(),
        objective: objective.trim(),
        status,
        startDate,
        dueDate,
        memberIds: selectedMemberIds,
      });
      // Reset form
      setName('');
      setObjective('');
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Project" maxWidth="600px">
      <form onSubmit={handleSubmit} className="project-create-form">
        {error && <div className="form-alert-error">{error}</div>}

        <Input
          label="Project Name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Q1 Distributed Telemetry Rollout"
          required
          autoFocus
          id="new-project-name-input"
        />

        <div className="form-group">
          <label htmlFor="new-project-objective" className="form-label">
            Objective & Deliverables <span className="required-indicator">*</span>
          </label>
          <textarea
            id="new-project-objective"
            className="form-textarea"
            rows={3}
            value={objective}
            onChange={e => setObjective(e.target.value)}
            placeholder="Define the core mission, milestones, and success criteria..."
            required
          />
        </div>

        <div className="form-row-2">
          <Select
            label="Initial Status"
            value={status}
            onChange={e => setStatus(e.target.value as ProjectStatus)}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'planning', label: 'Planning' },
              { value: 'on_hold', label: 'On Hold' },
            ]}
            id="new-project-status-select"
          />

          <Input
            label="Start Date"
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            required
            id="new-project-start-date"
          />
        </div>

        <div className="form-group">
          <Input
            label="Target Due Date"
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            required
            id="new-project-due-date"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Assign Team Members</label>
          <div className="member-checkbox-list">
            {users.map(u => (
              <label key={u.uid} className="member-checkbox-item">
                <input
                  type="checkbox"
                  checked={selectedMemberIds.includes(u.uid)}
                  onChange={() => handleToggleMember(u.uid)}
                />
                <span className="member-cb-name">{u.displayName} ({u.role})</span>
              </label>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            isLoading={isSubmitting}
            id="submit-create-project-btn"
          >
            Create Project
          </Button>
        </div>
      </form>
    </Modal>
  );
};
