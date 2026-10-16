import { describe, it, expect } from 'vitest';
import {
  isAllowedTransition,
  validateTaskTransition,
} from '../../src/domain/taskStateMachine';
import { Task } from '../../src/types/task';

describe('taskStateMachine domain logic', () => {
  const baseTask: Pick<Task, 'status' | 'assigneeId' | 'title'> = {
    status: 'todo',
    assigneeId: 'user-123',
    title: 'Test task',
  };

  it('allows valid normal progression transitions', () => {
    expect(isAllowedTransition('backlog', 'todo')).toBe(true);
    expect(isAllowedTransition('todo', 'in_progress')).toBe(true);
    expect(isAllowedTransition('in_progress', 'in_review')).toBe(true);
    expect(isAllowedTransition('in_review', 'done')).toBe(true);
  });

  it('allows reopening a Done task to Todo', () => {
    expect(isAllowedTransition('done', 'todo')).toBe(true);
  });

  it('strictly rejects jumping directly from Done to Blocked', () => {
    expect(isAllowedTransition('done', 'blocked')).toBe(false);

    const result = validateTaskTransition({ ...baseTask, status: 'done' }, 'blocked');
    expect(result.valid).toBe(false);
    expect(result.code).toBe('DONE_CANNOT_BE_BLOCKED');
  });

  it('requires a detailed blocker reason (>= 5 chars) when transitioning to Blocked', () => {
    // Missing reason
    const emptyResult = validateTaskTransition(
      { ...baseTask, status: 'in_progress' },
      'blocked',
      ''
    );
    expect(emptyResult.valid).toBe(false);
    expect(emptyResult.code).toBe('BLOCKER_REASON_REQUIRED');

    // Too short reason (< 5 chars)
    const shortResult = validateTaskTransition(
      { ...baseTask, status: 'in_progress' },
      'blocked',
      'Wait'
    );
    expect(shortResult.valid).toBe(false);
    expect(shortResult.code).toBe('BLOCKER_REASON_REQUIRED');

    // Valid reason
    const validResult = validateTaskTransition(
      { ...baseTask, status: 'in_progress' },
      'blocked',
      'Awaiting database credentials from DevOps team'
    );
    expect(validResult.valid).toBe(true);
  });

  it('requires an assignee before moving from Todo to In Progress', () => {
    const unassignedTask: Pick<Task, 'status' | 'assigneeId' | 'title'> = {
      status: 'todo',
      assigneeId: null,
      title: 'Unassigned task',
    };

    const result = validateTaskTransition(unassignedTask, 'in_progress');
    expect(result.valid).toBe(false);
    expect(result.code).toBe('ASSIGNEE_REQUIRED');
  });
});
