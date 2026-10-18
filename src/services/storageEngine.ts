import { UserProfile, UserStatus } from '../types/auth';
import { Project, ProjectDeletionNotice, TaskReassignmentDecision, RemoveMemberResult } from '../types/project';
import { Task } from '../types/task';
import { ActivityLogEntry, AuditAction } from '../types/audit';
import {
  AppNotification,
  DirectMessage,
  DirectConversation,
  SendDirectMessageInput,
} from '../types/message';
import {
  INITIAL_USERS,
  INITIAL_PROJECTS,
  INITIAL_TASKS,
  INITIAL_ACTIVITY_LOGS,
  INITIAL_NOTIFICATIONS,
  INITIAL_DIRECT_MESSAGES,
} from './mockData';
import { validateAssigneeEligibility } from '../domain/validation';

const STORAGE_KEYS = {
  USERS: 'ojix_teamflow_users',
  PROJECTS: 'ojix_teamflow_projects',
  TASKS: 'ojix_teamflow_tasks',
  LOGS: 'ojix_teamflow_logs',
  SESSION: 'ojix_teamflow_session',
  INITIALIZED: 'ojix_teamflow_initialized',
  NOTICES: 'ojix_teamflow_deletion_notices',
  NOTIFICATIONS: 'ojix_teamflow_notifications',
  DIRECT_MESSAGES: 'ojix_teamflow_direct_messages',
};

type Listener = () => void;

class ReactiveStorageEngine {
  private users: UserProfile[] = [];
  private projects: Project[] = [];
  private tasks: Task[] = [];
  private logs: ActivityLogEntry[] = [];
  private deletionNotices: ProjectDeletionNotice[] = [];
  private notifications: AppNotification[] = [];
  private directMessages: DirectMessage[] = [];
  private listeners: Set<Listener> = new Set();
  private inFlightMutations: Map<string, Promise<unknown>> = new Map();
  private broadcastChannel: BroadcastChannel | null = null;
  private lastKnownSyncClock = 0;

  constructor() {
    this.initialize();
    this.setupCrossTabSync();
  }

