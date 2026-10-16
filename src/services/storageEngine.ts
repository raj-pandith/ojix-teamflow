import { UserProfile } from '../types/auth';
import { Project } from '../types/project';
import { Task } from '../types/task';
import { ActivityLogEntry } from '../types/audit';
import { INITIAL_USERS, INITIAL_PROJECTS, INITIAL_TASKS, INITIAL_ACTIVITY_LOGS } from './mockData';

const STORAGE_KEYS = {
  USERS: 'ojix_teamflow_users',
  PROJECTS: 'ojix_teamflow_projects',
  TASKS: 'ojix_teamflow_tasks',
  LOGS: 'ojix_teamflow_logs',
  SESSION: 'ojix_teamflow_session',
  INITIALIZED: 'ojix_teamflow_initialized',
};

type Listener = () => void;

class ReactiveStorageEngine {
  private users: UserProfile[] = [];
  private projects: Project[] = [];
  private tasks: Task[] = [];
  private logs: ActivityLogEntry[] = [];
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
      this.persist();
      localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
    } else {
      try {
        this.users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]') || INITIAL_USERS;
        this.projects = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROJECTS) || '[]') || INITIAL_PROJECTS;
        this.tasks = JSON.parse(localStorage.getItem(STORAGE_KEYS.TASKS) || '[]') || INITIAL_TASKS;
        this.logs = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOGS) || '[]') || INITIAL_ACTIVITY_LOGS;
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
  public async executeIdempotent<T>(key: string, mutationFn: () => Promise<T>): Promise<T> {
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

  public addUser(user: UserProfile, caller: UserProfile, addToProjectId?: string): void {
    if (caller.role !== 'workspace_admin') {
      throw new Error('Permission denied: Only Workspace Admins can add or invite new members.');
    }
    const exists = this.users.some(u => u.email.toLowerCase() === user.email.toLowerCase());
    if (exists) {
      throw new Error(`A user with email ${user.email} already exists.`);
    }
    this.users.push(user);
    if (addToProjectId) {
      const pIndex = this.projects.findIndex(p => p.id === addToProjectId);
      if (pIndex >= 0 && !this.projects[pIndex].memberIds.includes(user.uid)) {
        this.projects[pIndex] = {
          ...this.projects[pIndex],
          memberIds: [...this.projects[pIndex].memberIds, user.uid],
          updatedAt: new Date().toISOString(),
        };
      }
    }
    this.persist();
    this.notify();
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
    if (user.role === 'viewer') {
      throw new Error('Permission denied: Viewers have read-only access and cannot mutate tasks.');
    }
    // Verify membership in project
    this.getProjectById(task.projectId, user);

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
    if (user.role === 'viewer') {
      throw new Error('Permission denied: Viewers cannot delete tasks.');
    }
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;

    const project = this.getProjectById(task.projectId, user);
    if (user.role !== 'workspace_admin' && project?.ownerId !== user.uid && task.createdBy !== user.uid) {
      throw new Error('Permission denied: Insufficient privileges to delete task.');
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
