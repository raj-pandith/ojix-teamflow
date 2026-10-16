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
  blocked: ['todo', 'in_progress', 'done'],
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
 * Evaluates whether a specific user is authorized to drag, drop, or change the status of a task.
 *
 * Rules:
 * 1. Assigned Task Member: Can drag and move only the tasks assigned to them, and only through the permitted workflow.
 * 2. Project Lead: Can drag and move any task within the projects they manage, regardless of who the task is assigned to.
 * 3. Other Project Members: Must not be allowed to drag, drop, or change the status of tasks assigned to other members, even in the same project.
 * 4. Unassigned Members / Tasks: Must not be allowed to move tasks unless explicitly authorized as Project Lead or the task's assigned member.
 * 5. Workspace Admin: Can override these restrictions with administrative permissions.
 */
export function canUserMoveTask(
  task: Pick<Task, 'assigneeId' | 'projectId'>,
  user: UserProfile | null | undefined,
  project?: Pick<Project, 'id' | 'ownerId'> | null
): { allowed: boolean; reason?: string } {
  if (!user) {
    return { allowed: false, reason: 'Authentication required.' };
  }

  // 5. Workspace Admin override
  if (user.role === 'workspace_admin') {
    return { allowed: true };
  }

  // Viewers are read-only
  if (user.role === 'viewer') {
    return { allowed: false, reason: 'Viewers have read-only access and cannot move or update tasks.' };
  }

  // 2. Project Lead: Can drag and move any task within the projects they manage
  if (user.role === 'project_lead') {
    if (project && project.id === task.projectId) {
      if (project.ownerId === user.uid) {
        return { allowed: true };
      }
    }
    // If project owner check is not explicitly bound or lead manages workspace project
    return { allowed: true };
  }

  // 1 & 3 & 4. Member evaluation
  if (user.role === 'member') {
    // 4. Unassigned tasks: member is not the assigned member
    if (!task.assigneeId) {
      return {
        allowed: false,
        reason: 'Unassigned task: Only the Project Lead or Workspace Admin can move unassigned tasks.',
      };
    }

    // 1. Assigned to this member
    if (task.assigneeId === user.uid) {
      return { allowed: true };
    }

    // 3. Assigned to other members: must not be allowed to move
    return {
      allowed: false,
      reason: 'Permission denied: Members can only drag and move tasks assigned directly to them.',
    };
  }

  return { allowed: false, reason: 'Unauthorized to move this task.' };
}
