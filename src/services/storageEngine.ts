import { UserProfile, UserStatus } from '../types/auth';
import { Project, ProjectDeletionNotice } from '../types/project';
import { Task } from '../types/task';
import { ActivityLogEntry, AuditAction } from '../types/audit';
import { INITIAL_USERS, INITIAL_PROJECTS, INITIAL_TASKS, INITIAL_ACTIVITY_LOGS } from './mockData';

const STORAGE_KEYS = {
  USERS: 'ojix_teamflow_users',
  PROJECTS: 'ojix_teamflow_projects',
  TASKS: 'ojix_teamflow_tasks',
  LOGS: 'ojix_teamflow_logs',
  SESSION: 'ojix_teamflow_session',
  INITIALIZED: 'ojix_teamflow_initialized',
  NOTICES: 'ojix_teamflow_deletion_notices',
};

type Listener = () => void;

class ReactiveStorageEngine {
  private users: UserProfile[] = [];
  private projects: Project[] = [];
  private tasks: Task[] = [];
  private logs: ActivityLogEntry[] = [];
  private deletionNotices: ProjectDeletionNotice[] = [];
  private listeners: Set<Listener> = new Set();
  private inFlightMutations: Map<string, Promise<unknown>> = new Map();

  constructor() {
    this.initialize();
  }

