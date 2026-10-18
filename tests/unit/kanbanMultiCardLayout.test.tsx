import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { KanbanBoard } from '../../src/features/tasks/KanbanBoard';
import { UserProfile } from '../../src/types/auth';
import { Project } from '../../src/types/project';
import { storageEngine } from '../../src/services/storageEngine';
import { Task, TaskStatus } from '../../src/types/task';

describe('Kanban Board — Multi-Card Layout & Naturally Expanding Columns (Linear/Jira Redesign)', () => {
  const adminUser: UserProfile = {
    uid: 'u-admin-alex',
    displayName: 'Alex Morgan',
    email: 'alex@ojix.local',
    role: 'workspace_admin',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const memberMarcus: UserProfile = {
    uid: 'u-member-marcus',
    displayName: 'Marcus Vance',
    email: 'marcus@ojix.local',
    role: 'member',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const testProject: Project = {
    id: 'proj-multicard-test',
    workspaceId: 'ws-multicard',
    name: 'Multi-Card Layout Test',
    objective: 'Test natural column expansion and accessible cards without per-column scrollbars',
    ownerId: adminUser.uid,
    status: 'active',
    startDate: '2026-10-01',
    dueDate: '2026-12-31',
    memberIds: [adminUser.uid, memberMarcus.uid],
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };

  beforeEach(() => {
    storageEngine.initialize(true);
    const all = storageEngine.getUsers();
    for (const u of [adminUser, memberMarcus]) {
      if (!all.some(existing => existing.uid === u.uid)) {
        (storageEngine as any).users.push(u);
      }
    }
  });

  const generateTasksForColumn = (count: number, status: TaskStatus = 'todo'): Task[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `task-${status}-${i + 1}`,
      workspaceId: 'ws-multicard',
      projectId: testProject.id,
      title: `Task #${i + 1} in ${status} column`,
      description: `Detailed description for task #${i + 1}`,
      status,
      priority: (['low', 'medium', 'high', 'urgent'] as const)[i % 4],
      assigneeId: i % 2 === 0 ? memberMarcus.uid : null,
      createdBy: adminUser.uid,
      dueDate: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`,
      milestoneId: i % 3 === 0 ? 'M1-Core' : undefined,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    }));
  };

  it('1. Renders 1 card cleanly in a column with polished typography and badges', () => {
    const tasks = generateTasksForColumn(1, 'todo');
    const { container } = render(
      <KanbanBoard
        tasks={tasks}
        canMutate={true}
        currentUser={memberMarcus}
        project={testProject}
        onTransitionStatus={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    const todoCol = container.querySelector('.kanban-column.col-todo');
    expect(todoCol).not.toBeNull();

    const cards = todoCol?.querySelectorAll('.task-card');
    expect(cards?.length).toBe(1);

    const card = cards?.[0];
    expect(card?.querySelector('.task-card-title')?.textContent).toBe('Task #1 in todo column');
    expect(card?.querySelector('.task-card-badges-row')).not.toBeNull();
    expect(card?.querySelector('.task-card-footer')).not.toBeNull();
  });

  it('2. Renders 5 cards in a column without truncation or clipping', () => {
    const tasks = generateTasksForColumn(5, 'in_progress');
    const { container } = render(
      <KanbanBoard
        tasks={tasks}
        canMutate={true}
        currentUser={memberMarcus}
        project={testProject}
        onTransitionStatus={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    const progCol = container.querySelector('.kanban-column.col-in_progress');
    const cards = progCol?.querySelectorAll('.task-card');
    expect(cards?.length).toBe(5);

    // Each card is distinct and interactive
    cards?.forEach((card, idx) => {
      expect(card.getAttribute('data-task-id')).toBe(`task-in_progress-${idx + 1}`);
      expect(card.getAttribute('role')).toBe('button');
    });
  });

  it('3. Renders 10 cards in a column with natural vertical expansion and accessible cards', () => {
    const tasks = generateTasksForColumn(10, 'blocked');
    const { container } = render(
      <KanbanBoard
        tasks={tasks}
        canMutate={true}
        currentUser={memberMarcus}
        project={testProject}
        onTransitionStatus={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    const blockedCol = container.querySelector('.kanban-column.col-blocked');
    const cards = blockedCol?.querySelectorAll('.task-card');
    expect(cards?.length).toBe(10);

    const countBadge = blockedCol?.querySelector('.column-count-badge');
    expect(countBadge?.textContent).toBe('10');
  });

  it('4. Renders 25+ cards in a single column without nested scrolling, preserving accessibility', () => {
    const tasks = generateTasksForColumn(25, 'todo');
    const { container } = render(
      <KanbanBoard
        tasks={tasks}
        canMutate={true}
        currentUser={memberMarcus}
        project={testProject}
        onTransitionStatus={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    const todoCol = container.querySelector('.kanban-column.col-todo');
    const cardsList = todoCol?.querySelector('.kanban-cards-list');
    expect(cardsList).not.toBeNull();

    const cards = cardsList?.querySelectorAll('.task-card');
    expect(cards?.length).toBe(25);

    // Verify all 25 cards are mounted and accessible in the DOM
    expect(cardsList?.querySelector('#task-card-task-todo-1')).not.toBeNull();
    expect(cardsList?.querySelector('#task-card-task-todo-25')).not.toBeNull();

    // Verify count badge shows 25
    expect(todoCol?.querySelector('.column-count-badge')?.textContent).toBe('25');
  });

  it('5. Distributes heavily populated tasks across multiple columns while keeping columns aligned', () => {
    const allTasks: Task[] = [
      ...generateTasksForColumn(8, 'todo'),
      ...generateTasksForColumn(12, 'in_progress'),
      ...generateTasksForColumn(3, 'blocked'),
      ...generateTasksForColumn(5, 'in_review'),
      ...generateTasksForColumn(15, 'done'),
    ];

    const { container } = render(
      <KanbanBoard
        tasks={allTasks}
        canMutate={true}
        currentUser={memberMarcus}
        project={testProject}
        onTransitionStatus={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    // Verify total stats chip
    const totalStat = container.querySelector('.chip-total .stat-chip-value');
    expect(totalStat?.textContent).toBe('43');

    // Verify all 5 columns render their exact counts
    expect(container.querySelector('.col-todo .column-count-badge')?.textContent).toBe('8');
    expect(container.querySelector('.col-in_progress .column-count-badge')?.textContent).toBe('12');
    expect(container.querySelector('.col-blocked .column-count-badge')?.textContent).toBe('3');
    expect(container.querySelector('.col-in_review .column-count-badge')?.textContent).toBe('5');
    expect(container.querySelector('.col-done .column-count-badge')?.textContent).toBe('15');
  });

  it('6. Empty column displays polished empty dropzone state', () => {
    const tasks = generateTasksForColumn(3, 'todo');
    const { container } = render(
      <KanbanBoard
        tasks={tasks}
        canMutate={true}
        currentUser={memberMarcus}
        project={testProject}
        onTransitionStatus={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    const doneCol = container.querySelector('.col-done');
    const dropzone = doneCol?.querySelector('.kanban-empty-dropzone');
    expect(dropzone).not.toBeNull();
    expect(dropzone?.textContent).toContain('No tasks in Done');
  });

  it('7. Preserves drag-and-drop permissions across heavily populated columns', () => {
    const tasks = generateTasksForColumn(20, 'todo');
    const { container } = render(
      <KanbanBoard
        tasks={tasks}
        canMutate={true}
        currentUser={memberMarcus}
        project={testProject}
        onTransitionStatus={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    // Marcus tasks (even indices) are draggable
    const marcusCard = container.querySelector('#task-card-task-todo-1') as HTMLElement;
    expect(marcusCard?.getAttribute('draggable')).toBe('true');
    expect(marcusCard?.classList.contains('task-card-my-task')).toBe(true);

    // Unassigned tasks (odd indices) are not draggable by member
    const unassignedCard = container.querySelector('#task-card-task-todo-2') as HTMLElement;
    expect(unassignedCard?.getAttribute('draggable')).toBe('false');
    expect(unassignedCard?.classList.contains('task-card-my-task')).toBe(false);
  });
});
