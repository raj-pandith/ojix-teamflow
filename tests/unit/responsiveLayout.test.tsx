import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Topbar } from '../../src/components/layout/Topbar';
import { Sidebar } from '../../src/components/layout/Sidebar';
import { KanbanBoard } from '../../src/features/tasks/KanbanBoard';
import { ToastProvider } from '../../src/hooks/useToast';
import { AuthProvider } from '../../src/hooks/useAuth';
import { UserProfile } from '../../src/types/auth';
import { Project } from '../../src/types/project';
import { Task } from '../../src/types/task';

const mockAdminUser: UserProfile = {
  uid: 'usr-admin-1',
  displayName: 'Sarah Chen',
  email: 'sarah.chen@ojix.local',
  role: 'workspace_admin',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const mockProject: Project = {
  id: 'proj-1',
  workspaceId: 'ws-default',
  name: 'Mobile Core Rollout',
  objective: 'Deliver responsive mobile design across all viewports',
  status: 'active',
  startDate: '2026-10-01',
  dueDate: '2026-11-01',
  ownerId: 'usr-admin-1',
  memberIds: ['usr-admin-1'],
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

const mockTasks: Task[] = [
  {
    id: 'task-1',
    workspaceId: 'ws-default',
    projectId: 'proj-1',
    title: 'Implement mobile hamburger drawer',
    description: 'Ensure smooth navigation on small screens',
    status: 'in_progress',
    priority: 'high',
    assigneeId: 'usr-admin-1',
    createdBy: 'usr-admin-1',
    dueDate: '2026-10-25',
    createdAt: '2026-10-10T00:00:00Z',
    updatedAt: '2026-10-10T00:00:00Z',
  },
  {
    id: 'task-2',
    workspaceId: 'ws-default',
    projectId: 'proj-1',
    title: 'Audit touch target minimums',
    description: 'Ensure all buttons meet 44px minimum touch targets',
    status: 'todo',
    priority: 'medium',
    assigneeId: 'usr-admin-1',
    createdBy: 'usr-admin-1',
    dueDate: '2026-10-28',
    createdAt: '2026-10-11T00:00:00Z',
    updatedAt: '2026-10-11T00:00:00Z',
  },
];

describe('Responsive Design Architecture Tests', () => {
  describe('Topbar Mobile Responsiveness', () => {
    it('renders the hamburger toggle button when onToggleMobileNav is provided', () => {
      const toggleFn = vi.fn();
      render(
        <ToastProvider>
          <AuthProvider>
            <Topbar
              onOpenTriage={vi.fn()}
              onOpenNewTask={vi.fn()}
              canMutate={true}
              onToggleMobileNav={toggleFn}
            />
          </AuthProvider>
        </ToastProvider>
      );

      const toggleBtn = screen.getByLabelText(/toggle navigation menu/i);
      expect(toggleBtn).toBeTruthy();

      fireEvent.click(toggleBtn);
      expect(toggleFn).toHaveBeenCalledTimes(1);
    });

    it('renders responsive mobile workspace title branding', () => {
      render(
        <ToastProvider>
          <AuthProvider>
            <Topbar
              onOpenTriage={vi.fn()}
              onOpenNewTask={vi.fn()}
              canMutate={true}
            />
          </AuthProvider>
        </ToastProvider>
      );

      expect(screen.getByText('OJIX TeamFlow Workspace')).toBeTruthy();
      expect(screen.getByText('OJIX TeamFlow')).toBeTruthy();
    });
  });

  describe('Sidebar Mobile Drawer Behavior', () => {
    it('applies mobile-open class and renders backdrop when isMobileOpen is true', () => {
      const closeFn = vi.fn();
      const { container } = render(
        <Sidebar
          currentTab="kanban"
          onSelectTab={vi.fn()}
          projects={[mockProject]}
          activeProjectId="proj-1"
          onSelectProject={vi.fn()}
          onOpenNewProject={vi.fn()}
          currentUser={mockAdminUser}
          isMobileOpen={true}
          onCloseMobile={closeFn}
        />
      );

      const sidebarEl = container.querySelector('.sidebar');
      expect(sidebarEl?.classList.contains('mobile-open')).toBe(true);

      const backdropEl = container.querySelector('.sidebar-mobile-backdrop');
      expect(backdropEl).toBeTruthy();

      // Clicking backdrop calls onCloseMobile
      fireEvent.click(backdropEl!);
      expect(closeFn).toHaveBeenCalledTimes(1);
    });

    it('calls onCloseMobile when a navigation tab is selected on mobile', () => {
      const selectTabFn = vi.fn();
      const closeFn = vi.fn();

      render(
        <Sidebar
          currentTab="kanban"
          onSelectTab={selectTabFn}
          projects={[mockProject]}
          activeProjectId="proj-1"
          onSelectProject={vi.fn()}
          onOpenNewProject={vi.fn()}
          currentUser={mockAdminUser}
          isMobileOpen={true}
          onCloseMobile={closeFn}
        />
      );

      const dashboardTab = screen.getByText('Dashboard');
      fireEvent.click(dashboardTab);

      expect(selectTabFn).toHaveBeenCalledWith('dashboard');
      expect(closeFn).toHaveBeenCalledTimes(1);
    });

    it('renders a mobile close button that triggers onCloseMobile', () => {
      const closeFn = vi.fn();

      render(
        <Sidebar
          currentTab="kanban"
          onSelectTab={vi.fn()}
          projects={[mockProject]}
          activeProjectId="proj-1"
          onSelectProject={vi.fn()}
          onOpenNewProject={vi.fn()}
          currentUser={mockAdminUser}
          isMobileOpen={true}
          onCloseMobile={closeFn}
        />
      );

      const closeBtn = screen.getByLabelText(/close sidebar navigation/i);
      expect(closeBtn).toBeTruthy();

      fireEvent.click(closeBtn);
      expect(closeFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Kanban Mobile Column Quick-Selector Tabs', () => {
    it('renders mobile column switcher tabs with counts', () => {
      render(
        <KanbanBoard
          tasks={mockTasks}
          canMutate={true}
          currentUser={mockAdminUser}
          project={mockProject}
          onTransitionStatus={vi.fn()}
          onDeleteTask={vi.fn()}
        />
      );

      expect(screen.getByText(/All Columns \(2\)/i)).toBeTruthy();
      expect(screen.getByText(/In Progress \(1\)/i)).toBeTruthy();
      expect(screen.getByText(/To Do \(1\)/i)).toBeTruthy();
    });

    it('filters column visibility when a mobile column tab is clicked', () => {
      const { container } = render(
        <KanbanBoard
          tasks={mockTasks}
          canMutate={true}
          currentUser={mockAdminUser}
          project={mockProject}
          onTransitionStatus={vi.fn()}
          onDeleteTask={vi.fn()}
        />
      );

      // Click "In Progress" tab
      const inProgressTab = screen.getByText(/In Progress \(1\)/i);
      fireEvent.click(inProgressTab);

      // The grid should have 'has-single-active-column'
      const grid = container.querySelector('.kanban-grid');
      expect(grid?.classList.contains('has-single-active-column')).toBe(true);

      // The todo column should have 'kanban-col-mobile-hidden'
      const todoCol = container.querySelector('.kanban-column.col-todo');
      expect(todoCol?.classList.contains('kanban-col-mobile-hidden')).toBe(true);

      // The in_progress column should NOT have 'kanban-col-mobile-hidden'
      const inProgCol = container.querySelector('.kanban-column.col-in_progress');
      expect(inProgCol?.classList.contains('kanban-col-mobile-hidden')).toBe(false);

      // Clicking 'All Columns' restores all
      const allTab = screen.getByText(/All Columns/i);
      fireEvent.click(allTab);
      expect(grid?.classList.contains('has-single-active-column')).toBe(false);
      expect(todoCol?.classList.contains('kanban-col-mobile-hidden')).toBe(false);
    });
  });
});
