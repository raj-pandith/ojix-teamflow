import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToastProvider } from '../../src/hooks/useToast';
import { ProjectDashboard } from '../../src/features/dashboard/ProjectDashboard';
import { UserProfile } from '../../src/types/auth';
import { Project } from '../../src/types/project';
import { storageEngine } from '../../src/services/storageEngine';
import { Task } from '../../src/types/task';

describe('Team Allocation Redesign — Modern SaaS Layout & Interactive Badges', () => {
  const currentUserRaj: UserProfile = {
    uid: 'u-member-raj',
    displayName: 'Raj Pandith',
    email: 'raj@ojix.local',
    role: 'member',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const userLeadSarah: UserProfile = {
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

  const userElenaViewer: UserProfile = {
    uid: 'u-viewer-elena',
    displayName: 'Elena Rostova',
    email: 'elena@ojix.local',
    role: 'viewer',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const testProject: Project = {
    id: 'proj-teamflow-core',
    workspaceId: 'ws-main',
    name: 'OJIX TeamFlow Core Platform',
    objective: 'Re-architect team execution and real-time project observability.',
    status: 'active',
    startDate: '2026-01-01',
    dueDate: '2026-12-31',
    ownerId: 'u-lead-sarah',
    memberIds: ['u-member-raj', 'u-lead-sarah', 'u-member-marcus', 'u-viewer-elena'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  // Sample tasks reflecting real counts:
  // Raj: 4 tasks (2 pending: todo+in_progress, 2 done, 0 blocked)
  // Sarah: 0 tasks
  // Marcus: 5 tasks (0 pending, 5 done, 0 blocked)
  // Elena: 3 tasks (1 pending, 2 done, 0 blocked)
  // Unassigned: 1 blocked task
  // Total tasks: 13 (6 pending, 9 done, 1 blocked? Let's tally: Raj: 2 done, Marcus: 5 done, Elena: 2 done = 9 done; Raj: 2 pending, Elena: 1 pending = 3 pending; Unassigned: 1 blocked = 1 blocked. Total = 13)
  const sampleTasks: Task[] = [
    // Raj tasks
    { id: 't1', workspaceId: 'ws-main', projectId: testProject.id, title: 'Task 1', description: '', assigneeId: 'u-member-raj', priority: 'high', status: 'todo', dueDate: '2026-06-01', createdBy: 'u-lead-sarah', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    { id: 't2', workspaceId: 'ws-main', projectId: testProject.id, title: 'Task 2', description: '', assigneeId: 'u-member-raj', priority: 'medium', status: 'in_progress', dueDate: '2026-06-01', createdBy: 'u-lead-sarah', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    { id: 't3', workspaceId: 'ws-main', projectId: testProject.id, title: 'Task 3', description: '', assigneeId: 'u-member-raj', priority: 'low', status: 'done', dueDate: '2026-06-01', createdBy: 'u-lead-sarah', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    { id: 't4', workspaceId: 'ws-main', projectId: testProject.id, title: 'Task 4', description: '', assigneeId: 'u-member-raj', priority: 'low', status: 'done', dueDate: '2026-06-01', createdBy: 'u-lead-sarah', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },

    // Marcus tasks (5 done)
    { id: 't5', workspaceId: 'ws-main', projectId: testProject.id, title: 'Task 5', description: '', assigneeId: 'u-member-marcus', priority: 'high', status: 'done', dueDate: '2026-06-01', createdBy: 'u-lead-sarah', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    { id: 't6', workspaceId: 'ws-main', projectId: testProject.id, title: 'Task 6', description: '', assigneeId: 'u-member-marcus', priority: 'high', status: 'done', dueDate: '2026-06-01', createdBy: 'u-lead-sarah', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    { id: 't7', workspaceId: 'ws-main', projectId: testProject.id, title: 'Task 7', description: '', assigneeId: 'u-member-marcus', priority: 'high', status: 'done', dueDate: '2026-06-01', createdBy: 'u-lead-sarah', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    { id: 't8', workspaceId: 'ws-main', projectId: testProject.id, title: 'Task 8', description: '', assigneeId: 'u-member-marcus', priority: 'high', status: 'done', dueDate: '2026-06-01', createdBy: 'u-lead-sarah', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    { id: 't9', workspaceId: 'ws-main', projectId: testProject.id, title: 'Task 9', description: '', assigneeId: 'u-member-marcus', priority: 'high', status: 'done', dueDate: '2026-06-01', createdBy: 'u-lead-sarah', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },

    // Elena tasks (1 pending, 2 done)
    { id: 't10', workspaceId: 'ws-main', projectId: testProject.id, title: 'Task 10', description: '', assigneeId: 'u-viewer-elena', priority: 'low', status: 'in_review', dueDate: '2026-06-01', createdBy: 'u-lead-sarah', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    { id: 't11', workspaceId: 'ws-main', projectId: testProject.id, title: 'Task 11', description: '', assigneeId: 'u-viewer-elena', priority: 'low', status: 'done', dueDate: '2026-06-01', createdBy: 'u-lead-sarah', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    { id: 't12', workspaceId: 'ws-main', projectId: testProject.id, title: 'Task 12', description: '', assigneeId: 'u-viewer-elena', priority: 'low', status: 'done', dueDate: '2026-06-01', createdBy: 'u-lead-sarah', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },

    // Unassigned task (blocked)
    { id: 't13', workspaceId: 'ws-main', projectId: testProject.id, title: 'Task 13 Unassigned', description: '', assigneeId: null, priority: 'urgent', status: 'blocked', blockerReason: 'Waiting on design approval', dueDate: '2026-06-01', createdBy: 'u-lead-sarah', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  ];

  beforeEach(() => {
    storageEngine.initialize(true);
    const all = storageEngine.getUsers();
    const testUsers = [currentUserRaj, userLeadSarah, userMarcus, userElenaViewer];
    for (const tu of testUsers) {
      if (!all.some(u => u.uid === tu.uid)) {
        (storageEngine as any).users.push(tu);
      }
    }
  });

  const renderComponent = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

  it('renders Team Allocation header with dynamic counts calculated from actual tasks', () => {
    renderComponent(
      <ProjectDashboard
        project={testProject}
        tasks={sampleTasks}
        currentUser={currentUserRaj}
        onSelectTask={vi.fn()}
        onGoToKanban={vi.fn()}
      />
    );

    // Header title includes member count
    expect(screen.getByText('Team Allocation (4 Members)')).toBeDefined();

    // Summary badges calculate dynamic values: 13 Total, 3 Pending, 9 Done, 1 Blocked
    const summaryBadges = document.querySelector('.team-allocation-summary-badges');
    expect(summaryBadges).toBeDefined();
    expect(summaryBadges?.textContent).toContain('13');
    expect(summaryBadges?.textContent).toContain('Total Tasks');
    expect(summaryBadges?.textContent).toContain('3');
    expect(summaryBadges?.textContent).toContain('Pending');
    expect(summaryBadges?.textContent).toContain('9');
    expect(summaryBadges?.textContent).toContain('Done');
    expect(summaryBadges?.textContent).toContain('1');
    expect(summaryBadges?.textContent).toContain('Blocked');
  });

  it('highlights the currently logged-in user with "You" badge and blue accent border', () => {
    renderComponent(
      <ProjectDashboard
        project={testProject}
        tasks={sampleTasks}
        currentUser={currentUserRaj}
        onSelectTask={vi.fn()}
        onGoToKanban={vi.fn()}
      />
    );

    const rajRow = document.getElementById('team-member-row-u-member-raj');
    expect(rajRow).toBeDefined();
    expect(rajRow?.classList.contains('is-current-user')).toBe(true);

    // Contains "You" badge
    expect(screen.getByText(/You/)).toBeDefined();

    // Current user row does not render a message button to themselves
    const rajMsgBtn = rajRow?.querySelector('.member-msg-btn');
    expect(rajMsgBtn).toBeNull();
  });

  it('renders direct message button for other team members and triggers direct messaging callback', () => {
    const handleOpenDirectMessage = vi.fn();

    renderComponent(
      <ProjectDashboard
        project={testProject}
        tasks={sampleTasks}
        currentUser={currentUserRaj}
        onSelectTask={vi.fn()}
        onGoToKanban={vi.fn()}
        onOpenDirectMessage={handleOpenDirectMessage}
      />
    );

    const marcusRow = document.getElementById('team-member-row-u-member-marcus');
    expect(marcusRow).toBeDefined();
    expect(marcusRow?.classList.contains('is-current-user')).toBe(false);

    const msgBtn = marcusRow?.querySelector('.member-msg-btn') as HTMLButtonElement;
    expect(msgBtn).toBeDefined();

    fireEvent.click(msgBtn);
    expect(handleOpenDirectMessage).toHaveBeenCalledWith('u-member-marcus');
  });

  it('renders interactive task statistic badges and navigates with member and status filters applied', () => {
    const handleNavigateToTasks = vi.fn();

    renderComponent(
      <ProjectDashboard
        project={testProject}
        tasks={sampleTasks}
        currentUser={currentUserRaj}
        onSelectTask={vi.fn()}
        onGoToKanban={vi.fn()}
        onNavigateToTasks={handleNavigateToTasks}
      />
    );

    // Raj has: 4 Total, 2 Pending, 2 Done, 0 Blocked
    const rajRow = document.getElementById('team-member-row-u-member-raj');
    expect(rajRow).toBeDefined();

    const statButtons = rajRow?.querySelectorAll('.stat-badge-btn');
    expect(statButtons?.length).toBe(4);

    // Click "Pending" badge for Raj
    fireEvent.click(statButtons![1]);
    expect(handleNavigateToTasks).toHaveBeenCalledWith({
      assigneeId: 'u-member-raj',
      status: 'pending',
      view: 'list',
    });

    // Click "Done" badge for Raj
    fireEvent.click(statButtons![2]);
    expect(handleNavigateToTasks).toHaveBeenCalledWith({
      assigneeId: 'u-member-raj',
      status: 'done',
      view: 'list',
    });

    // Click "Total" badge for Raj
    fireEvent.click(statButtons![0]);
    expect(handleNavigateToTasks).toHaveBeenCalledWith({
      assigneeId: 'u-member-raj',
      status: 'all',
      view: 'list',
    });
  });

  it('renders unassigned work row when unassigned tasks exist and navigates to unassigned tasks', () => {
    const handleNavigateToTasks = vi.fn();

    renderComponent(
      <ProjectDashboard
        project={testProject}
        tasks={sampleTasks}
        currentUser={currentUserRaj}
        onSelectTask={vi.fn()}
        onGoToKanban={vi.fn()}
        onNavigateToTasks={handleNavigateToTasks}
      />
    );

    const unassignedRow = document.getElementById('unassigned-work-row');
    expect(unassignedRow).toBeDefined();
    expect(screen.getByText('Needs Allocation')).toBeDefined();

    // Click on unassigned Total stat
    const unassignedTotalBtn = unassignedRow?.querySelector('.stat-badge-btn') as HTMLButtonElement;
    fireEvent.click(unassignedTotalBtn);
    expect(handleNavigateToTasks).toHaveBeenCalledWith({
      assigneeId: 'unassigned',
      status: 'all',
      view: 'list',
    });
  });

  it('filters team members using member search input and role filter buttons', () => {
    renderComponent(
      <ProjectDashboard
        project={testProject}
        tasks={sampleTasks}
        currentUser={currentUserRaj}
        onSelectTask={vi.fn()}
        onGoToKanban={vi.fn()}
      />
    );

    // Initially all 4 members are rendered
    expect(document.getElementById('team-member-row-u-member-raj')).toBeDefined();
    expect(document.getElementById('team-member-row-u-lead-sarah')).toBeDefined();
    expect(document.getElementById('team-member-row-u-member-marcus')).toBeDefined();
    expect(document.getElementById('team-member-row-u-viewer-elena')).toBeDefined();

    // Search for "Marcus"
    const searchInput = screen.getByLabelText('Search team member by name or role');
    fireEvent.change(searchInput, { target: { value: 'Marcus' } });

    expect(document.getElementById('team-member-row-u-member-marcus')).not.toBeNull();
    expect(document.getElementById('team-member-row-u-lead-sarah')).toBeNull();
    expect(document.getElementById('team-member-row-u-viewer-elena')).toBeNull();

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } });

    // Click "Viewers" filter button
    const viewersBtn = document.getElementById('filter-viewers-only-btn') || screen.getByText('Viewers');
    fireEvent.click(viewersBtn);

    // Only Elena should be rendered
    expect(document.getElementById('team-member-row-u-viewer-elena')).not.toBeNull();
    expect(document.getElementById('team-member-row-u-member-marcus')).toBeNull();
    expect(document.getElementById('team-member-row-u-member-raj')).toBeNull();

    // Click "Members" filter button
    const membersBtn = document.getElementById('filter-members-only-btn') || screen.getByText('Members');
    fireEvent.click(membersBtn);

    expect(document.getElementById('team-member-row-u-viewer-elena')).toBeNull();
    expect(document.getElementById('team-member-row-u-member-marcus')).not.toBeNull();
  });
});
