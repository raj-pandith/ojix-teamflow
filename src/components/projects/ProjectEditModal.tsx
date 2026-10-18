import React, { useState, useEffect } from 'react';
import { Project, ProjectFormData, ProjectStatus } from '../../types/project';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Select } from '../common/Select';

interface ProjectEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onUpdateProject: (projectId: string, updates: Partial<ProjectFormData>) => Promise<unknown>;
}

export const ProjectEditModal: React.FC<ProjectEditModalProps> = ({
  isOpen,
  onClose,
  project,
  onUpdateProject,
}) => {
  const [name, setName] = useState(project.name);
  const [objective, setObjective] = useState(project.objective);
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [startDate, setStartDate] = useState(project.startDate);
  const [dueDate, setDueDate] = useState(project.dueDate);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setName(project.name);
    setObjective(project.objective);
    setStatus(project.status);
    setStartDate(project.startDate);
    setDueDate(project.dueDate);
    setError('');
  }, [project, isOpen]);

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
      await onUpdateProject(project.id, {
        name: name.trim(),
        objective: objective.trim(),
        status,
        startDate,
        dueDate,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update project');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Project Settings" maxWidth="600px">
      <form onSubmit={handleSubmit} className="project-edit-form">
        {error && <div className="form-alert-error">{error}</div>}

        <Input
          label="Project Name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Q4 Cloud Infrastructure & Telemetry"
          required
          autoFocus
          id="edit-project-name-input"
        />

        <div className="form-group">
          <label htmlFor="edit-project-objective" className="form-label">
            Objective & Deliverables <span className="required-indicator">*</span>
          </label>
          <textarea
            id="edit-project-objective"
            className="form-textarea"
            rows={3}
            value={objective}
            onChange={e => setObjective(e.target.value)}
            placeholder="Define the core mission, milestones, and deliverables..."
            required
          />
        </div>

        <div className="form-row-2">
          <Select
            label="Project Status"
            value={status}
            onChange={e => setStatus(e.target.value as ProjectStatus)}
            options={[
              { value: 'planning', label: 'Planning' },
              { value: 'active', label: 'Active' },
              { value: 'on_hold', label: 'On Hold' },
              { value: 'completed', label: 'Completed' },
              { value: 'archived', label: 'Archived' },
            ]}
            id="edit-project-status-select"
          />

          <Input
            label="Start Date"
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            required
            id="edit-project-start-date"
          />
        </div>

        <div className="form-group">
          <Input
            label="Target Due Date"
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            required
            id="edit-project-due-date"
          />
        </div>

        <div className="modal-actions">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            isLoading={isSubmitting}
            id="submit-edit-project-btn"
          >
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
};
