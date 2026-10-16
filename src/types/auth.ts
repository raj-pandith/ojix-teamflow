export type UserRole = 'workspace_admin' | 'project_lead' | 'member' | 'viewer';

export interface UserProfile {
  readonly uid: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: UserRole;
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
}
