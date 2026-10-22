import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  Firestore,
} from 'firebase/firestore';

export interface SharedSyncData {
  notifications: any[];
  logs: any[];
  directMessages: any[];
  projects: any[];
  tasks: any[];
}

export interface SharedAuthData {
  accounts: any[];
  invitations: any[];
}

export class CloudPersistenceService {
  private db: Firestore | null = null;
  private isFirebaseConfigured = false;
  private localSyncPath = path.resolve(process.cwd(), '.server-sync.json');

  constructor() {
    this.initFirebase();
  }

  private initFirebase(): void {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
    const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;

    if (projectId && apiKey && projectId !== 'ojix-teamflow-demo') {
      try {
        const config = {
          apiKey,
          authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
          projectId,
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
          messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '000000000000',
          appId: process.env.FIREBASE_APP_ID || '1:000000000000:web:000000000000',
        };

        const app = !getApps().length ? initializeApp(config) : getApp();
        this.db = getFirestore(app);
        this.isFirebaseConfigured = true;
        console.log(`[CloudPersistence] Connected to Google Cloud Firestore (Project: ${projectId})`);
      } catch (err) {
        console.warn('[CloudPersistence] Failed to initialize Cloud Firestore, falling back to local file store:', err);
        this.isFirebaseConfigured = false;
        this.db = null;
      }
    } else {
      this.isFirebaseConfigured = false;
      this.db = null;
    }
  }

  public isCloudReady(): boolean {
    return this.isFirebaseConfigured && this.db !== null;
  }

  public getStorageType(): 'firestore' | 'local_json' {
    return this.isCloudReady() ? 'firestore' : 'local_json';
  }

  // =========================================================================
  // WORKSPACE COLLABORATIVE SYNC (Projects, Tasks, Messages, Logs, Notifications)
  // =========================================================================

  public async loadSyncData(): Promise<SharedSyncData> {
    // 1. Try Cloud Firestore if configured
    if (this.isCloudReady() && this.db) {
      try {
        const syncRef = doc(this.db, 'system_state', 'workspace_sync');
        const snap = await getDoc(syncRef);
        if (snap.exists()) {
          const d = snap.data();
          return {
            notifications: Array.isArray(d.notifications) ? d.notifications : [],
            logs: Array.isArray(d.logs) ? d.logs : [],
            directMessages: Array.isArray(d.directMessages) ? d.directMessages : [],
            projects: Array.isArray(d.projects) ? d.projects : [],
            tasks: Array.isArray(d.tasks) ? d.tasks : [],
          };
        }
      } catch (err) {
        console.warn('[CloudPersistence] Error reading from Cloud Firestore, falling back to local store:', err);
      }
    }

    // 2. Fallback to local .server-sync.json
    try {
      if (fs.existsSync(this.localSyncPath)) {
        const raw = fs.readFileSync(this.localSyncPath, 'utf8');
        const parsed = JSON.parse(raw);
        return {
          notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
          logs: Array.isArray(parsed.logs) ? parsed.logs : [],
          directMessages: Array.isArray(parsed.directMessages) ? parsed.directMessages : [],
          projects: Array.isArray(parsed.projects) ? parsed.projects : [],
          tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        };
      }
    } catch {
      // Return empty default state
    }

    return {
      notifications: [],
      logs: [],
      directMessages: [],
      projects: [],
      tasks: [],
    };
  }

  public async saveSyncData(data: SharedSyncData): Promise<void> {
    // 1. Persist to Cloud Firestore if configured
    if (this.isCloudReady() && this.db) {
      try {
        const syncRef = doc(this.db, 'system_state', 'workspace_sync');
        await setDoc(syncRef, {
          notifications: data.notifications.slice(0, 500),
          logs: data.logs.slice(0, 500),
          directMessages: data.directMessages.slice(0, 1000),
          projects: data.projects,
          tasks: data.tasks,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (err) {
        console.warn('[CloudPersistence] Error writing to Cloud Firestore:', err);
      }
    }

    // 2. Always maintain local file backup
    try {
      fs.writeFileSync(this.localSyncPath, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // Safe no-op in read-only filesystems
    }
  }

  // =========================================================================
  // USER ACCOUNTS & INVITATIONS STORE
  // =========================================================================

  public async loadAuthData(): Promise<SharedAuthData | null> {
    if (this.isCloudReady() && this.db) {
      try {
        const authRef = doc(this.db, 'system_state', 'auth_store');
        const snap = await getDoc(authRef);
        if (snap.exists()) {
          const d = snap.data();
          return {
            accounts: Array.isArray(d.accounts) ? d.accounts : [],
            invitations: Array.isArray(d.invitations) ? d.invitations : [],
          };
        }
      } catch (err) {
        console.warn('[CloudPersistence] Error reading auth store from Cloud Firestore:', err);
      }
    }
    return null;
  }

  public async saveAuthData(data: SharedAuthData): Promise<void> {
    if (this.isCloudReady() && this.db) {
      try {
        const authRef = doc(this.db, 'system_state', 'auth_store');
        await setDoc(authRef, {
          accounts: data.accounts,
          invitations: data.invitations,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (err) {
        console.warn('[CloudPersistence] Error saving auth store to Cloud Firestore:', err);
      }
    }
  }
}

export const cloudPersistence = new CloudPersistenceService();
