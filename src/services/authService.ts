import { UserProfile, DemoPersona } from '../types/auth';
import { DEMO_PERSONAS, INITIAL_USERS } from './mockData';
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
    const allUsers = storageEngine.getUsers();
    return allUsers.map(u => {
      const existingDemo = DEMO_PERSONAS.find(p => p.uid === u.uid);
      if (existingDemo) return existingDemo;
      return {
        uid: u.uid,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        roleLabel: u.role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
        description: `Custom user account (${u.role})`,
      };
    });
  }

  public switchPersona(uid: string): UserProfile {
    const user = storageEngine.getUser(uid);
    if (!user) {
      throw new Error(`Persona with UID ${uid} not found.`);
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
    storageEngine.initialize(true);
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
