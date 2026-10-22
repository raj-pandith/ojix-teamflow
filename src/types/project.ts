export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';

export interface CrmProjectClient {
  readonly name?: string;
  readonly email?: string;
  readonly phone?: string;
}

export interface CrmRawProject {
  readonly id: string;
  readonly dealId?: string;
  readonly name?: string;
  readonly title?: string;
  readonly objective?: string;
  readonly client?: CrmProjectClient;
  readonly dealValue?: number;
  readonly dealStage?: string;
  readonly temperature?: string;
  readonly status?: string;
  readonly isReadyForExecution?: boolean;
  readonly startDate?: string;
  readonly dueDate?: string;
  readonly workspaceId?: string;
  readonly workspaceName?: string;
  readonly createdAt?: string;
  readonly lastActivityAt?: string;
}

export interface CrmFetchResponse {
  readonly success: boolean;
  readonly message?: string;
  readonly sourceApp?: string;
  readonly targetApp?: string;
  readonly apiKeyAuthenticated?: boolean;
  readonly totalCount: number;
  readonly filter?: Record<string, unknown>;
  readonly projects: CrmRawProject[];
}

export interface CrmProjectMetadata {
  readonly source: 'clientflow_crm';
  readonly externalId: string;
  readonly dealId?: string;
  readonly clientName?: string;
  readonly clientEmail?: string;
  readonly clientPhone?: string;
  readonly dealValue?: number;
  readonly dealStage?: string;
  readonly temperature?: string;
  readonly sourceStatus?: string;
  readonly isReadyForExecution?: boolean;
  readonly crmWorkspaceId?: string;
  readonly crmWorkspaceName?: string;
  readonly sourceCreatedAt?: string;
  readonly lastActivityAt?: string;
  readonly importedAt: string;
  readonly importedByUid: string;
}

export interface CrmImportReportItem {
  readonly id: string;
  readonly name: string;
  readonly success: boolean;
  readonly error?: string;
  readonly project?: Project;
}

export interface CrmImportReport {
  readonly success: boolean;
  readonly totalRequested: number;
  readonly importedCount: number;
  readonly failedCount: number;
  readonly importedProjects: Project[];
  readonly failedProjects: Array<{ id: string; name: string; reason: string }>;
  readonly error?: string;
}

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
  readonly crmMetadata?: CrmProjectMetadata;
}

export interface ProjectFormData {
  name: string;
  objective: string;
  status: ProjectStatus;
  startDate: string;
  dueDate: string;
  memberIds: string[];
  crmMetadata?: CrmProjectMetadata;
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

