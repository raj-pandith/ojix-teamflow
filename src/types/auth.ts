export type UserRole = 'workspace_admin' | 'project_lead' | 'member' | 'viewer';
export type UserStatus = 'active' | 'blocked' | 'terminated';

export interface UserProfile {
  readonly uid: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly phone?: string;
  readonly avatarUrl?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DemoPersona {
  readonly uid: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly roleLabel: string;
  readonly description: string;
  readonly phone?: string;
  readonly status?: UserStatus;
  readonly permittedProjects?: readonly string[];
  readonly permittedProjectIds?: readonly string[];
}

export interface UserFormData {
  displayName: string;
  email: string;
  phone?: string;
  role: UserRole;
  status?: UserStatus;
}
