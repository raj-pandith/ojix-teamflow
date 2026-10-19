import { TaskFormData } from '../types/task';
import { Project, ProjectFormData } from '../types/project';
import { UserProfile } from '../types/auth';

export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: Record<string, string>;
}

export interface AssigneeEligibilityResult {
  readonly eligible: boolean;
  readonly reason?: string;
}

/**
 * Validates whether a user is eligible for task assignment in a given project.
 * Rules:
 * 1. User account must exist.
 * 2. User account must be 'active' (not 'blocked' or 'terminated').
 * 3. User's role must be 'member' or 'project_lead' (explicitly reject 'workspace_admin' and 'viewer').
 * 4. User must be an active member of the specific project team (user.uid in project.memberIds).
 */
export function validateAssigneeEligibility(
  user: UserProfile | null | undefined,
  project: Project | null | undefined
): AssigneeEligibilityResult {
  if (!user) {
    return { eligible: false, reason: 'Assignee user account does not exist in workspace.' };
  }

  if (user.status !== 'active') {
    return {
      eligible: false,
      reason: `Cannot assign task to "${user.displayName}": User account is ${user.status} and cannot receive task assignments.`,
    };
  }

  if (user.role === 'workspace_admin') {
    return {
      eligible: false,
      reason: 'Workspace Admins manage governance and cannot be assigned operational tasks.',
    };
  }

  if (user.role === 'viewer') {
    return {
      eligible: false,
      reason: 'Viewers have read-only permissions and cannot receive task assignments.',
    };
  }

  if (user.role !== 'member' && user.role !== 'project_lead') {
    return {
      eligible: false,
      reason: `User role "${user.role}" is not permitted to receive task assignments under the role policy.`,
    };
  }

  if (!project) {
    return { eligible: false, reason: 'Target project does not exist.' };
  }

  if (!project.memberIds.includes(user.uid)) {
    return {
      eligible: false,
      reason: `User "${user.displayName}" is not an active member of this project team "${project.name}". Please add them using Manage Team first.`,
    };
  }

  return { eligible: true };
}

/**
 * Validates whether a user is eligible to be designated as a reviewer in a given project.
 * Rules:
 * 1. User account must exist.
 * 2. User account must be 'active' (not 'blocked' or 'terminated').
 * 3. User's role must not be 'viewer' (viewers have read-only permissions and cannot review or approve tasks).
 * 4. User must have access to the same project (in project.memberIds, or project.ownerId, or workspace_admin).
 */
export function validateReviewerEligibility(
  user: UserProfile | null | undefined,
  project: Project | null | undefined
): AssigneeEligibilityResult {
  if (!user) {
    return { eligible: false, reason: 'Reviewer user account does not exist in workspace.' };
  }

  if (user.status !== 'active') {
    return {
      eligible: false,
      reason: `Cannot select "${user.displayName}" as reviewer: User account is ${user.status}.`,
    };
  }

  if (user.role === 'viewer') {
    return {
      eligible: false,
      reason: 'Viewers have read-only access and cannot review or approve tasks.',
    };
  }

  if (!project) {
    return { eligible: false, reason: 'Target project does not exist.' };
  }

  const hasAccess =
    user.role === 'workspace_admin' ||
    project.memberIds.includes(user.uid) ||
    project.ownerId === user.uid;

  if (!hasAccess) {
    return {
      eligible: false,
      reason: `User "${user.displayName}" does not have access to project "${project.name}".`,
    };
  }

  return { eligible: true };
}

/**
 * Convenience predicate returning true if user is eligible to be a reviewer for the project.
 */
export function isUserEligibleForReview(
  user: UserProfile | null | undefined,
  project: Project | null | undefined
): boolean {
  return validateReviewerEligibility(user, project).eligible;
}

/**
 * Filters workspace users down to only eligible, active project reviewers.
 */
export function getEligibleProjectReviewers(
  users: readonly UserProfile[],
  project: Project | null | undefined
): UserProfile[] {
  if (!project) return [];
  return users.filter(u => isUserEligibleForReview(u, project));
}

/**
 * Convenience predicate returning true if user is assignable in the project.
 */
export function isUserEligibleForAssignment(
  user: UserProfile | null | undefined,
  project: Project | null | undefined
): boolean {
  return validateAssigneeEligibility(user, project).eligible;
}

/**
 * Filters workspace users down to only eligible, active project team assignees.
 */
export function getEligibleProjectAssignees(
  users: readonly UserProfile[],
  project: Project | null | undefined
): UserProfile[] {
  if (!project) return [];
  return users.filter(u => isUserEligibleForAssignment(u, project));
}

/**
 * Validates Task creation or update form data.
 */
export function validateTaskForm(
  data: Partial<TaskFormData>,
  options?: { requireReviewer?: boolean }
): ValidationResult {
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

  if (options?.requireReviewer) {
    if (!data.reviewerId || !data.reviewerId.trim()) {
      errors.reviewerId = 'A designated reviewer is required for this task.';
    }
  } else if (data.reviewerId !== undefined && !data.reviewerId?.trim()) {
    errors.reviewerId = 'A designated reviewer cannot be empty.';
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
