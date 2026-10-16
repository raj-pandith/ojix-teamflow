import { TaskFormData } from '../types/task';
import { ProjectFormData } from '../types/project';

export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: Record<string, string>;
}

/**
 * Validates Task creation or update form data.
 */
export function validateTaskForm(data: Partial<TaskFormData>): ValidationResult {
  const errors: Record<string, string> = {};

  const title = data.title?.trim() || '';
  if (!title) {
    errors.title = 'Task title is required.';
  } else if (title.length < 3) {
    errors.title = 'Title must be at least 3 characters.';
  } else if (title.length > 120) {
    errors.title = 'Title cannot exceed 120 characters.';
  }

  if (data.description && data.description.length > 2000) {
    errors.description = 'Description cannot exceed 2000 characters.';
  }

  if (!data.priority) {
    errors.priority = 'Priority is required.';
  }

  if (!data.status) {
    errors.status = 'Status is required.';
  }

  if (!data.dueDate) {
    errors.dueDate = 'Due date is required.';
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(data.dueDate)) {
    errors.dueDate = 'Due date must be in YYYY-MM-DD format.';
  }

  if (data.status === 'blocked') {
    const reason = data.blockerReason?.trim() || '';
    if (reason.length < 5) {
      errors.blockerReason = 'Blocker explanation (min 5 characters) is required.';
    }
  }

  if (data.status === 'in_progress' && !data.assigneeId) {
    errors.assigneeId = 'An assignee is required before moving to In Progress.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validates Project creation or update form data.
 */
export function validateProjectForm(data: Partial<ProjectFormData>): ValidationResult {
  const errors: Record<string, string> = {};

  const name = data.name?.trim() || '';
  if (!name) {
    errors.name = 'Project name is required.';
  } else if (name.length < 3) {
    errors.name = 'Name must be at least 3 characters.';
  } else if (name.length > 80) {
    errors.name = 'Name cannot exceed 80 characters.';
  }

  const objective = data.objective?.trim() || '';
  if (!objective) {
    errors.objective = 'Objective is required.';
  } else if (objective.length < 5) {
    errors.objective = 'Objective must be at least 5 characters.';
  }

  if (!data.startDate) {
    errors.startDate = 'Start date is required.';
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(data.startDate)) {
    errors.startDate = 'Start date must be in YYYY-MM-DD format.';
  }

  if (!data.dueDate) {
    errors.dueDate = 'Target completion date is required.';
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(data.dueDate)) {
    errors.dueDate = 'Target date must be in YYYY-MM-DD format.';
  }

  if (data.startDate && data.dueDate && data.startDate > data.dueDate) {
    errors.dueDate = 'Target completion date must be on or after start date.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
