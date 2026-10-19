import { TaskStatus, Task } from '../types/task';
import { UserProfile } from '../types/auth';
import { Project } from '../types/project';

export interface TransitionValidationResult {
  readonly valid: boolean;
  readonly error?: string;
  readonly code?: 'INVALID_TRANSITION' | 'BLOCKER_REASON_REQUIRED' | 'ASSIGNEE_REQUIRED' | 'DONE_CANNOT_BE_BLOCKED';
}

/**
 * Allowed transitions mapping based on the state machine in ASSIGNMENT.md Section 4.1
 */
export const ALLOWED_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  backlog: ['todo'],
  todo: ['in_progress', 'blocked', 'backlog'],
  in_progress: ['in_review', 'blocked', 'todo'],
  in_review: ['done', 'in_progress', 'blocked'],
  blocked: ['todo', 'in_progress'], // Blocked must return to In Progress/Todo and go through review before completion
  done: ['todo'], // Done can only be reopened to Todo; cannot jump directly to Blocked
};

/**
 * Checks whether a transition between two statuses is structurally allowed.
 */
export function isAllowedTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Validates a proposed state transition with business guards and payload verification.
 */
export function validateTaskTransition(
  task: Pick<Task, 'status' | 'assigneeId' | 'title'>,
  targetStatus: TaskStatus,
  blockerReason?: string
): TransitionValidationResult {
  const currentStatus = task.status;

  // No-op transition
  if (currentStatus === targetStatus) {
    return { valid: true };
  }

  // Explicit guard: In Progress cannot transition directly to Done (must go through review)
  if (currentStatus === 'in_progress' && targetStatus === 'done') {
    return {
      valid: false,
      error: 'Cannot move task directly from In Progress to Done. Tasks must be submitted for review first.',
      code: 'INVALID_TRANSITION',
    };
  }

  // Explicit guard: Blocked cannot jump directly to Done
  if (currentStatus === 'blocked' && targetStatus === 'done') {
    return {
      valid: false,
      error: 'A blocked task must return to work and go through review before it can be completed.',
      code: 'INVALID_TRANSITION',
    };
  }

  // Explicit guard: Done cannot transition directly to Blocked
  if (currentStatus === 'done' && targetStatus === 'blocked') {
    return {
      valid: false,
      error: 'A completed task cannot transition directly to Blocked. Reopen to Todo first.',
      code: 'DONE_CANNOT_BE_BLOCKED',
    };
  }

  // Check state machine matrix
  if (!isAllowedTransition(currentStatus, targetStatus)) {
    return {
      valid: false,
      error: `Invalid transition from "${currentStatus}" to "${targetStatus}".`,
      code: 'INVALID_TRANSITION',
    };
  }

  // Guard: Transitioning to In Progress requires an assigned team member
  if (targetStatus === 'in_progress' && !task.assigneeId) {
    return {
      valid: false,
      error: 'Cannot start work: Task must have an assignee before moving to In Progress.',
      code: 'ASSIGNEE_REQUIRED',
    };
  }

  // Guard: Any transition to Blocked requires a non-empty blocker reason (minimum 5 characters)
  if (targetStatus === 'blocked') {
    const trimmedReason = blockerReason?.trim() || '';
    if (trimmedReason.length < 5) {
      return {
        valid: false,
        error: 'A detailed blocker reason (at least 5 characters) is required when marking a task Blocked.',
        code: 'BLOCKER_REASON_REQUIRED',
      };
    }
  }

  return { valid: true };
}

/**
 * Validates whether a specific user is authorized to perform a specific target status transition on a task.
 * Enforces server-side RBAC, designated reviewer authority, and the self-review policy.
 */
