export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'blocked';

export interface Task {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly title: string;
  readonly description: string;
  readonly assigneeId: string | null;
  readonly priority: TaskPriority;
  readonly status: TaskStatus;
  readonly blockerReason?: string;
  readonly dueDate: string; // ISO date 'YYYY-MM-DD'
  readonly milestoneId?: string;
  readonly dependencies?: string[];
  readonly createdBy: string;
  readonly createdAt: string; // ISO-8601 UTC
  readonly updatedAt: string; // ISO-8601 UTC
}

export interface TaskFormData {
  title: string;
  description: string;
  assigneeId: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  blockerReason?: string;
  dueDate: string;
  milestoneId?: string;
  dependencies?: string[];
}

export interface TaskFilterOptions {
  searchQuery?: string;
  status?: TaskStatus | 'all' | 'pending';
  priority?: TaskPriority | 'all';
  assigneeId?: string | 'all' | 'unassigned';
  dueDateRange?: 'all' | 'overdue' | 'today' | 'this_week' | 'upcoming';
}