  private setupCrossTabSync(): void {
    if (typeof window === 'undefined') return;

    // 1. Zero-latency BroadcastChannel for instantaneous cross-tab updates
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('ojix_teamflow_bus');
        this.broadcastChannel.onmessage = event => {
          if (event.data?.type === 'SYNC_UPDATE') {
            this.reloadFromStorage();
          }
        };
      } catch (err) {
        console.warn('BroadcastChannel not available:', err);
      }
    }

    // 2. Storage event listener (fires across tabs on localStorage mutations)
    window.addEventListener('storage', event => {
      if (event.key && (Object.values(STORAGE_KEYS).includes(event.key) || event.key === 'ojix_teamflow_sync_clock')) {
        this.reloadFromStorage();
      }
    });

    // 3. Fallback interval clock check (ensures sync even if events are constrained)
    setInterval(() => {
      this.checkSyncClock();
    }, 1000);

    // 4. Server-side sync for multi-browser and multi-device local development
    const syncWithServer = async () => {
        try {
          const res = await fetch('/api/sync');
          if (res.ok) {
            const data = await res.json();

            // When server restarts, seed storageEngine notifications with the clean seed notifications
            const lastBootId = localStorage.getItem('ojix_server_boot_id');
            if (data.bootId && data.bootId !== lastBootId) {
              localStorage.setItem('ojix_server_boot_id', data.bootId);
              if (Array.isArray(data.notifications)) {
                this.notifications = [...data.notifications];
                this.persist();
                this.notify();
                return;
              }
            }

            let updated = false;

            if (Array.isArray(data.notifications)) {
              for (const n of data.notifications) {
                const idx = this.notifications.findIndex(localN => localN.id === n.id);
                if (idx === -1) {
                  this.notifications.unshift(n);
                  updated = true;
                } else if (n.isRead !== this.notifications[idx].isRead) {
                  this.notifications[idx] = { ...this.notifications[idx], isRead: n.isRead };
                  updated = true;
                }
              }
            }

            if (Array.isArray(data.logs)) {
              for (const l of data.logs) {
                const exists = this.logs.some(localL => localL.id === l.id);
                if (!exists) {
                  this.logs.unshift(l);
                  updated = true;
                }
              }
            }

            if (updated) {
              this.persist();
              this.notify();
            }
          }
        } catch {
          // Safe ignore if offline
        }
      };

      if (typeof window !== 'undefined') {
        setTimeout(syncWithServer, 200);
        setInterval(syncWithServer, 2000);

        window.addEventListener('focus', syncWithServer);
        window.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            syncWithServer();
          }
        });
      }

    // 5. Zero-latency Server-Sent Events (SSE) stream for instantaneous real-time push delivery
    if (typeof window !== 'undefined' && typeof EventSource !== 'undefined') {
      try {
        const eventSource = new EventSource('/api/sync/events');

        eventSource.addEventListener('connected', (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            const lastBootId = localStorage.getItem('ojix_server_boot_id');
            if (data.bootId && data.bootId !== lastBootId) {
              syncWithServer();
            }
          } catch {}
        });

        eventSource.addEventListener('notification', (event: MessageEvent) => {
          try {
            const notif = JSON.parse(event.data);
            if (notif && notif.id) {
              const idx = this.notifications.findIndex(n => n.id === notif.id);
              if (idx === -1) {
                this.notifications.unshift(notif);
                this.persist();
                this.notify();
              }
            }
          } catch {}
        });

        eventSource.addEventListener('sync', (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            let updated = false;

            if (Array.isArray(data.notifications)) {
              for (const n of data.notifications) {
                const idx = this.notifications.findIndex(localN => localN.id === n.id);
                if (idx === -1) {
                  this.notifications.unshift(n);
                  updated = true;
                }
              }
            }

            if (Array.isArray(data.logs)) {
              for (const l of data.logs) {
                const exists = this.logs.some(localL => localL.id === l.id);
                if (!exists) {
                  this.logs.unshift(l);
                  updated = true;
                }
              }
            }

            if (updated) {
              this.persist();
              this.notify();
            }
          } catch {}
        });
      } catch (err) {
        console.warn('Real-time SSE event stream connection failed:', err);
      }
    }
  }

  public reloadFromStorage(): void {
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
      this.notifications = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS) || 'null') ?? INITIAL_NOTIFICATIONS;
      this.directMessages = JSON.parse(localStorage.getItem(STORAGE_KEYS.DIRECT_MESSAGES) || 'null') ?? INITIAL_DIRECT_MESSAGES;
      this.notify();
    } catch (err) {
      console.warn('Failed to reload from storage:', err);
    }
  }

  private checkSyncClock(): void {
    try {
      const clockStr = localStorage.getItem('ojix_teamflow_sync_clock');
      if (clockStr) {
        const clock = parseInt(clockStr, 10);
        if (clock > this.lastKnownSyncClock) {
          this.lastKnownSyncClock = clock;
          this.reloadFromStorage();
        }
      }
    } catch {
      // Ignore
    }
  }

  public initialize(forceReset = false): void {
    if (forceReset) {
      this.inFlightMutations.clear();
    }
    if (forceReset || !localStorage.getItem(STORAGE_KEYS.INITIALIZED)) {
      this.users = [...INITIAL_USERS];
      this.projects = [...INITIAL_PROJECTS];
      this.tasks = [...INITIAL_TASKS];
      this.logs = [...INITIAL_ACTIVITY_LOGS];
      this.deletionNotices = [];
      this.notifications = [...INITIAL_NOTIFICATIONS];
      this.directMessages = [...INITIAL_DIRECT_MESSAGES];
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
        this.notifications = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS) || 'null') ?? INITIAL_NOTIFICATIONS;
        this.directMessages = JSON.parse(localStorage.getItem(STORAGE_KEYS.DIRECT_MESSAGES) || 'null') ?? INITIAL_DIRECT_MESSAGES;
      } catch {
        this.initialize(true);
      }
    }

    // Enforce empty baseline workspace versioning so existing browser localStorage is cleared
    const EMPTY_WORKSPACE_KEY = 'ojix_teamflow_empty_workspace_v1';
    const isTestRuntime =
      (typeof process !== 'undefined' && (process.env?.NODE_ENV === 'test' || Boolean(process.env?.VITEST))) ||
      (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test');

    if (!isTestRuntime && localStorage.getItem(EMPTY_WORKSPACE_KEY) !== 'cleared') {
      this.projects = [];
      this.tasks = [];
      this.logs = [];
      this.notifications = [];
      this.directMessages = [];
      this.deletionNotices = [];
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.NOTICES, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.DIRECT_MESSAGES, JSON.stringify([]));
      localStorage.setItem(EMPTY_WORKSPACE_KEY, 'cleared');
      this.persist();
    }

    this.notify();
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(this.users));
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(this.projects));
      localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(this.tasks));
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(this.logs));
      localStorage.setItem(STORAGE_KEYS.NOTICES, JSON.stringify(this.deletionNotices));
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(this.notifications));
      localStorage.setItem(STORAGE_KEYS.DIRECT_MESSAGES, JSON.stringify(this.directMessages));
      const nowClock = Date.now();
      this.lastKnownSyncClock = nowClock;
      localStorage.setItem('ojix_teamflow_sync_clock', nowClock.toString());

      // Broadcast immediately across all open tabs/windows
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage({ type: 'SYNC_UPDATE', timestamp: nowClock });
      }
    } catch (err) {
      console.warn('Failed to persist to localStorage:', err);
    }
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
    const promise = mutationFn()
      .catch(err => {
        this.inFlightMutations.delete(key);
        throw err;
      })
      .finally(() => {
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

    if (status === 'blocked') {
      this.notifications.unshift({
        id: `notif-blk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        recipientUserId: uid,
        actorUserId: caller.uid,
        actorDisplayName: caller.displayName,
        type: 'USER_BLOCKED',
        title: 'Account access restricted',
        body: 'Your workspace account has been blocked by an administrator. You can no longer access protected workspace features. Contact your administrator for assistance.',
        entityType: 'user',
        entityId: uid,
        isRead: false,
        createdAt: new Date().toISOString(),
        deduplicationKey: `blk-${uid}-${new Date().toISOString().slice(0, 10)}`,
      });

      if (caller.uid !== uid) {
        this.notifications.unshift({
          id: `notif-blk-adm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          recipientUserId: caller.uid,
          actorUserId: caller.uid,
          actorDisplayName: caller.displayName,
          type: 'USER_BLOCKED',
          title: 'User account blocked',
          body: `Successfully blocked workspace account for "${existing.displayName}".`,
          entityType: 'user',
          entityId: uid,
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }
    }

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

    if (targetUser.uid !== caller.uid) {
      const isViewer = targetUser.role === 'viewer';
      this.notifications.unshift({
        id: `notif-pmem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        recipientUserId: targetUser.uid,
        actorUserId: caller.uid,
        actorDisplayName: caller.displayName,
        type: 'PROJECT_MEMBER_ADDED',
        title: isViewer ? 'Project shared with you' : 'Added to project',
        body: isViewer
          ? `You have been added as a Viewer to "${project.name}". You have read-only access to this project.`
          : `You have been added to "${project.name}" by ${caller.displayName}.`,
        entityType: 'project',
        entityId: project.id,
        projectId: project.id,
        projectName: project.name,
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    }

    this.persist();
    this.notify();
    return this.projects[pIndex];
  }

  public getMemberProjectTasks(projectId: string, userId: string, caller: UserProfile): {
    activeTasks: Task[];
    completedTasks: Task[];
  } {
    const project = this.getProjectById(projectId, caller);
    if (!project) {
      throw new Error(`Project ${projectId} not found.`);
    }
    const memberTasks = this.tasks.filter(t => t.projectId === projectId && t.assigneeId === userId);
    return {
      activeTasks: memberTasks.filter(t => t.status !== 'done'),
      completedTasks: memberTasks.filter(t => t.status === 'done'),
    };
  }

  public removeTeamMember(
    projectId: string,
    uid: string,
    caller: UserProfile,
    reassignments?: TaskReassignmentDecision[]
  ): Project & RemoveMemberResult {
    if (caller.status === 'blocked' || caller.status === 'terminated') {
      throw new Error(`Permission denied: Your workspace account is ${caller.status}.`);
    }

    const pIndex = this.projects.findIndex(p => p.id === projectId);
    if (pIndex === -1) {
      throw new Error(`Project ${projectId} not found.`);
    }
    const project = this.projects[pIndex];

    const isProjectManager =
      caller.role === 'workspace_admin' ||
      (caller.role === 'project_lead' && project.ownerId === caller.uid);

    if (!isProjectManager) {
      throw new Error('Permission denied: Only the authorized Project Lead for this project or a Workspace Admin can remove team members.');
    }

    const targetUser = this.users.find(u => u.uid === uid);
    if (!targetUser) {
      throw new Error(`User ${uid} does not exist in workspace.`);
    }

    if (!project.memberIds.includes(uid)) {
      throw new Error(`User "${targetUser.displayName}" is not a member of this project team.`);
    }

    if (project.ownerId === uid) {
      if (caller.uid === uid) {
        throw new Error('Project owner cannot remove themselves from their project team.');
      }
      throw new Error('Project owner cannot be removed from their own team.');
    }

    if (caller.role === 'workspace_admin' && caller.uid === uid) {
      throw new Error('Safety restriction: Workspace Admins cannot remove themselves from the project team.');
    }

    if (caller.role === 'project_lead' && targetUser.role === 'workspace_admin') {
      throw new Error('Permission denied: Project Leads cannot remove a Workspace Admin from the project team.');
    }

    // 1. Scan tasks for this member in this project
    const memberTasks = this.tasks.filter(t => t.projectId === projectId && t.assigneeId === uid);
    const activeTasks = memberTasks.filter(t => t.status !== 'done');
    const completedTasks = memberTasks.filter(t => t.status === 'done');

    // 2. Validate all reassignment choices upfront before committing any mutation
    if (reassignments && reassignments.length > 0) {
      for (const decision of reassignments) {
        const task = memberTasks.find(t => t.id === decision.taskId);
        if (!task) {
          throw new Error(`Task ${decision.taskId} not found or not assigned to member "${targetUser.displayName}".`);
        }

        if (task.status === 'done' && decision.newAssigneeId !== null && decision.newAssigneeId !== uid) {
          throw new Error('Cannot reassign completed tasks. Completed tasks retain historical ownership.');
        }

        if (decision.newAssigneeId) {
          if (decision.newAssigneeId === uid) {
            throw new Error('Cannot reassign tasks to the member being removed.');
          }

          const replacementUser = this.getUser(decision.newAssigneeId);
          const eligibility = validateAssigneeEligibility(replacementUser, project);
          if (!eligibility.eligible) {
            throw new Error(`Cannot reassign task "${task.title}": ${eligibility.reason}`);
          }
        }
      }
    }

    // 3. Atomically apply task reassignments & team removal
    const now = new Date().toISOString();
    const reassignedTasks: Task[] = [];
    const unassignedTasks: Task[] = [];

    if (reassignments !== undefined) {
      // Reassignment mode: update unfinished tasks according to decisions (or leave unassigned)
      for (const t of activeTasks) {
        const decision = reassignments.find(r => r.taskId === t.id);
        const targetAssigneeId = decision ? decision.newAssigneeId : null;

        if (targetAssigneeId) {
          if (targetAssigneeId === uid) {
            throw new Error(`Cannot reassign task to the member "${targetUser.displayName}" who is being removed.`);
          }
          const replacementUser = this.getUser(targetAssigneeId);
          const eligibility = validateAssigneeEligibility(replacementUser, project);
          if (!eligibility.eligible) {
            throw new Error(`Permission denied: Cannot reassign task "${t.title}". ${eligibility.reason}`);
          }
        }

        const taskIndex = this.tasks.findIndex(existing => existing.id === t.id);
        if (taskIndex >= 0) {
          const updatedTask: Task = {
            ...t,
            assigneeId: targetAssigneeId,
            updatedAt: now,
          };
          this.tasks[taskIndex] = updatedTask;

          if (targetAssigneeId) {
            reassignedTasks.push(updatedTask);
            const replacementUser = this.users.find(u => u.uid === targetAssigneeId);
            this.logs.unshift({
              id: `log-${Date.now().toString(36)}-reassign-${t.id}`,
              workspaceId: project.workspaceId,
              projectId: project.id,
              taskId: t.id,
              userId: caller.uid,
              userDisplayName: caller.displayName,
              action: 'reassigned',
              fieldChanged: 'assignee',
              oldValue: targetUser.displayName,
              newValue: replacementUser?.displayName || targetAssigneeId,
              commentText: `${caller.displayName} reassigned task "${t.title}" from "${targetUser.displayName}" to "${replacementUser?.displayName || targetAssigneeId}" during member removal.`,
              createdAt: now,
            });
          } else {
            unassignedTasks.push(updatedTask);
            this.logs.unshift({
              id: `log-${Date.now().toString(36)}-unassign-${t.id}`,
              workspaceId: project.workspaceId,
              projectId: project.id,
              taskId: t.id,
              userId: caller.uid,
              userDisplayName: caller.displayName,
              action: 'reassigned',
              fieldChanged: 'assignee',
              oldValue: targetUser.displayName,
              newValue: 'Unassigned',
              commentText: `${caller.displayName} left task "${t.title}" unassigned during member removal.`,
              createdAt: now,
            });
          }
        }
      }
    }

    // 4. Update project memberIds
    this.projects[pIndex] = {
      ...project,
      memberIds: project.memberIds.filter(id => id !== uid),
      updatedAt: now,
    };

    // 5. Audit log for member removal
    this.logs.unshift({
      id: `log-team-${Date.now().toString(36)}-remove`,
      workspaceId: project.workspaceId,
      projectId: project.id,
      taskId: 'team',
      userId: caller.uid,
      userDisplayName: caller.displayName,
      action: 'team_member_removed',
      fieldChanged: 'team',
      oldValue: targetUser.displayName,
      commentText: `${caller.displayName} removed "${targetUser.displayName}" from project team "${project.name}". Historical task records are preserved (${completedTasks.length} completed task(s) retained, ${reassignedTasks.length} reassigned, ${unassignedTasks.length} left unassigned).`,
      createdAt: now,
    });

    // 6. Notify removed member
    if (targetUser.uid !== caller.uid) {
      this.notifications.unshift({
        id: `notif-pmem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        recipientUserId: targetUser.uid,
        actorUserId: caller.uid,
        actorDisplayName: caller.displayName,
        type: 'PROJECT_MEMBER_REMOVED',
        title: 'Project access updated',
        body: `Your access to project "${project.name}" has been removed by ${caller.displayName}. Note that your workspace account remains active.`,
        entityType: 'project',
        entityId: project.id,
        projectId: project.id,
        projectName: project.name,
        isRead: false,
        createdAt: now,
        deduplicationKey: `pmem-removed-${project.id}-${targetUser.uid}`,
      });
    }

    this.persist();
    this.notify();

    const updatedProject = this.projects[pIndex];
    const result: Project & RemoveMemberResult = {
      ...updatedProject,
      project: updatedProject,
      removedUser: targetUser,
      reassignedTasks,
      unassignedTasks,
      preservedCompletedTasks: completedTasks,
    };

    return result;
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

    // Create persistent inbox notifications for affected members and project lead (excluding actor)
    const now = new Date().toISOString();
    const formattedDate = new Date().toLocaleString();
    const affectedMembers = project.memberIds.filter(id => id !== user.uid);
    const allRecipients = Array.from(
      new Set([...affectedMembers, ...(project.ownerId !== user.uid ? [project.ownerId] : [])])
    );

    for (const recipientId of allRecipients) {
      this.notifications.unshift({
        id: `notif-pdel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        recipientUserId: recipientId,
        actorUserId: user.uid,
        actorDisplayName: user.displayName,
        type: 'PROJECT_DELETED',
        title: 'Project deleted',
        body: `The project "${project.name}" has been deleted by ${user.displayName} on ${formattedDate}.`,
        entityType: 'project',
        entityId: project.id,
        projectId: project.id,
        projectName: project.name,
        isRead: false,
        createdAt: now,
        deduplicationKey: `pdel-${project.id}-${recipientId}`,
      });
    }

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

    // Database-level enforcement of mandatory task assignee eligibility rules:
    if (task.assigneeId) {
      const existingTask = this.tasks.find(t => t.id === task.id);
      const isAssigneeChanging = !existingTask || existingTask.assigneeId !== task.assigneeId;

      if (isAssigneeChanging) {
        const targetUser = this.getUser(task.assigneeId);
        const eligibility = validateAssigneeEligibility(targetUser, project);
        if (!eligibility.eligible) {
          throw new Error(`Permission denied: Cannot assign task. ${eligibility.reason}`);
        }
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

  private pushSyncToServer(payload: { notifications?: AppNotification[]; logs?: ActivityLogEntry[] }): void {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
    try {
      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch {}
  }

  public addActivityLog(log: ActivityLogEntry, user: UserProfile): void {
    if (user.role === 'viewer') {
      throw new Error('Permission denied: Viewers cannot create activity records.');
    }
    this.logs.unshift(log);
    this.persist();
    this.notify();
    this.pushSyncToServer({ logs: [log] });
  }

  // ---- Notifications ----
  public getAllNotificationsUnfiltered(): AppNotification[] {
    return [...this.notifications];
  }

  public getNotifications(user: UserProfile): AppNotification[] {
    // Strictly isolate notifications: user only sees notifications addressed to them
    return this.notifications
      .filter(n => n.recipientUserId === user.uid)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public addNotification(notification: AppNotification): void {
    if (notification.deduplicationKey) {
      const exists = this.notifications.some(n => n.deduplicationKey === notification.deduplicationKey);
      if (exists) return;
    }
    this.notifications.unshift(notification);
    this.persist();
    this.notify();
    this.dispatchPushNotification(notification);
    this.pushSyncToServer({ notifications: [notification] });
  }

  public addNotifications(notifications: AppNotification[]): void {
    let added = false;
    const newlyAdded: AppNotification[] = [];
    for (const notif of notifications) {
      if (notif.deduplicationKey) {
        const exists = this.notifications.some(n => n.deduplicationKey === notif.deduplicationKey);
        if (exists) continue;
      }
      this.notifications.unshift(notif);
      newlyAdded.push(notif);
      added = true;
    }
    if (added) {
      this.persist();
      this.notify();
      for (const notif of newlyAdded) {
        this.dispatchPushNotification(notif);
      }
      this.pushSyncToServer({ notifications: newlyAdded });
    }
  }

  private dispatchPushNotification(notification: AppNotification): void {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;

    try {
      const payload = {
        id: notification.id,
        recipientUserId: notification.recipientUserId,
        actorUserId: notification.actorUserId,
        actorDisplayName: notification.actorDisplayName,
        title: notification.title,
        body: notification.body,
        type: notification.type,
        projectId: notification.projectId,
        projectName: notification.projectName,
        taskId: notification.taskId,
        taskTitle: notification.taskTitle,
        commentId: notification.commentId,
        conversationId: notification.conversationId,
        timestamp: Date.now(),
        requireInteraction: true,
      };

      fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientUserId: notification.recipientUserId,
          payload,
        }),
      }).catch(err => {
        // Keep persistent inbox record even when push delivery fails
        if (process.env.NODE_ENV !== 'test') {
          console.debug('[WebPush] Push delivery status:', err);
        }
      });
    } catch {
      // Safe no-op on non-network/offline environments
    }
  }

  public markNotificationRead(notificationId: string, user: UserProfile): void {
    const notif = this.notifications.find(n => n.id === notificationId);
    if (!notif) return;
    // Server-enforced authorization: users can only mark their own notifications as read
    if (notif.recipientUserId !== user.uid) {
      throw new Error('Permission denied: You can only update notifications in your own inbox.');
    }
    const idx = this.notifications.findIndex(n => n.id === notificationId);
    if (idx !== -1) {
      this.notifications[idx] = {
        ...this.notifications[idx],
        isRead: true,
        readAt: new Date().toISOString(),
      };
      this.persist();
      this.notify();
      this.pushSyncToServer({ notifications: [this.notifications[idx]] });
    }
  }

  public markAllNotificationsRead(user: UserProfile): void {
    const now = new Date().toISOString();
    let updated = false;
    this.notifications = this.notifications.map(n => {
      if (n.recipientUserId === user.uid && !n.isRead) {
        updated = true;
        return {
          ...n,
          isRead: true,
          readAt: now,
        };
      }
      return n;
    });
    if (updated) {
      this.persist();
      this.notify();
    }
  }

  public getUnreadNotificationCount(user: UserProfile): number {
    return this.notifications.filter(n => n.recipientUserId === user.uid && !n.isRead).length;
  }

  // ---- Direct Messaging ----
  public getDirectMessages(user: UserProfile, conversationId?: string): DirectMessage[] {
    if (user.status === 'blocked' || user.status === 'terminated') {
      throw new Error(`Permission denied: Your workspace account is ${user.status}. Message access revoked.`);
    }

    let messages = this.directMessages.filter(
      m => m.senderId === user.uid || m.recipientId === user.uid
    );

    if (conversationId) {
      messages = messages.filter(m => m.conversationId === conversationId);
    }

    return [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  public getDirectConversations(user: UserProfile): DirectConversation[] {
    if (user.status === 'blocked' || user.status === 'terminated') {
      return [];
    }

    const userMessages = this.directMessages.filter(
      m => m.senderId === user.uid || m.recipientId === user.uid
    );

    const convMap = new Map<string, DirectMessage[]>();
    for (const msg of userMessages) {
      const list = convMap.get(msg.conversationId) || [];
      list.push(msg);
      convMap.set(msg.conversationId, list);
    }

    const conversations: DirectConversation[] = [];
    for (const [convId, msgs] of convMap.entries()) {
      const sorted = [...msgs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const last = sorted[0];
      const otherUid = last.senderId === user.uid ? last.recipientId : last.senderId;
      const otherUser = this.getUser(otherUid);
      if (!otherUser) continue;

      const unreadCount = msgs.filter(m => m.recipientId === user.uid && !m.isRead).length;
      conversations.push({
        id: convId,
        participantIds: [user.uid, otherUid].sort() as unknown as [string, string],
        otherUser,
        lastMessage: last,
        unreadCount,
        updatedAt: last.createdAt,
      });
    }

    return conversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public sendDirectMessage(data: SendDirectMessageInput, sender: UserProfile): DirectMessage {
    if (sender.status === 'blocked' || sender.status === 'terminated') {
      throw new Error(`Permission denied: Your workspace account is ${sender.status}. You cannot send messages.`);
    }

    const targetUser = this.getUser(data.recipientId);
    if (!targetUser) {
      throw new Error(`Recipient user "${data.recipientId}" does not exist in workspace.`);
    }

    if (targetUser.status === 'blocked' || targetUser.status === 'terminated') {
      throw new Error(`Cannot send message to "${targetUser.displayName}": Recipient account is ${targetUser.status}.`);
    }

    const trimmedBody = data.body.trim();
    if (!trimmedBody) {
      throw new Error('Message body cannot be empty.');
    }
    if (trimmedBody.length > 2000) {
      throw new Error('Message body cannot exceed 2000 characters.');
    }

    // Deterministic conversation ID for 1-on-1 chats
    const conversationId = `conv-${[sender.uid, targetUser.uid].sort().join('-')}`;
    const now = new Date().toISOString();

    const newMsg: DirectMessage = {
      id: `dm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      conversationId,
      senderId: sender.uid,
      senderDisplayName: sender.displayName,
      recipientId: targetUser.uid,
      recipientDisplayName: targetUser.displayName,
      subject: data.subject?.trim() || undefined,
      body: trimmedBody,
      isRead: false,
      createdAt: now,
    };

    this.directMessages.push(newMsg);

    // Create a real-time inbox notification for recipient
    const bodyPreview = trimmedBody.length > 100 ? `${trimmedBody.slice(0, 100)}...` : trimmedBody;
    const notifTitle = data.subject?.trim()
      ? `New message: ${data.subject.trim()}`
      : `Message from ${sender.displayName}`;

    this.addNotification({
      id: `notif-dm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      recipientUserId: targetUser.uid,
      actorUserId: sender.uid,
      actorDisplayName: sender.displayName,
      type: 'DIRECT_MESSAGE_RECEIVED',
      title: notifTitle,
      body: `${sender.displayName}: "${bodyPreview}"`,
      entityType: 'conversation',
      entityId: conversationId,
      conversationId,
      isRead: false,
      createdAt: now,
    });

    this.persist();
    this.notify();
    return newMsg;
  }

  public markDirectMessageRead(messageId: string, user: UserProfile): void {
    const idx = this.directMessages.findIndex(m => m.id === messageId);
    if (idx !== -1) {
      const msg = this.directMessages[idx];
      if (msg.recipientId !== user.uid) {
        throw new Error('Permission denied: You can only update messages in your own inbox.');
      }
      this.directMessages[idx] = {
        ...msg,
        isRead: true,
        readAt: new Date().toISOString(),
      };
      this.persist();
      this.notify();
    }
  }

  public markConversationRead(conversationId: string, user: UserProfile): void {
    const now = new Date().toISOString();
    let updated = false;

    this.directMessages = this.directMessages.map(m => {
      if (m.conversationId === conversationId && m.recipientId === user.uid && !m.isRead) {
        updated = true;
        return {
          ...m,
          isRead: true,
          readAt: now,
        };
      }
      return m;
    });

    // Also mark related DIRECT_MESSAGE_RECEIVED notifications as read
    this.notifications = this.notifications.map(n => {
      if (n.conversationId === conversationId && n.recipientUserId === user.uid && !n.isRead) {
        updated = true;
        return {
          ...n,
          isRead: true,
          readAt: now,
        };
      }
      return n;
    });

    if (updated) {
      this.persist();
      this.notify();
    }
  }

  public getUnreadMessageCount(user: UserProfile): number {
    if (user.status === 'blocked' || user.status === 'terminated') return 0;
    return this.directMessages.filter(m => m.recipientId === user.uid && !m.isRead).length;
  }

  public getTotalUnreadInboxCount(user: UserProfile): number {
    return this.getUnreadNotificationCount(user) + this.getUnreadMessageCount(user);
  }
}

export const storageEngine = new ReactiveStorageEngine();