export function canUserTransitionTask(
  task: Pick<Task, 'status' | 'assigneeId' | 'projectId'> & { reviewerId?: string | null },
  targetStatus: TaskStatus,
  user: UserProfile | null | undefined,
  project?: Pick<Project, 'id' | 'ownerId'> | null
): { allowed: boolean; reason?: string } {
  if (!user) {
    return { allowed: false, reason: 'Authentication required.' };
  }

  if (user.status === 'blocked' || user.status === 'terminated') {
    return { allowed: false, reason: `Your workspace account is ${user.status}. Access has been revoked.` };
  }

  if (user.role === 'viewer') {
    return { allowed: false, reason: 'Viewers have read-only access and cannot change task status.' };
  }

  const currentStatus = task.status;

  // Cannot transition directly from In Progress to Done
  if (currentStatus === 'in_progress' && targetStatus === 'done') {
    return {
      allowed: false,
      reason: 'The assigned member must not be able to move their task directly from In Progress to Done. Submit for review first.',
    };
  }

  // Decision on task in In Review (Approve to Done OR Request Changes to In Progress)
  if (currentStatus === 'in_review') {
    // 1. Self-Review Policy: The assigned member cannot approve their own task
    if (targetStatus === 'done' && task.assigneeId && task.assigneeId === user.uid) {
      return {
        allowed: false,
        reason: 'Self-review policy: The assigned member cannot approve their own task.',
      };
    }

    // 2. Who is authorized to make decisions on an In Review task:
    // - Designated reviewer
    // - Project Lead with permission to manage the project
    // - Workspace Admin
    const isDesignatedReviewer = Boolean(task.reviewerId && task.reviewerId === user.uid);
    const isWorkspaceAdmin = user.role === 'workspace_admin';
    const isProjectLead = user.role === 'project_lead' && (!project || project.id === task.projectId);

    if (!isDesignatedReviewer && !isWorkspaceAdmin && !isProjectLead) {
      return {
        allowed: false,
        reason: 'Only the designated reviewer, Project Lead, or Workspace Admin can make decisions on a task In Review.',
      };
    }

    return { allowed: true };
  }

  // Workspace Admin override for non-in-review transitions
  if (user.role === 'workspace_admin') {
    return { allowed: true };
  }

  // Project Lead permissions
  if (user.role === 'project_lead') {
    return { allowed: true };
  }

  // Member permissions
  if (user.role === 'member') {
    if (!task.assigneeId) {
      return {
        allowed: false,
        reason: 'Unassigned task: Only the Project Lead or Workspace Admin can move unassigned tasks.',
      };
    }
    if (task.assigneeId !== user.uid) {
      return {
        allowed: false,
        reason: 'Permission denied: Members can only drag and move tasks assigned directly to them.',
      };
    }

    // Member can move Todo -> In Progress, In Progress -> In Review, In Progress -> Blocked, Blocked -> In Progress
    if (
      (currentStatus === 'todo' && targetStatus === 'in_progress') ||
      (currentStatus === 'in_progress' && targetStatus === 'in_review') ||
      (currentStatus === 'in_progress' && targetStatus === 'blocked') ||
      (currentStatus === 'todo' && targetStatus === 'blocked') ||
      (currentStatus === 'blocked' && targetStatus === 'in_progress') ||
      (currentStatus === 'blocked' && targetStatus === 'todo')
    ) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Members are not authorized to transition this task from "${currentStatus}" to "${targetStatus}".`,
    };
  }

  return { allowed: false, reason: 'Unauthorized transition.' };
}

/**
 * Evaluates whether a specific user is authorized to drag, drop, or change the status of a task.
 */
export function canUserMoveTask(
  task: Pick<Task, 'assigneeId' | 'projectId'> & { status?: TaskStatus; reviewerId?: string | null },
  user: UserProfile | null | undefined,
  project?: Pick<Project, 'id' | 'ownerId'> | null
): { allowed: boolean; reason?: string } {
  if (!user) {
    return { allowed: false, reason: 'Authentication required.' };
  }

  // Workspace Admin override
  if (user.role === 'workspace_admin') {
    return { allowed: true };
  }

  // Viewers are read-only
  if (user.role === 'viewer') {
    return { allowed: false, reason: 'Viewers have read-only access and cannot move or update tasks.' };
  }

  // Project Lead: Can drag and move any task within the projects they manage
  if (user.role === 'project_lead') {
    if (project && project.id === task.projectId) {
      if (project.ownerId === user.uid) {
        return { allowed: true };
      }
    }
    return { allowed: true };
  }

  // Designated Reviewer can move an in_review task
  if (task.status === 'in_review' && task.reviewerId && task.reviewerId === user.uid) {
    return { allowed: true };
  }

  // Member evaluation
  if (user.role === 'member') {
    // Unassigned tasks: member is not the assigned member
    if (!task.assigneeId) {
      return {
        allowed: false,
        reason: 'Unassigned task: Only the Project Lead or Workspace Admin can move unassigned tasks.',
      };
    }

    // Assigned to this member
    if (task.assigneeId === user.uid) {
      return { allowed: true };
    }

    // Assigned to other members: must not be allowed to move
    return {
      allowed: false,
      reason: 'Permission denied: Members can only drag and move tasks assigned directly to them.',
    };
  }

  return { allowed: false, reason: 'Unauthorized to move this task.' };
}
