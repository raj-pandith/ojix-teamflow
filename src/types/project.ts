export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';

export interface Project {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly objective: string;
  readonly ownerId: string;
  readonly status: ProjectStatus;
  readonly startDate: string; // ISO date 'YYYY-MM-DD'
  readonly dueDate: string;   // ISO date 'YYYY-MM-DD'
  readonly memberIds: readonly string[];
  readonly createdAt: string; // ISO-8601 UTC string
  readonly updatedAt: string; // ISO-8601 UTC string
}

export interface ProjectFormData {
  name: string;
  objective: string;
  status: ProjectStatus;
  startDate: string;
  dueDate: string;
  memberIds: string[];
}

export interface ProjectDeletionNotice {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly deletedByUid: string;
  readonly deletedByName: string;
  readonly deletedByRole: string;
  readonly memberIds: readonly string[];
  readonly deletedAt: string; // ISO date-time string
  readonly reason?: string | null;
}

export interface TaskReassignmentDecision {
  readonly taskId: string;
  readonly newAssigneeId: string | null; // null represents unassigned
}

export interface RemoveMemberResult {
  readonly project: Project;
  readonly removedUser: import('./auth').UserProfile;
  readonly reassignedTasks: import('./task').Task[];
  readonly unassignedTasks: import('./task').Task[];
  readonly preservedCompletedTasks: import('./task').Task[];
}

