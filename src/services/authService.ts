import { UserProfile, DemoPersona } from '../types/auth';
import { INITIAL_USERS } from './mockData';
import { storageEngine } from './storageEngine';

const AUTH_STORAGE_KEY = 'ojix_teamflow_current_user_uid';

type AuthListener = (user: UserProfile | null) => void;

class AuthService {
  private currentUser: UserProfile | null = null;
  private listeners: Set<AuthListener> = new Set();

  constructor() {
    this.restoreSession();
    storageEngine.subscribe(() => {
      if (this.currentUser) {
        const refreshed = storageEngine.getUser(this.currentUser.uid);
        if (refreshed) {
          this.currentUser = refreshed;
        }
      }
      this.notify();
    });
  }

  private restoreSession(): void {
    const savedUid = localStorage.getItem(AUTH_STORAGE_KEY);
    if (savedUid) {
      const found = storageEngine.getUser(savedUid);
      if (found) {
        this.currentUser = found;
        return;
      }
    }
    // Default to Project Lead (Sarah Chen) for immediate exploration
    const defaultLead = storageEngine.getUser('user-lead-sarah') || INITIAL_USERS[1];
    this.currentUser = defaultLead;
    localStorage.setItem(AUTH_STORAGE_KEY, defaultLead.uid);
  }

  public getCurrentUser(): UserProfile | null {
    return this.currentUser;
  }

  public getPersonas(): readonly DemoPersona[] {
    return storageEngine.getPersonas();
  }

  public getPersona(uid: string): DemoPersona | undefined {
    return storageEngine.getPersona(uid);
  }

  public switchPersona(uid: string): UserProfile {
    const user = storageEngine.getUser(uid);
    if (!user) {
      throw new Error(`Persona with UID ${uid} not found.`);
    }
    if (user.status === 'blocked') {
      throw new Error(`Account Suspended: User "${user.displayName}" is currently blocked by Workspace Admin.`);
    }
    if (user.status === 'terminated') {
      throw new Error(`Account Terminated: User "${user.displayName}" has been permanently terminated. Access revoked.`);
    }
    this.currentUser = user;
    localStorage.setItem(AUTH_STORAGE_KEY, user.uid);
    this.notify();
    return user;
  }

  public loginWithEmail(email: string): UserProfile {
    const user = storageEngine.getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      throw new Error('Invalid credentials. Use a seeded demo email or quick-select a persona.');
    }
    if (user.status === 'blocked') {
      throw new Error(`Account Suspended: User "${user.displayName}" is currently blocked by Workspace Admin.`);
    }
    if (user.status === 'terminated') {
      throw new Error(`Account Terminated: User "${user.displayName}" has been permanently terminated. Access revoked.`);
    }
    this.currentUser = user;
    localStorage.setItem(AUTH_STORAGE_KEY, user.uid);
    this.notify();
    return user;
  }

  public logout(): void {
    this.currentUser = null;
    localStorage.removeItem(AUTH_STORAGE_KEY);
    this.notify();
  }

  public resetDemoData(): void {
    storageEngine.clearAllData(true);
    this.restoreSession();
    this.notify();
  }

  public subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    listener(this.currentUser);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach(fn => fn(this.currentUser));
  }
}

export const authService = new AuthService();
