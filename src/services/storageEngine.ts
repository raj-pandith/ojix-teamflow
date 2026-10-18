import { UserProfile, UserRole, UserStatus, DemoPersona } from '../types/auth';
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
  DEMO_PERSONAS,
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
  PERSONAS: 'ojix_teamflow_personas',
};

type Listener = () => void;

class ReactiveStorageEngine {
  private users: UserProfile[] = [];
  private personas: DemoPersona[] = [];
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
  private inFlightNotificationKeys: Set<string> = new Set();
  private isCrossTabSyncSetup = false;
  private eventSource: EventSource | null = null;

  constructor() {
    this.initialize();
    this.setupCrossTabSync();
  }

  private setupCrossTabSync(): void {
    if (typeof window === 'undefined' || this.isCrossTabSyncSetup) return;
    this.isCrossTabSyncSetup = true;

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

            if (Array.isArray(data.directMessages)) {
              for (const m of data.directMessages) {
                const idx = this.directMessages.findIndex(localM => localM.id === m.id);
                if (idx === -1) {
                  this.directMessages.push(m);
                  updated = true;
                } else if (m.isRead !== this.directMessages[idx].isRead) {
                  this.directMessages[idx] = { ...this.directMessages[idx], isRead: m.isRead };
                  updated = true;
                }
              }
            }

            if (Array.isArray(data.accounts)) {
              this.syncAccountsWithServer(data.accounts);
            }

            if (Array.isArray(data.projects)) {
              this.syncProjectsWithServer(data.projects, data.deletedProjectId);
            }

            if (Array.isArray(data.tasks)) {
              this.syncTasksWithServer(data.tasks, data.deletedTaskId);
            }

            if (updated) {
              this.persist();
              this.notify();
            }

            // Push local projects and tasks to server sync store
            if (this.projects.length > 0 || this.tasks.length > 0) {
              fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  projects: this.projects,
                  tasks: this.tasks,
                }),
              }).catch(() => {});
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
        if (this.eventSource) {
          this.eventSource.close();
        }
        this.eventSource = new EventSource('/api/sync/events');

        this.eventSource.addEventListener('connected', (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            const lastBootId = localStorage.getItem('ojix_server_boot_id');
            if (data.bootId && data.bootId !== lastBootId) {
              syncWithServer();
            }
          } catch {}
        });

        this.eventSource.addEventListener('notification', (event: MessageEvent) => {
          try {
            const notif = JSON.parse(event.data);
            if (notif && (notif.id || notif.deduplicationKey)) {
              const canonicalKey = notif.deduplicationKey || this.computeCanonicalNotificationKey(notif);
              const exists = this.notifications.some(
                n => n.id === notif.id || (n.deduplicationKey && n.deduplicationKey === canonicalKey)
              );
              if (!exists) {
                // Inward SSE update updates local cache without re-triggering outward push dispatches
                this.notifications.unshift({ ...notif, deduplicationKey: canonicalKey });
                this.persist();
                this.notify();
              }
            }
          } catch {}
        });

        this.eventSource.addEventListener('message', (event: MessageEvent) => {
          try {
            const msg: DirectMessage = JSON.parse(event.data);
            if (msg && msg.id) {
              const exists = this.directMessages.some(m => m.id === msg.id);
              if (!exists) {
                this.directMessages.push(msg);
                this.persist();
                this.notify();
              }
            }
          } catch {}
        });

        this.eventSource.addEventListener('sync', (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            let updated = false;

            if (Array.isArray(data.notifications)) {
              for (const n of data.notifications) {
                const canonicalKey = n.deduplicationKey || this.computeCanonicalNotificationKey(n);
                const exists = this.notifications.some(
                  localN => localN.id === n.id || (localN.deduplicationKey && localN.deduplicationKey === canonicalKey)
                );
                if (!exists) {
                  this.notifications.unshift({ ...n, deduplicationKey: canonicalKey });
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

            if (Array.isArray(data.directMessages)) {
              for (const m of data.directMessages) {
                const exists = this.directMessages.some(localM => localM.id === m.id);
                if (!exists) {
                  this.directMessages.push(m);
                  updated = true;
                }
              }
            }

            if (Array.isArray(data.accounts)) {
              this.syncAccountsWithServer(data.accounts);
            }

            if (Array.isArray(data.projects)) {
              this.syncProjectsWithServer(data.projects, data.deletedProjectId);
            }

            if (Array.isArray(data.tasks)) {
              this.syncTasksWithServer(data.tasks, data.deletedTaskId);
            }

            if (updated) {
              this.persist();
              this.notify();
            }
          } catch {}
        });

        this.eventSource.addEventListener('user_updated', (event: MessageEvent) => {
          try {
            const user = JSON.parse(event.data);
            if (user && user.uid) {
              this.syncAccountsWithServer([user]);
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
      this.personas = JSON.parse(localStorage.getItem(STORAGE_KEYS.PERSONAS) || 'null') ?? [...DEMO_PERSONAS];
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

  public clearAllData(preserveCorePersonas = true): void {
    this.inFlightMutations.clear();
    this.inFlightNotificationKeys.clear();
    this.projects = [];
    this.tasks = [];
    this.logs = [];
    this.deletionNotices = [];
    this.notifications = [];
    this.directMessages = [];

    if (preserveCorePersonas) {
      this.users = [...INITIAL_USERS];
      this.personas = [...DEMO_PERSONAS];
      this.syncPersonaProjectPermissions();
    } else {
      this.users = [];
      this.personas = [];
    }

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('ojix_') || k.includes('teamflow'))) {
            keysToRemove.push(k);
          }
        }
        for (const k of keysToRemove) {
          localStorage.removeItem(k);
        }
      }
    } catch {}

    this.persist();

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ type: 'CLEARED_ALL_DATA', timestamp: Date.now() });
      } catch {}
    }

    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      fetch('/api/clear-all-data', { method: 'POST' }).catch(() => {});
    }

    this.notify();
  }

  public initialize(forceReset = false): void {
    const isTestRuntime =
      (typeof process !== 'undefined' && (process.env?.NODE_ENV === 'test' || Boolean(process.env?.VITEST))) ||
      (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test');

    const CLEAR_ALL_SEED_KEY = 'ojix_teamflow_cleared_all_v4';

    if (forceReset) {
      if (isTestRuntime) {
        this.inFlightMutations.clear();
        this.inFlightNotificationKeys.clear();
        this.users = [...INITIAL_USERS];
        this.personas = [...DEMO_PERSONAS];
        this.projects = [...INITIAL_PROJECTS];
        this.tasks = [...INITIAL_TASKS];
        this.logs = [...INITIAL_ACTIVITY_LOGS];
        this.deletionNotices = [];
        this.notifications = [...INITIAL_NOTIFICATIONS];
        this.directMessages = [...INITIAL_DIRECT_MESSAGES];
        this.syncPersonaProjectPermissions();
        this.persist();
        this.notify();
        return;
      } else {
        this.clearAllData(true);
        return;
      }
    }

    // In browser runtime, mark initialized without wiping server data
    if (!isTestRuntime) {
      if (typeof window !== 'undefined' && window.localStorage && !localStorage.getItem(CLEAR_ALL_SEED_KEY)) {
        localStorage.setItem(CLEAR_ALL_SEED_KEY, 'cleared');
      }
    }

    if (typeof window !== 'undefined' && window.localStorage && !localStorage.getItem(STORAGE_KEYS.INITIALIZED)) {
      this.users = [...INITIAL_USERS];
      this.personas = [...DEMO_PERSONAS];
      this.projects = [...INITIAL_PROJECTS];
      this.tasks = [...INITIAL_TASKS];
      this.logs = [...INITIAL_ACTIVITY_LOGS];
      this.deletionNotices = [];
      this.notifications = [...INITIAL_NOTIFICATIONS];
      this.directMessages = [...INITIAL_DIRECT_MESSAGES];
      this.syncPersonaProjectPermissions();
      this.persist();
      localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
    } else {
      try {
        const rawUsers: UserProfile[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]') || INITIAL_USERS;
        this.users = (rawUsers.length > 0 ? rawUsers : INITIAL_USERS).map(u => ({
          ...u,
          status: u.status || 'active',
        }));
        this.personas = JSON.parse(localStorage.getItem(STORAGE_KEYS.PERSONAS) || 'null') ?? [...DEMO_PERSONAS];
        this.projects = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROJECTS) || '[]') || INITIAL_PROJECTS;
        this.tasks = JSON.parse(localStorage.getItem(STORAGE_KEYS.TASKS) || '[]') || INITIAL_TASKS;
        this.logs = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOGS) || '[]') || INITIAL_ACTIVITY_LOGS;
        this.deletionNotices = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTICES) || '[]');
        this.notifications = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS) || 'null') ?? INITIAL_NOTIFICATIONS;
        this.directMessages = JSON.parse(localStorage.getItem(STORAGE_KEYS.DIRECT_MESSAGES) || 'null') ?? INITIAL_DIRECT_MESSAGES;
        this.syncPersonaProjectPermissions();
      } catch {
        this.initialize(true);
      }
    }

    this.notify();
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(this.users));
      localStorage.setItem(STORAGE_KEYS.PERSONAS, JSON.stringify(this.personas));
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

  public syncAccountsWithServer(serverAccounts: UserProfile[]): void {
    if (!Array.isArray(serverAccounts) || serverAccounts.length === 0) return;
    let changed = false;

    for (const acc of serverAccounts) {
      if (!acc || !acc.uid) continue;
      const idx = this.users.findIndex(
        u => u.uid === acc.uid || (u.email && acc.email && u.email.toLowerCase() === acc.email.toLowerCase())
      );
      if (idx >= 0) {
        const existing = this.users[idx];
        const newStatus = acc.status || existing.status || 'active';
        const newRole = acc.role || existing.role;
        const newName = acc.displayName || existing.displayName;
        const newPhone = acc.phone !== undefined ? acc.phone : existing.phone;

        if (
          existing.status !== newStatus ||
          existing.role !== newRole ||
          existing.displayName !== newName ||
          existing.phone !== newPhone ||
          existing.uid !== acc.uid
        ) {
          this.users[idx] = {
            ...existing,
            uid: acc.uid,
            displayName: newName,
            email: acc.email || existing.email,
            role: newRole,
            status: newStatus,
            phone: newPhone,
            updatedAt: acc.updatedAt || new Date().toISOString(),
          };
          changed = true;
        }
      } else {
        const newUser: UserProfile = {
          uid: acc.uid,
          displayName: acc.displayName || (acc.email ? acc.email.split('@')[0] : 'Member'),
          email: acc.email ? acc.email.toLowerCase() : '',
          role: acc.role || 'member',
          status: acc.status || 'active',
          phone: acc.phone,
          createdAt: acc.createdAt || new Date().toISOString(),
          updatedAt: acc.updatedAt || new Date().toISOString(),
        };
        this.users.push(newUser);
        changed = true;
      }

      // Also ensure persona is kept in sync with user status and role
      const pIdx = this.personas.findIndex(
        p => p.uid === acc.uid || (p.email && acc.email && p.email.toLowerCase() === acc.email.toLowerCase())
      );
      const roleLabel =
        acc.role === 'workspace_admin'
          ? 'Workspace Admin'
          : acc.role === 'project_lead'
          ? 'Project Lead'
          : acc.role === 'member'
          ? 'Member'
          : 'Viewer (Read-Only)';

      const defaultDescription =
        acc.role === 'workspace_admin'
          ? 'Full workspace governance, member directory, and global settings.'
          : acc.role === 'project_lead'
          ? 'Creates projects, assigns work, and oversees project execution.'
          : acc.role === 'member'
          ? 'Executes assigned tasks, posts progress notes, and updates statuses.'
          : 'Observes permitted boards and dashboards; cannot modify any data.';

      if (pIdx >= 0) {
        const existingP = this.personas[pIdx];
        const targetStatus = acc.status || existingP.status || 'active';
        if (
          existingP.status !== targetStatus ||
          existingP.role !== acc.role ||
          existingP.displayName !== acc.displayName
        ) {
          this.personas[pIdx] = {
            ...existingP,
            uid: acc.uid,
            displayName: acc.displayName || existingP.displayName,
            role: acc.role || existingP.role,
            roleLabel,
            description: defaultDescription,
            status: targetStatus,
            phone: acc.phone !== undefined ? acc.phone : existingP.phone,
          };
          changed = true;
        }
      } else {
        const permitted = this.getPermittedProjectsForUser(acc);
        this.personas.push({
          uid: acc.uid,
          email: acc.email,
          displayName: acc.displayName || (acc.email ? acc.email.split('@')[0] : 'Member'),
          role: acc.role || 'member',
          roleLabel,
          description: defaultDescription,
          phone: acc.phone,
          status: acc.status || 'active',
          permittedProjects: permitted.names,
          permittedProjectIds: permitted.ids,
        });
        changed = true;
      }
    }

    if (changed) {
      this.syncPersonaProjectPermissions();
      this.persist();
      this.notify();
    }
  }

  public syncProjectsWithServer(serverProjects: Project[], deletedProjectId?: string): void {
    if (deletedProjectId) {
      const prevLen = this.projects.length;
      this.projects = this.projects.filter(p => p.id !== deletedProjectId);
      this.tasks = this.tasks.filter(t => t.projectId !== deletedProjectId);
      if (this.projects.length !== prevLen) {
        this.syncPersonaProjectPermissions();
        this.persist();
        this.notify();
      }
    }

    if (!Array.isArray(serverProjects) || serverProjects.length === 0) return;
    let changed = false;

    for (const sp of serverProjects) {
      if (!sp || !sp.id) continue;
      const idx = this.projects.findIndex(p => p.id === sp.id);
      if (idx === -1) {
        this.projects.push(sp);
        changed = true;
      } else {
        const local = this.projects[idx];
        const combinedMemberIds = Array.from(new Set([...(local.memberIds || []), ...(sp.memberIds || [])]));
        const isServerNewer = !local.updatedAt || !sp.updatedAt || new Date(sp.updatedAt) >= new Date(local.updatedAt);
        const merged: Project = {
          ...(isServerNewer ? sp : local),
          memberIds: combinedMemberIds,
        };
        if (JSON.stringify(merged) !== JSON.stringify(local)) {
          this.projects[idx] = merged;
          changed = true;
        }
      }
    }

    if (changed) {
      this.syncPersonaProjectPermissions();
      this.persist();
      this.notify();
    }
  }

  public syncTasksWithServer(serverTasks: Task[], deletedTaskId?: string): void {
    if (deletedTaskId) {
      const prevLen = this.tasks.length;
      this.tasks = this.tasks.filter(t => t.id !== deletedTaskId);
      if (this.tasks.length !== prevLen) {
        this.persist();
        this.notify();
      }
    }

    if (!Array.isArray(serverTasks) || serverTasks.length === 0) return;
    let changed = false;

    for (const st of serverTasks) {
      if (!st || !st.id) continue;
      const idx = this.tasks.findIndex(t => t.id === st.id);
      if (idx === -1) {
        this.tasks.push(st);
        changed = true;
      } else {
        const local = this.tasks[idx];
        const isServerNewer = !local.updatedAt || !st.updatedAt || new Date(st.updatedAt) >= new Date(local.updatedAt);
        if (isServerNewer && JSON.stringify(st) !== JSON.stringify(local)) {
          this.tasks[idx] = st;
          changed = true;
        }
      }
    }

    if (changed) {
      this.persist();
      this.notify();
    }
  }

  public pushSyncToServer(payload?: {
    notifications?: AppNotification[];
    logs?: ActivityLogEntry[];
    directMessages?: DirectMessage[];
    projects?: Project[];
    tasks?: Task[];
  }): void {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
    const body = payload || {
      projects: this.projects,
      tasks: this.tasks,
      notifications: this.notifications,
      logs: this.logs,
      directMessages: this.directMessages,
    };
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});
  }

  public pushDeleteProjectToServer(projectId: string): void {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
    fetch('/api/sync/delete-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    }).catch(() => {});
  }

  public pushDeleteTaskToServer(taskId: string): void {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
    fetch('/api/sync/delete-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId }),
    }).catch(() => {});
  }

  // ---- Dynamic Personas & Permitted Projects ----
  public getPermittedProjectsForUser(user: { uid: string; role: UserRole }): { names: string[]; ids: string[] } {
    if (user.role === 'workspace_admin') {
      return {
        names: this.projects.map(p => p.name),
        ids: this.projects.map(p => p.id),
      };
    }
    const matched = this.projects.filter(
      p => p.memberIds.includes(user.uid) || (user.role === 'project_lead' && p.ownerId === user.uid)
    );
    return {
      names: matched.map(p => p.name),
      ids: matched.map(p => p.id),
    };
  }

  public syncPersonaProjectPermissions(): void {
    for (let i = 0; i < this.personas.length; i++) {
      const p = this.personas[i];
      const permitted = this.getPermittedProjectsForUser(p);
      this.personas[i] = {
        ...p,
        permittedProjects: permitted.names,
        permittedProjectIds: permitted.ids,
      };
    }
  }

  public getPersonas(): DemoPersona[] {
    // Ensure all active workspace users have corresponding persona entries
    const existingUids = new Set(this.personas.map(p => p.uid));
    for (const u of this.users) {
      if (!existingUids.has(u.uid)) {
        const roleLabel =
          u.role === 'workspace_admin'
            ? 'Workspace Admin'
            : u.role === 'project_lead'
            ? 'Project Lead'
            : u.role === 'member'
            ? 'Member'
            : 'Viewer (Read-Only)';

        const description =
          u.role === 'workspace_admin'
            ? 'Full workspace governance, member directory, and global settings.'
            : u.role === 'project_lead'
            ? 'Creates projects, assigns work, and oversees project execution.'
            : u.role === 'member'
            ? 'Executes assigned tasks, posts progress notes, and updates statuses.'
            : 'Observes permitted boards and dashboards; cannot modify any data.';

        const permitted = this.getPermittedProjectsForUser(u);

        const dynamicPersona: DemoPersona = {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          role: u.role,
          roleLabel,
          description,
          phone: u.phone,
          status: u.status || 'active',
          permittedProjects: permitted.names,
          permittedProjectIds: permitted.ids,
        };
        this.personas.push(dynamicPersona);
        existingUids.add(u.uid);
      }
    }

    // Always dynamically sync and return latest permitted projects
    return this.personas.map(p => {
      const permitted = this.getPermittedProjectsForUser(p);
      return {
        ...p,
        permittedProjects: permitted.names,
        permittedProjectIds: permitted.ids,
      };
    });
  }

  public getPersona(uid: string): DemoPersona | undefined {
    return this.getPersonas().find(p => p.uid === uid);
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
      try {
        this.addTeamMember(addToProjectId, newUser.uid, caller);
      } catch (err) {
        console.warn('Failed to add new user to project team:', err);
      }
    }

    // Dynamically create and register persona for new user
    const roleLabel =
      newUser.role === 'workspace_admin'
        ? 'Workspace Admin'
        : newUser.role === 'project_lead'
        ? 'Project Lead'
        : newUser.role === 'member'
        ? 'Member'
        : 'Viewer (Read-Only)';

    const defaultDescription =
      newUser.role === 'workspace_admin'
        ? 'Full workspace governance, member directory, and global settings.'
        : newUser.role === 'project_lead'
        ? 'Creates projects, assigns work, and oversees project execution.'
        : newUser.role === 'member'
        ? 'Executes assigned tasks, posts progress notes, and updates statuses.'
        : 'Observes permitted boards and dashboards; cannot modify any data.';

    const permitted = this.getPermittedProjectsForUser(newUser);

    const newPersona: DemoPersona = {
      uid: newUser.uid,
      email: newUser.email,
      displayName: newUser.displayName,
      role: newUser.role,
      roleLabel,
      description: defaultDescription,
      phone: newUser.phone,
      status: newUser.status,
      permittedProjects: permitted.names,
      permittedProjectIds: permitted.ids,
    };

    const pIdx = this.personas.findIndex(p => p.uid === newUser.uid);
    if (pIdx >= 0) {
      this.personas[pIdx] = newPersona;
    } else {
      this.personas.push(newPersona);
    }

    this.syncPersonaProjectPermissions();
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

    if (updates.role && updates.role !== existing.role) {
      this.addNotification({
        id: `notif-role-${updatedUser.uid}-${Date.now().toString(36)}`,
        recipientUserId: updatedUser.uid,
        actorUserId: caller.uid,
        actorDisplayName: caller.displayName,
        type: 'PROJECT_ROLE_CHANGED',
        title: 'Role updated',
        body: `Your workspace role has been changed to ${updatedUser.role.replace('_', ' ').toUpperCase()} by ${caller.displayName}.`,
        entityType: 'user',
        entityId: updatedUser.uid,
        isRead: false,
        createdAt: new Date().toISOString(),
        deduplicationKey: `role-${updatedUser.uid}-${updatedUser.role}`,
      });
    }

    // Keep persona in sync with user profile updates
    const personaIndex = this.personas.findIndex(p => p.uid === uid);
    if (personaIndex >= 0) {
      const existingPersona = this.personas[personaIndex];
      const newRole = updatedUser.role;
      const roleLabel =
        newRole === 'workspace_admin'
          ? 'Workspace Admin'
          : newRole === 'project_lead'
          ? 'Project Lead'
          : newRole === 'member'
          ? 'Member'
          : 'Viewer (Read-Only)';

      const description =
        newRole === 'workspace_admin'
          ? 'Full workspace governance, member directory, and global settings.'
          : newRole === 'project_lead'
          ? 'Creates projects, assigns work, and oversees project execution.'
          : newRole === 'member'
          ? 'Executes assigned tasks, posts progress notes, and updates statuses.'
          : 'Observes permitted boards and dashboards; cannot modify any data.';

      this.personas[personaIndex] = {
        ...existingPersona,
        displayName: updatedUser.displayName,
        email: updatedUser.email,
        phone: updatedUser.phone,
        role: updatedUser.role,
        roleLabel,
        description,
        status: updatedUser.status,
      };
    }

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
      this.addNotification({
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
        this.addNotification({
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

    // Update persona status in registry
    const personaIndex = this.personas.findIndex(p => p.uid === uid);
    if (personaIndex >= 0) {
      this.personas[personaIndex] = {
        ...this.personas[personaIndex],
        status,
      };
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
      const dedupKey = `pmem-${project.id}-${targetUser.uid}-added_member`;
      this.addNotification({
        id: `notif-pmem-${project.id}-${targetUser.uid}-added_member`,
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
        deduplicationKey: dedupKey,
      });
    }

    this.syncPersonaProjectPermissions();
    this.persist();
    this.notify();
    this.pushSyncToServer({ projects: [this.projects[pIndex]] });
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
      this.addNotification({
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

    this.syncPersonaProjectPermissions();
    this.persist();
    this.notify();
    this.pushSyncToServer({ projects: [this.projects[pIndex]], tasks: reassignedTasks });

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
      this.syncPersonaProjectPermissions();
      this.persist();
      this.notify();
      this.pushSyncToServer({ projects: [this.projects[pIndex]] });
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
    this.syncPersonaProjectPermissions();
    this.persist();
    this.notify();
    this.pushSyncToServer({ projects: [project] });
  }

  public deleteProject(projectId: string, user: UserProfile, reason?: string): void {
    if (user.role !== 'workspace_admin' && user.role !== 'project_lead') {
      throw new Error('Permission denied: Only Workspace Admins and Project Leads can delete projects.');
    }
    const index = this.projects.findIndex(p => p.id === projectId);
    if (index === -1) return;

    const project = this.projects[index];
    const cleanReason = reason?.trim() || '';

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
      reason: cleanReason || null,
    };
    this.deletionNotices.unshift(notice);

    // Create persistent inbox notifications strictly for project team members (excluding actor)
    const now = new Date().toISOString();
    const formattedDate = new Date().toLocaleString();
    const teamMemberSet = new Set(project.memberIds || []);
    if (project.ownerId) {
      teamMemberSet.add(project.ownerId);
    }
    teamMemberSet.delete(user.uid);
    const allRecipients = Array.from(teamMemberSet);

    const bodyText = cleanReason
      ? `The project "${project.name}" has been deleted by ${user.displayName}.\nReason: ${cleanReason}`
      : `The project "${project.name}" has been deleted by ${user.displayName} on ${formattedDate}.`;

    for (const recipientId of allRecipients) {
      this.addNotification({
        id: `notif-pdel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        recipientUserId: recipientId,
        actorUserId: user.uid,
        actorDisplayName: user.displayName,
        type: 'PROJECT_DELETED',
        title: 'Project deleted',
        body: bodyText,
        deletionReason: cleanReason || null,
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

    this.syncPersonaProjectPermissions();
    this.persist();
    this.notify();
    this.pushDeleteProjectToServer(projectId);
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
      if (user.role === 'member') {
        throw new Error('Permission denied: Members cannot create tasks. Only Workspace Admins and Project Leads can create tasks.');
      }
      this.tasks.push(task);
    }
    this.persist();
    this.notify();
    this.pushSyncToServer({ tasks: [task] });
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
    this.pushDeleteTaskToServer(taskId);
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

  // ---- Notification Canonical Deduplication & Observability ----
  public computeCanonicalNotificationKey(notification: AppNotification): string {
    if (notification.deduplicationKey) {
      return notification.deduplicationKey;
    }
    const type = notification.type;
    const recipient = notification.recipientUserId;
    const projId = notification.projectId || notification.entityId || 'general';
    const taskId = notification.taskId || notification.entityId || 'none';

    switch (type) {
      case 'PROJECT_ASSIGNED':
      case 'PROJECT_MEMBER_ADDED':
      case 'PROJECT_MEMBER_REMOVED':
        return `pmem-${projId}-${recipient}-${type}`;
      case 'TASK_ASSIGNED':
      case 'TASK_REASSIGNED':
        return `tskasg-${taskId}-${recipient}-${type}`;
      case 'TASK_COMMENT_MENTION':
        return `mnt-${notification.commentId || taskId}-${recipient}`;
      case 'PROJECT_DELETED':
        return `pdel-${projId}-${recipient}`;
      case 'USER_BLOCKED':
        return `blk-${notification.entityId || recipient}`;
      default:
        return `notif-${type}-${recipient}-${projId}-${taskId}`;
    }
  }

  private logNotificationEvent(
    action: 'NOTIFICATION_CREATED' | 'DUPLICATE_IDEMPOTENT_SKIPPED' | 'DUPLICATE_CONCURRENT_REJECTED' | 'PUSH_DISPATCHED' | 'PUSH_FAILED',
    notif: AppNotification,
    details?: string
  ): void {
    if (process.env.NODE_ENV === 'test' && !process.env.DEBUG_NOTIFS) return;
    const logPayload = {
      event: action,
      type: notif.type,
      recipientId: notif.recipientUserId,
      projectId: notif.projectId || notif.entityId,
      taskId: notif.taskId,
      deduplicationKey: notif.deduplicationKey,
      notificationId: notif.id,
      timestamp: new Date().toISOString(),
      ...(details ? { details } : {}),
    };
    console.info(`[NotificationService] ${action}:`, JSON.stringify(logPayload));
  }

  public addNotification(notification: AppNotification): boolean {
    if (!notification || !notification.recipientUserId) {
      return false;
    }

    const canonicalKey = this.computeCanonicalNotificationKey(notification);
    const enrichedNotif: AppNotification = {
      ...notification,
      deduplicationKey: canonicalKey,
    };

    // 1. Concurrency guard: reject concurrent in-flight duplicates
    if (this.inFlightNotificationKeys.has(canonicalKey)) {
      this.logNotificationEvent('DUPLICATE_CONCURRENT_REJECTED', enrichedNotif);
      return false;
    }

    // 2. Database-level uniqueness check (both by ID and by canonical business deduplicationKey)
    const alreadyExists = this.notifications.some(
      n => n.id === enrichedNotif.id || (n.deduplicationKey && n.deduplicationKey === canonicalKey)
    );

    if (alreadyExists) {
      this.logNotificationEvent('DUPLICATE_IDEMPOTENT_SKIPPED', enrichedNotif);
      return false;
    }

    // 3. Lock key during processing
    this.inFlightNotificationKeys.add(canonicalKey);

    try {
      this.notifications.unshift(enrichedNotif);
      this.persist();
      this.notify();
      this.logNotificationEvent('NOTIFICATION_CREATED', enrichedNotif);

      // 4. Asynchronously deliver push (isolated from persistence)
      this.dispatchPushNotification(enrichedNotif);
      this.pushSyncToServer({ notifications: [enrichedNotif] });
      return true;
    } finally {
      // Release in-flight lock after execution completes
      this.inFlightNotificationKeys.delete(canonicalKey);
    }
  }

  public addNotifications(notifications: AppNotification[]): AppNotification[] {
    const newlyAdded: AppNotification[] = [];
    for (const notif of notifications) {
      const added = this.addNotification(notif);
      if (added) {
        newlyAdded.push(notif);
      }
    }
    return newlyAdded;
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

    // Real-time backend API synchronization
    try {
      if (typeof fetch !== 'undefined') {
        fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newMsg),
        }).catch(() => {});
      }
    } catch {}

    this.pushSyncToServer({ directMessages: [newMsg] });
    return newMsg;
  }

  public async fetchConversationMessages(
    conversationId: string,
    user: UserProfile,
    page: number = 1,
    pageSize: number = 20
  ): Promise<{
    messages: DirectMessage[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasMore: boolean;
  }> {
    if (user.status === 'blocked' || user.status === 'terminated') {
      throw new Error(`Permission denied: Your workspace account is ${user.status}. Message access revoked.`);
    }

    let serverTotal = 0;
    let serverTotalPages = 1;
    let serverHasMore = false;
    let fetchedFromBackend = false;
    let backendMessages: DirectMessage[] = [];

    try {
      if (typeof fetch !== 'undefined') {
        const queryParams = new URLSearchParams({
          conversationId,
          userId: user.uid,
          page: String(page),
          pageSize: String(pageSize),
        });
        const res = await fetch(`/api/messages?${queryParams.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.messages)) {
            fetchedFromBackend = true;
            backendMessages = data.messages;
            serverTotal = typeof data.total === 'number' ? data.total : data.messages.length;
            serverTotalPages = typeof data.totalPages === 'number' ? data.totalPages : Math.max(1, Math.ceil(serverTotal / pageSize));
            serverHasMore = Boolean(data.hasMore);

            let updated = false;
            for (const m of data.messages) {
              const idx = this.directMessages.findIndex(localM => localM.id === m.id);
              if (idx === -1) {
                this.directMessages.push(m);
                updated = true;
              } else if (m.isRead !== this.directMessages[idx].isRead) {
                this.directMessages[idx] = { ...this.directMessages[idx], isRead: m.isRead };
                updated = true;
              }
            }
            if (updated) {
              this.persist();
              this.notify();
            }
          }
        }
      }
    } catch {}

    if (fetchedFromBackend) {
      return {
        messages: backendMessages,
        total: serverTotal,
        page,
        pageSize,
        totalPages: serverTotalPages,
        hasMore: serverHasMore,
      };
    }

    // Local / Offline fallback pagination
    const all = this.getDirectMessages(user, conversationId);
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.max(1, Math.min(page, totalPages));
    const startIndex = (safePage - 1) * pageSize;
    const paged = all.slice(startIndex, startIndex + pageSize);

    return {
      messages: paged,
      total,
      page: safePage,
      pageSize,
      totalPages,
      hasMore: safePage < totalPages,
    };
  }

  public getDirectMessagesPaginated(
    user: UserProfile,
    conversationId?: string,
    page: number = 1,
    pageSize: number = 20
  ): {
    messages: DirectMessage[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasMore: boolean;
  } {
    const all = this.getDirectMessages(user, conversationId);
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.max(1, Math.min(page, totalPages));
    const startIndex = (safePage - 1) * pageSize;
    const paged = all.slice(startIndex, startIndex + pageSize);

    return {
      messages: paged,
      total,
      page: safePage,
      pageSize,
      totalPages,
      hasMore: safePage < totalPages,
    };
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
      this.pushSyncToServer({ directMessages: [this.directMessages[idx]] });
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
      const updatedMessages = this.directMessages.filter(
        m => m.conversationId === conversationId && m.recipientId === user.uid
      );
      this.pushSyncToServer({ directMessages: updatedMessages });
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
