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
