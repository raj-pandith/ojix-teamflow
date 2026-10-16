import { describe, it, expect } from 'vitest';
import {
  isAllowedTransition,
  validateTaskTransition,
  canUserMoveTask,
} from '../../src/domain/taskStateMachine';
import { Task } from '../../src/types/task';
import { UserProfile } from '../../src/types/auth';
import { Project } from '../../src/types/project';

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

describe('canUserMoveTask authorization rules', () => {
  const memberMarcus: UserProfile = {
    uid: 'user-member-marcus',
    email: 'marcus@ojix.local',
    displayName: 'Marcus Vance',
    role: 'member',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const otherMemberDavid: UserProfile = {
    uid: 'user-member-david',
    email: 'david@ojix.local',
    displayName: 'David Kim',
    role: 'member',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const leadSarah: UserProfile = {
    uid: 'user-lead-sarah',
    email: 'sarah@ojix.local',
    displayName: 'Sarah Chen',
    role: 'project_lead',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const adminAlex: UserProfile = {
    uid: 'user-admin-alex',
    email: 'alex@ojix.local',
    displayName: 'Alex Morgan',
    role: 'workspace_admin',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const viewerElena: UserProfile = {
    uid: 'user-viewer-elena',
    email: 'elena@ojix.local',
    displayName: 'Elena Rostova',
    role: 'viewer',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const project: Pick<Project, 'id' | 'ownerId'> = {
    id: 'proj-infra-01',
    ownerId: 'user-lead-sarah',
  };

  const marcusAssignedTask = {
    id: 'task-1',
    projectId: 'proj-infra-01',
    assigneeId: 'user-member-marcus',
  };

  const unassignedTask = {
    id: 'task-2',
    projectId: 'proj-infra-01',
    assigneeId: null,
  };

  it('Assigned Task Member: Can drag and move tasks assigned to them', () => {
    const result = canUserMoveTask(marcusAssignedTask, memberMarcus, project);
    expect(result.allowed).toBe(true);
  });

  it('Other Project Members: Must not be allowed to drag, drop, or change status of tasks assigned to others', () => {
    const result = canUserMoveTask(marcusAssignedTask, otherMemberDavid, project);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Members can only drag and move tasks assigned directly to them/);
  });

  it('Unassigned Members: Must not be allowed to move unassigned tasks', () => {
    const result = canUserMoveTask(unassignedTask, memberMarcus, project);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Only the Project Lead or Workspace Admin can move unassigned tasks/);
  });

  it('Project Lead: Can drag and move any task within projects they manage, regardless of assignee', () => {
    // Lead moving Marcus's task
    expect(canUserMoveTask(marcusAssignedTask, leadSarah, project).allowed).toBe(true);
    // Lead moving unassigned task
    expect(canUserMoveTask(unassignedTask, leadSarah, project).allowed).toBe(true);
  });

  it('Workspace Admin: Can override these restrictions with administrative permissions', () => {
    // Admin moving Marcus's task
    expect(canUserMoveTask(marcusAssignedTask, adminAlex, project).allowed).toBe(true);
    // Admin moving unassigned task
    expect(canUserMoveTask(unassignedTask, adminAlex, project).allowed).toBe(true);
  });

  it('Viewer: Must not be allowed to move any task', () => {
    expect(canUserMoveTask(marcusAssignedTask, viewerElena, project).allowed).toBe(false);
    expect(canUserMoveTask(unassignedTask, viewerElena, project).allowed).toBe(false);
  });
});
