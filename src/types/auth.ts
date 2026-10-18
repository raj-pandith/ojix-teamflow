export type UserRole = 'workspace_admin' | 'project_lead' | 'member' | 'viewer';
export type UserStatus = 'active' | 'blocked' | 'terminated' | 'pending_activation';

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

export interface UserInvitation {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  phone?: string;
  token: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  createdByUid: string;
  createdByDisplayName: string;
  isUsed: boolean;
  usedAt?: string;
  activationUrl?: string;
}

export interface AuthSession {
  token: string;
  user: UserProfile;
  expiresAt: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface ActivateAccountInput {
  token: string;
  email?: string;
  password: string;
  confirmPassword: string;
}

export interface InviteUserInput {
  displayName: string;
  email: string;
  role: UserRole;
  phone?: string;
  projectId?: string;
}

