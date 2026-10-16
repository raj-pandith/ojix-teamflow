import { TaskStatus, Task } from '../types/task';

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