  public initialize(forceReset = false): void {
    if (forceReset || !localStorage.getItem(STORAGE_KEYS.INITIALIZED)) {
      this.users = [...INITIAL_USERS];
      this.projects = [...INITIAL_PROJECTS];
      this.tasks = [...INITIAL_TASKS];
      this.logs = [...INITIAL_ACTIVITY_LOGS];
      this.deletionNotices = [];
      this.persist();
      localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
    } else {
      try {
        const rawUsers: UserProfile[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]') || INITIAL_USERS;
        this.users = (rawUsers.length > 0 ? rawUsers : INITIAL_USERS).map(u => ({
          ...u,
          status: u.status || 'active',
        }));
        this.projects = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROJECTS) || '[]') || INITIAL_PROJECTS;
        this.tasks = JSON.parse(localStorage.getItem(STORAGE_KEYS.TASKS) || '[]') || INITIAL_TASKS;
        this.logs = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOGS) || '[]') || INITIAL_ACTIVITY_LOGS;
        this.deletionNotices = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTICES) || '[]');
      } catch {
        this.initialize(true);
      }
    }
    this.notify();
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(this.users));
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(this.projects));
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(this.tasks));
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(this.logs));
    localStorage.setItem(STORAGE_KEYS.NOTICES, JSON.stringify(this.deletionNotices));
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach(fn => fn());
  }

  // Idempotency execution wrapper per DEC-007
  public executeIdempotent<T>(key: string, mutationFn: () => Promise<T>): Promise<T> {
    if (this.inFlightMutations.has(key)) {
      return this.inFlightMutations.get(key) as Promise<T>;
    }
    const promise = mutationFn().finally(() => {
      setTimeout(() => {
        this.inFlightMutations.delete(key);
      }, 2000);
    });
    this.inFlightMutations.set(key, promise);
    return promise;
  }

  // ---- Users ----
  public getUsers(): UserProfile[] {
    return [...this.users];
  }

  public getUser(uid: string): UserProfile | undefined {
    return this.users.find(u => u.uid === uid);
  }

  public addUser(user: Partial<UserProfile>, caller: UserProfile, addToProjectId?: string): UserProfile {
    if (caller.role !== 'workspace_admin') {
      throw new Error('Permission denied: Only Workspace Admins can add or invite new members.');
    }
    if (!user.displayName || user.displayName.trim().length < 2) {
      throw new Error('User full name must be at least 2 characters.');
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!user.email || !emailRegex.test(user.email.trim())) {
      throw new Error('A valid email address is required.');
    }
    const exists = this.users.some(u => u.email.toLowerCase() === user.email!.trim().toLowerCase());
    if (exists) {
      throw new Error(`A user with email ${user.email} already exists.`);
    }

    const newUser: UserProfile = {
      uid: user.uid || `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      displayName: user.displayName.trim(),
      email: user.email.trim().toLowerCase(),
      role: user.role || 'member',
      phone: user.phone ? user.phone.trim() : undefined,
      status: user.status || 'active',
      createdAt: user.createdAt || new Date().toISOString(),
      updatedAt: user.updatedAt || new Date().toISOString(),
    };

    this.users.push(newUser);

    // Audit log entry for user creation
    this.logs.unshift({
      id: `log-user-${Date.now().toString(36)}-create`,
      workspaceId: 'ws-ojix-main',
      projectId: addToProjectId || 'workspace',
      taskId: 'users',
      userId: caller.uid,
      userDisplayName: caller.displayName,
      action: 'user_created',
      fieldChanged: 'account',
      newValue: `${newUser.displayName} (${newUser.role})`,
      commentText: `${caller.displayName} created workspace account for "${newUser.displayName}" (${newUser.role.replace('_', ' ').toUpperCase()}).`,
      createdAt: new Date().toISOString(),
    });

    if (addToProjectId) {
      const pIndex = this.projects.findIndex(p => p.id === addToProjectId);
      if (pIndex >= 0 && !this.projects[pIndex].memberIds.includes(newUser.uid)) {
        this.projects[pIndex] = {
          ...this.projects[pIndex],
          memberIds: [...this.projects[pIndex].memberIds, newUser.uid],
          updatedAt: new Date().toISOString(),
        };
      }
    }
    this.persist();
    this.notify();
    return newUser;
  }

  public updateUser(uid: string, updates: Partial<UserProfile>, caller: UserProfile): UserProfile {
    if (caller.role !== 'workspace_admin') {
      throw new Error('Permission denied: Only Workspace Admins can update workspace users.');
    }
    const index = this.users.findIndex(u => u.uid === uid);
    if (index === -1) {
      throw new Error(`User ${uid} not found.`);
    }
    const existing = this.users[index];

    if (updates.email && updates.email.trim().toLowerCase() !== existing.email.toLowerCase()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(updates.email.trim())) {
        throw new Error('A valid email address is required.');
      }
      const duplicate = this.users.some(
        u => u.uid !== uid && u.email.toLowerCase() === updates.email!.trim().toLowerCase()
      );
      if (duplicate) {
        throw new Error(`A user with email ${updates.email} already exists.`);
      }
    }

    if (updates.displayName && updates.displayName.trim().length < 2) {
      throw new Error('User full name must be at least 2 characters.');
    }

    const updatedUser: UserProfile = {
      ...existing,
      displayName: updates.displayName ? updates.displayName.trim() : existing.displayName,
      email: updates.email ? updates.email.trim().toLowerCase() : existing.email,
      phone: updates.phone !== undefined ? updates.phone.trim() : existing.phone,
      role: updates.role || existing.role,
      status: updates.status || existing.status,
      updatedAt: new Date().toISOString(),
    };

    this.users[index] = updatedUser;

    this.logs.unshift({
      id: `log-user-${Date.now().toString(36)}-update`,
      workspaceId: 'ws-ojix-main',
      projectId: 'workspace',
      taskId: 'users',
      userId: caller.uid,
      userDisplayName: caller.displayName,
      action: 'user_updated',
      fieldChanged: 'profile',
      oldValue: `${existing.displayName} (${existing.role})`,
      newValue: `${updatedUser.displayName} (${updatedUser.role})`,
      commentText: `${caller.displayName} updated account details for "${updatedUser.displayName}".`,
      createdAt: new Date().toISOString(),
    });

    this.persist();
    this.notify();
    return updatedUser;
  }

  public setUserStatus(uid: string, status: UserStatus, caller: UserProfile): UserProfile {
    if (caller.role !== 'workspace_admin') {
      throw new Error('Permission denied: Only Workspace Admins can change user account status.');
    }
    if (caller.uid === uid && (status === 'blocked' || status === 'terminated')) {
      throw new Error('Safety restriction: You cannot block or terminate your own administrative account.');
    }
    const index = this.users.findIndex(u => u.uid === uid);
    if (index === -1) {
      throw new Error(`User ${uid} not found.`);
    }
    const existing = this.users[index];
    const oldStatus = existing.status || 'active';

    const updatedUser: UserProfile = {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
    };

    this.users[index] = updatedUser;

    const action: AuditAction =
      status === 'blocked'
        ? 'user_blocked'
        : status === 'terminated'
        ? 'user_terminated'
        : 'user_unblocked';

    this.logs.unshift({
      id: `log-user-${Date.now().toString(36)}-status`,
      workspaceId: 'ws-ojix-main',
      projectId: 'workspace',
      taskId: 'users',
      userId: caller.uid,
      userDisplayName: caller.displayName,
      action,
      fieldChanged: 'status',
      oldValue: oldStatus.toUpperCase(),
      newValue: status.toUpperCase(),
      commentText: `${caller.displayName} ${
        status === 'blocked' ? 'blocked' : status === 'terminated' ? 'permanently terminated' : 'unblocked'
      } account for "${existing.displayName}".`,
      createdAt: new Date().toISOString(),
    });

    this.persist();
    this.notify();
    return updatedUser;
  }

  public terminateUser(uid: string, caller: UserProfile): UserProfile {
    return this.setUserStatus(uid, 'terminated', caller);
  }

  // ---- Project Team Membership (Project Lead & Admin) ----
  public addTeamMember(projectId: string, uid: string, caller: UserProfile): Project {
    const pIndex = this.projects.findIndex(p => p.id === projectId);
    if (pIndex === -1) {
      throw new Error(`Project ${projectId} not found.`);
    }
    const project = this.projects[pIndex];

    const isProjectManager =
      caller.role === 'workspace_admin' ||
      (caller.role === 'project_lead' && (project.ownerId === caller.uid || project.memberIds.includes(caller.uid)));

    if (!isProjectManager) {
      throw new Error('Permission denied: Only the Project Lead or Workspace Admin can manage team membership for this project.');
    }

    const targetUser = this.users.find(u => u.uid === uid);
    if (!targetUser) {
      throw new Error(`User ${uid} does not exist in workspace.`);
    }

    if (targetUser.status === 'blocked' || targetUser.status === 'terminated') {
      throw new Error(`Cannot add user "${targetUser.displayName}": Account is ${targetUser.status}.`);
    }

    if (project.memberIds.includes(uid)) {
      throw new Error(`User "${targetUser.displayName}" is already a member of this project team.`);
    }

    this.projects[pIndex] = {
      ...project,
      memberIds: [...project.memberIds, uid],
      updatedAt: new Date().toISOString(),
    };

    this.logs.unshift({
      id: `log-team-${Date.now().toString(36)}-add`,
      workspaceId: project.workspaceId,
      projectId: project.id,
      taskId: 'team',
      userId: caller.uid,
      userDisplayName: caller.displayName,
      action: 'team_member_added',
      fieldChanged: 'team',
      newValue: targetUser.displayName,
      commentText: `${caller.displayName} added "${targetUser.displayName}" (${targetUser.role.replace('_', ' ').toUpperCase()}) to project team.`,
      createdAt: new Date().toISOString(),
    });

    this.persist();
    this.notify();
    return this.projects[pIndex];
  }

  public removeTeamMember(projectId: string, uid: string, caller: UserProfile): Project {
    const pIndex = this.projects.findIndex(p => p.id === projectId);
    if (pIndex === -1) {
      throw new Error(`Project ${projectId} not found.`);
    }
    const project = this.projects[pIndex];

    const isProjectManager =
      caller.role === 'workspace_admin' ||
      (caller.role === 'project_lead' && (project.ownerId === caller.uid || project.memberIds.includes(caller.uid)));

    if (!isProjectManager) {
      throw new Error('Permission denied: Only the Project Lead or Workspace Admin can manage team membership for this project.');
    }

    if (project.ownerId === uid && caller.uid === uid) {
      throw new Error('Project owner cannot remove themselves from their project team.');
    }

    const targetUser = this.users.find(u => u.uid === uid);
    const targetName = targetUser?.displayName || uid;

    this.projects[pIndex] = {
      ...project,
      memberIds: project.memberIds.filter(id => id !== uid),
      updatedAt: new Date().toISOString(),
    };

    this.logs.unshift({
      id: `log-team-${Date.now().toString(36)}-remove`,
      workspaceId: project.workspaceId,
      projectId: project.id,
      taskId: 'team',
      userId: caller.uid,
      userDisplayName: caller.displayName,
      action: 'team_member_removed',
      fieldChanged: 'team',
      oldValue: targetName,
      commentText: `${caller.displayName} removed "${targetName}" from project team. Historical task records are preserved.`,
      createdAt: new Date().toISOString(),
    });

    this.persist();
    this.notify();
    return this.projects[pIndex];
  }

  public addMemberToProject(projectId: string, uid: string): void {
    const pIndex = this.projects.findIndex(p => p.id === projectId);
    if (pIndex >= 0 && !this.projects[pIndex].memberIds.includes(uid)) {
      this.projects[pIndex] = {
        ...this.projects[pIndex],
        memberIds: [...this.projects[pIndex].memberIds, uid],
        updatedAt: new Date().toISOString(),
      };
      this.persist();
      this.notify();
    }
  }

  public getUserManagementLogs(): ActivityLogEntry[] {
    return this.logs.filter(
      l =>
        l.action === 'user_created' ||
        l.action === 'user_updated' ||
        l.action === 'user_blocked' ||
        l.action === 'user_unblocked' ||
        l.action === 'user_terminated' ||
        l.action === 'team_member_added' ||
        l.action === 'team_member_removed'
    );
  }

  // ---- Projects & Isolation ----
  public getProjects(user: UserProfile): Project[] {
    if (user.role === 'workspace_admin') {
      return [...this.projects];
    }
    return this.projects.filter(p => p.memberIds.includes(user.uid));
  }

  public getProjectById(projectId: string, user: UserProfile): Project | undefined {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return undefined;
    if (user.role === 'workspace_admin' || project.memberIds.includes(user.uid)) {
      return project;
    }
    throw new Error('Permission denied: You do not have access to this project.');
  }

  public saveProject(project: Project, user: UserProfile): void {
    if (user.role !== 'workspace_admin' && user.role !== 'project_lead') {
      throw new Error('Permission denied: Only Workspace Admins and Project Leads can create projects.');
    }
    const index = this.projects.findIndex(p => p.id === project.id);
    if (index >= 0) {
      if (user.role !== 'workspace_admin' && this.projects[index].ownerId !== user.uid) {
        throw new Error('Permission denied: You can only edit projects you own.');
      }
      this.projects[index] = project;
    } else {
      this.projects.push(project);
    }
    this.persist();
    this.notify();
  }

  public deleteProject(projectId: string, user: UserProfile): void {
    if (user.role !== 'workspace_admin' && user.role !== 'project_lead') {
      throw new Error('Permission denied: Only Workspace Admins and Project Leads can delete projects.');
    }
    const index = this.projects.findIndex(p => p.id === projectId);
    if (index === -1) return;

    const project = this.projects[index];

    // Create deletion notification record for all project members
    const notice: ProjectDeletionNotice = {
      id: `notice-del-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`,
      projectId: project.id,
      projectName: project.name,
      deletedByUid: user.uid,
      deletedByName: user.displayName,
      deletedByRole: user.role,
      memberIds: [...project.memberIds],
      deletedAt: new Date().toISOString(),
    };
    this.deletionNotices.unshift(notice);

    // Remove project
    this.projects.splice(index, 1);
    // Cascade delete associated tasks and activity logs for clean state
    this.tasks = this.tasks.filter(t => t.projectId !== projectId);
    this.logs = this.logs.filter(l => l.projectId !== projectId);

    this.persist();
    this.notify();
  }

  // ---- Project Deletion Notices for Members ----
  public getDeletionNotices(user: UserProfile): ProjectDeletionNotice[] {
    const dismissedKey = `ojix_dismissed_notices_${user.uid}`;
    let dismissedIds: string[] = [];
    try {
      dismissedIds = JSON.parse(localStorage.getItem(dismissedKey) || '[]');
    } catch {
      dismissedIds = [];
    }
    const dismissedSet = new Set(dismissedIds);

    return this.deletionNotices.filter(
      n => n.memberIds.includes(user.uid) && !dismissedSet.has(n.id)
    );
  }

  public dismissDeletionNotice(noticeId: string, user: UserProfile): void {
    const dismissedKey = `ojix_dismissed_notices_${user.uid}`;
    let dismissedIds: string[] = [];
    try {
      dismissedIds = JSON.parse(localStorage.getItem(dismissedKey) || '[]');
    } catch {
      dismissedIds = [];
    }
    if (!dismissedIds.includes(noticeId)) {
      dismissedIds.push(noticeId);
      localStorage.setItem(dismissedKey, JSON.stringify(dismissedIds));
    }
    this.notify();
  }

  // ---- Tasks & Security Rules Enforcement ----
  public getTasks(projectId: string, user: UserProfile): Task[] {
    // Boundary check
    this.getProjectById(projectId, user);
    return this.tasks.filter(t => t.projectId === projectId);
  }

  public getAllAccessibleTasks(user: UserProfile): Task[] {
    const permittedProjectIds = new Set(this.getProjects(user).map(p => p.id));
    return this.tasks.filter(t => permittedProjectIds.has(t.projectId));
  }

  public getTaskById(taskId: string, user: UserProfile): Task | undefined {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return undefined;
    // Boundary check on parent project
    this.getProjectById(task.projectId, user);
    return task;
  }

  public saveTask(task: Task, user: UserProfile): void {
    if (user.status === 'blocked' || user.status === 'terminated') {
      throw new Error(`Permission denied: Your workspace account is ${user.status}. Access has been revoked.`);
    }
    if (user.role === 'viewer') {
      throw new Error('Permission denied: Viewers have read-only access and cannot mutate tasks.');
    }
    // Verify membership in project
    const project = this.getProjectById(task.projectId, user);

    // Database-level enforcement of mandatory project team membership:
    if (task.assigneeId) {
      const targetUser = this.getUser(task.assigneeId);
      if (!targetUser) {
        throw new Error(`Assignee user "${task.assigneeId}" not found in workspace.`);
      }
      if (targetUser.status === 'blocked' || targetUser.status === 'terminated') {
        throw new Error(`Cannot assign task to "${targetUser.displayName}": User account is ${targetUser.status}.`);
      }
      const existingTask = this.tasks.find(t => t.id === task.id);
      const isAssigneeChanging = !existingTask || existingTask.assigneeId !== task.assigneeId;

      if (isAssigneeChanging && project && !project.memberIds.includes(task.assigneeId)) {
        throw new Error(
          `Permission denied: Assignee "${targetUser.displayName}" is not an active member of this project team. Please add them using Manage Team first.`
        );
      }
    }

    const index = this.tasks.findIndex(t => t.id === task.id);
    if (index >= 0) {
      this.tasks[index] = task;
    } else {
      this.tasks.push(task);
    }
    this.persist();
    this.notify();
  }

  public deleteTask(taskId: string, user: UserProfile): void {
    if (user.role !== 'workspace_admin' && user.role !== 'project_lead') {
      throw new Error('Permission denied: Only Workspace Admins and Project Leads can delete tasks.');
    }
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;

    const project = this.getProjectById(task.projectId, user);
    if (user.role !== 'workspace_admin' && project?.ownerId !== user.uid) {
      throw new Error('Permission denied: Project Leads can only delete tasks in projects they own.');
    }

    this.tasks = this.tasks.filter(t => t.id !== taskId);
    this.persist();
    this.notify();
  }

  // ---- Activity Logs ----
  public getTaskLogs(taskId: string, user: UserProfile): ActivityLogEntry[] {
    const task = this.getTaskById(taskId, user);
    if (!task) return [];
    return this.logs
      .filter(l => l.taskId === taskId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public addActivityLog(log: ActivityLogEntry, user: UserProfile): void {
    if (user.role === 'viewer') {
      throw new Error('Permission denied: Viewers cannot create activity records.');
    }
    this.logs.unshift(log);
    this.persist();
    this.notify();
  }
}

export const storageEngine = new ReactiveStorageEngine();
