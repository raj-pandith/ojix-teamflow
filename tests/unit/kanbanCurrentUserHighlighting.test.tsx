import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { KanbanBoard } from '../../src/features/tasks/KanbanBoard';
import { canUserMoveTask } from '../../src/domain/taskStateMachine';
import { UserProfile } from '../../src/types/auth';
import { Project } from '../../src/types/project';
import { storageEngine } from '../../src/services/storageEngine';
import { Task, TaskStatus } from '../../src/types/task';

describe('Kanban Board — Current User Task Visibility & Security Verification', () => {
  const userLead: UserProfile = {
    uid: 'u-lead-sarah',
    displayName: 'Sarah Chen',
    email: 'sarah@ojix.local',
    role: 'project_lead',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const userMarcus: UserProfile = {
    uid: 'u-member-marcus',
    displayName: 'Marcus Vance',
    email: 'marcus@ojix.local',
    role: 'member',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const userDavid: UserProfile = {
    uid: 'u-member-david',
    displayName: 'David Kim',
    email: 'david@ojix.local',
    role: 'member',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const userElenaViewer: UserProfile = {
    uid: 'u-viewer-elena',
    displayName: 'Elena Rostova',
    email: 'elena@ojix.local',
    role: 'viewer',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    storageEngine.initialize(true);
    const all = storageEngine.getUsers();
    const testUsers = [userLead, userMarcus, userDavid, userElenaViewer];
    for (const tu of testUsers) {
      if (!all.some(u => u.uid === tu.uid)) {
        (storageEngine as any).users.push(tu);
      }
    }
  });

  const testProject: Project = {
    id: 'proj-visibility-test',
    workspaceId: 'ws-test',
    name: 'Kanban Visibility Project',
    objective: 'Test user card distinction and lock icon removal',
    ownerId: userLead.uid,
    status: 'active',
    startDate: '2026-10-01',
    dueDate: '2026-11-30',
    memberIds: [userLead.uid, userMarcus.uid, userDavid.uid, userElenaViewer.uid],
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };

  const createSampleTask = (id: string, title: string, status: TaskStatus, assigneeId: string | null): Task => ({
    id,
    workspaceId: 'ws-test',
    projectId: testProject.id,
    title,
    description: `Description for ${title}`,
    status,
    priority: 'medium',
    assigneeId,
    createdBy: userLead.uid,
    dueDate: '2026-10-31',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  });

  const sampleTasks: Task[] = [
    createSampleTask('task-todo-marcus', 'Marcus Todo Task', 'todo', userMarcus.uid),
    createSampleTask('task-prog-marcus', 'Marcus In Progress Task', 'in_progress', userMarcus.uid),
    createSampleTask('task-block-marcus', 'Marcus Blocked Task', 'blocked', userMarcus.uid),
    createSampleTask('task-review-marcus', 'Marcus In Review Task', 'in_review', userMarcus.uid),
    createSampleTask('task-done-marcus', 'Marcus Done Task', 'done', userMarcus.uid),
    createSampleTask('task-todo-david', 'David Todo Task', 'todo', userDavid.uid),
    createSampleTask('task-todo-unassigned', 'Unassigned Backlog Task', 'todo', null),
  ];

  it('1. Highlights task cards assigned to the logged-in user with distinct class and badge', () => {
    const { container } = render(
      <KanbanBoard
        tasks={sampleTasks}
        canMutate={true}
        currentUser={userMarcus}
        project={testProject}
        onTransitionStatus={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    // Marcus's tasks must be highlighted
    const marcusCard = container.querySelector('#task-card-task-todo-marcus');
    expect(marcusCard).not.toBeNull();
    expect(marcusCard?.classList.contains('task-card-my-task')).toBe(true);
    expect(marcusCard?.getAttribute('data-my-task')).toBe('true');

    // Should render the accessible "My Task" badge
    const badge = marcusCard?.querySelector('.task-my-task-badge');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('My Task');

    // Should label assignee with (You)
    expect(marcusCard?.textContent).toContain('(You)');
  });

  it('2. Keeps other users tasks in existing style without highlight class or badge', () => {
    const { container } = render(
      <KanbanBoard
        tasks={sampleTasks}
        canMutate={true}
        currentUser={userMarcus}
        project={testProject}
        onTransitionStatus={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    // David's task must NOT be highlighted when logged in as Marcus
    const davidCard = container.querySelector('#task-card-task-todo-david');
    expect(davidCard).not.toBeNull();
    expect(davidCard?.classList.contains('task-card-my-task')).toBe(false);
    expect(davidCard?.getAttribute('data-my-task')).toBe('false');
    expect(davidCard?.querySelector('.task-my-task-badge')).toBeNull();
    expect(davidCard?.textContent).not.toContain('(You)');
  });

  it('3. Keeps unassigned tasks in existing neutral style without highlight', () => {
    const { container } = render(
      <KanbanBoard
        tasks={sampleTasks}
        canMutate={true}
        currentUser={userMarcus}
        project={testProject}
        onTransitionStatus={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    const unassignedCard = container.querySelector('#task-card-task-todo-unassigned');
    expect(unassignedCard).not.toBeNull();
    expect(unassignedCard?.classList.contains('task-card-my-task')).toBe(false);
    expect(unassignedCard?.getAttribute('data-my-task')).toBe('false');
    expect(unassignedCard?.querySelector('.task-my-task-badge')).toBeNull();
    expect(unassignedCard?.textContent).toContain('Unassigned');
  });

  it('4. Removes unnecessary lock icons from other users task cards', () => {
    const { container } = render(
      <KanbanBoard
        tasks={sampleTasks}
        canMutate={true}
        currentUser={userMarcus}
        project={testProject}
        onTransitionStatus={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    // No lock icons or lock indicator spans should exist anywhere on the board
    const lockIndicators = container.querySelectorAll('.task-lock-indicator');
    expect(lockIndicators.length).toBe(0);

    const cards = container.querySelectorAll('.task-card');
    cards.forEach(card => {
      expect(card.textContent).not.toContain('🔒');
    });
  });

  it('5. Consistently highlights current user tasks across all 5 Kanban columns', () => {
    const { container } = render(
      <KanbanBoard
        tasks={sampleTasks}
        canMutate={true}
        currentUser={userMarcus}
        project={testProject}
        onTransitionStatus={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    const marcusColumnCardIds = [
      'task-card-task-todo-marcus',
      'task-card-task-prog-marcus',
      'task-card-task-block-marcus',
      'task-card-task-review-marcus',
      'task-card-task-done-marcus',
    ];

    marcusColumnCardIds.forEach(cardId => {
      const card = container.querySelector(`#${cardId}`);
      expect(card, `Card ${cardId} should exist`).not.toBeNull();
      expect(card?.classList.contains('task-card-my-task'), `Card ${cardId} should have task-card-my-task`).toBe(true);
      expect(card?.getAttribute('data-my-task'), `Card ${cardId} should have data-my-task="true"`).toBe('true');
      expect(card?.querySelector('.task-my-task-badge'), `Card ${cardId} should have My Task badge`).not.toBeNull();
    });
  });

  it('6. Uses actual ownership data (currentUser.uid and assigneeId) dynamically when switching users', () => {
    // When logged in as Marcus: Marcus is highlighted, David is not
    const { container: marcusView, unmount } = render(
      <KanbanBoard
        tasks={sampleTasks}
        canMutate={true}
        currentUser={userMarcus}
        project={testProject}
        onTransitionStatus={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    expect(marcusView.querySelector('#task-card-task-todo-marcus')?.classList.contains('task-card-my-task')).toBe(true);
    expect(marcusView.querySelector('#task-card-task-todo-david')?.classList.contains('task-card-my-task')).toBe(false);

    unmount();

    // When logged in as David: David is highlighted, Marcus is not
    const { container: davidView } = render(
      <KanbanBoard
        tasks={sampleTasks}
        canMutate={true}
        currentUser={userDavid}
        project={testProject}
        onTransitionStatus={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    expect(davidView.querySelector('#task-card-task-todo-marcus')?.classList.contains('task-card-my-task')).toBe(false);
    expect(davidView.querySelector('#task-card-task-todo-david')?.classList.contains('task-card-my-task')).toBe(true);
  });

  it('7. Preserves security and RBAC: non-assignee members cannot drag other users cards', () => {
    const { container } = render(
      <KanbanBoard
        tasks={sampleTasks}
        canMutate={true}
        currentUser={userMarcus}
        project={testProject}
        onTransitionStatus={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    // Marcus can drag their own task
    const myCard = container.querySelector('#task-card-task-todo-marcus') as HTMLElement;
    expect(myCard?.getAttribute('draggable')).toBe('true');

    // Marcus CANNOT drag David's task
    const otherCard = container.querySelector('#task-card-task-todo-david') as HTMLElement;
    expect(otherCard?.getAttribute('draggable')).toBe('false');

    // Marcus CANNOT drag unassigned task
    const unassignedCard = container.querySelector('#task-card-task-todo-unassigned') as HTMLElement;
    expect(unassignedCard?.getAttribute('draggable')).toBe('false');

    // Verify task state machine move permission logic explicitly
    const davidTask = sampleTasks.find(t => t.id === 'task-todo-david')!;
    const marcusPermission = canUserMoveTask(davidTask, userMarcus, testProject);
    expect(marcusPermission.allowed).toBe(false);
    expect(marcusPermission.reason).toContain('Members can only drag and move tasks assigned directly to them');
  });

  it('8. Preserves security and RBAC: Viewers cannot drag any task cards', () => {
    const { container } = render(
      <KanbanBoard
        tasks={sampleTasks}
        canMutate={false} // Viewers have canMutate: false
        currentUser={userElenaViewer}
        project={testProject}
        onTransitionStatus={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    const allCards = container.querySelectorAll('.task-card');
    expect(allCards.length).toBeGreaterThan(0);
    allCards.forEach(card => {
      expect(card.getAttribute('draggable')).toBe('false');
    });

    const marcusTask = sampleTasks.find(t => t.id === 'task-todo-marcus')!;
    const viewerPermission = canUserMoveTask(marcusTask, userElenaViewer, testProject);
    expect(viewerPermission.allowed).toBe(false);
    expect(viewerPermission.reason).toContain('Viewers have read-only access');
  });
});
