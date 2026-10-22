import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';

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
  sessions?: { [token: string]: { uid: string; expiresAt: number } };
}

export interface CloudHealthStatus {
  ready: boolean;
  database: 'firestore' | 'local_json' | 'unconfigured';
  storageType: 'firestore' | 'local_json';
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  projectId?: string;
  mode: 'production' | 'development' | 'test';
}

export class CloudPersistenceService {
  private db: admin.firestore.Firestore | null = null;
  private isFirebaseConfigured = false;
  private activeProjectId: string = '';
  private localSyncPath = path.resolve(process.cwd(), '.server-sync.json');
  private localAuthPath = path.resolve(process.cwd(), '.server-auth.json');
  private initError: string | null = null;

  constructor() {
    this.initFirebase();
  }

  public isProduction(): boolean {
    const isViteCli = process.argv.some(arg => arg.toLowerCase().includes('vite'));
    if (isViteCli) {
      return false;
    }
    return process.env.NODE_ENV === 'production';
  }

  public isStrictPersistence(): boolean {
    return this.isProduction() || process.env.STRICT_PERSISTENCE === 'true';
  }

  public allowLocalFallback(): boolean {
    // In production or when STRICT_PERSISTENCE is set, local fallback is STRICTLY prohibited.
    if (this.isStrictPersistence()) {
      return false;
    }
    return process.env.ALLOW_LOCAL_FALLBACK !== 'false';
  }

  public getDb(): admin.firestore.Firestore | null {
    return this.db;
  }

  /**
   * Initializes Firebase Admin SDK once using privileged server credentials.
   * Credential resolution priority:
   * 1. FIREBASE_SERVICE_ACCOUNT / FIREBASE_SERVICE_ACCOUNT_KEY / GOOGLE_CREDENTIALS_JSON (Raw JSON or Base64)
   * 2. GOOGLE_APPLICATION_CREDENTIALS file path
   * 3. FIRESTORE_EMULATOR_HOST (Local emulator testing)
   * 4. FIREBASE_PROJECT_ID (Default application credentials in GCP/Render environment)
   */
  public initFirebase(): void {
    if (this.isFirebaseConfigured && this.db) {
      return;
    }

    try {
      // 1. If an Admin app is already initialized, reuse it safely
      if (admin.apps.length > 0 && admin.apps[0]) {
        this.db = admin.firestore();
        this.db.settings({ ignoreUndefinedProperties: true });
        this.isFirebaseConfigured = true;
        this.activeProjectId = admin.apps[0].options.projectId || 'ojix-teamflow';
        this.initError = null;
        console.log(`[CloudPersistence] Reusing active Firebase Admin app (Project: ${this.activeProjectId})`);
        return;
      }

      // 2. Check for Service Account JSON in environment variables
      const serviceAccountRaw =
        process.env.FIREBASE_SERVICE_ACCOUNT ||
        process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
        process.env.GOOGLE_CREDENTIALS_JSON;

      const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
      const explicitProjectId =
        process.env.FIREBASE_PROJECT_ID ||
        process.env.VITE_FIREBASE_PROJECT_ID ||
        'ojix-teamflow';

      if (serviceAccountRaw && serviceAccountRaw.trim()) {
        const trimmed = serviceAccountRaw.trim();
        let sa: any = null;

        try {
          if (trimmed.startsWith('{')) {
            sa = JSON.parse(trimmed);
          } else {
            // Attempt Base64 decode
            const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
            sa = JSON.parse(decoded);
          }
        } catch {
          throw new Error('Invalid JSON format in FIREBASE_SERVICE_ACCOUNT environment variable');
        }

        if (!sa || typeof sa !== 'object') {
          throw new Error('FIREBASE_SERVICE_ACCOUNT must be a valid JSON object');
        }

        if (!sa.project_id || !sa.private_key || !sa.client_email) {
          throw new Error('FIREBASE_SERVICE_ACCOUNT is missing required fields (project_id, private_key, client_email)');
        }

        // Format private key properly (replace escaped newlines with actual newlines)
        const formattedPrivateKey = sa.private_key.replace(/\\n/g, '\n');

        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: sa.project_id,
            clientEmail: sa.client_email,
            privateKey: formattedPrivateKey,
          }),
          projectId: sa.project_id,
        });

        this.activeProjectId = sa.project_id;
        this.db = admin.firestore();
        this.db.settings({ ignoreUndefinedProperties: true });
        this.isFirebaseConfigured = true;
        this.initError = null;
        console.log(
          `[CloudPersistence] Initialized Firebase Admin SDK via service account (Project: ${this.activeProjectId}, Client: ${sa.client_email})`
        );
        return;
      }

      // 3. Check for GOOGLE_APPLICATION_CREDENTIALS file path
      const googleAppCredsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (googleAppCredsPath && fs.existsSync(googleAppCredsPath)) {
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          projectId: explicitProjectId,
        });

        this.activeProjectId = explicitProjectId;
        this.db = admin.firestore();
        this.db.settings({ ignoreUndefinedProperties: true });
        this.isFirebaseConfigured = true;
        this.initError = null;
        console.log(`[CloudPersistence] Initialized Firebase Admin SDK via GOOGLE_APPLICATION_CREDENTIALS file`);
        return;
      }

      // 4. Check for Firestore Emulator
      if (emulatorHost) {
        admin.initializeApp({
          projectId: explicitProjectId,
        });

        this.activeProjectId = explicitProjectId;
        this.db = admin.firestore();
        this.db.settings({ ignoreUndefinedProperties: true });
        this.isFirebaseConfigured = true;
        this.initError = null;
        console.log(`[CloudPersistence] Connected to Firestore Emulator at ${emulatorHost} (Project: ${explicitProjectId})`);
        return;
      }

      // 5. Check if running in GCP environment with default project
      if (process.env.FIREBASE_PROJECT_ID && !this.isProduction()) {
        // In local/dev with project ID only, attempt application default
        try {
          admin.initializeApp({
            credential: admin.credential.applicationDefault(),
            projectId: process.env.FIREBASE_PROJECT_ID,
          });
          this.activeProjectId = process.env.FIREBASE_PROJECT_ID;
          this.db = admin.firestore();
          this.db.settings({ ignoreUndefinedProperties: true });
          this.isFirebaseConfigured = true;
          this.initError = null;
          console.log(`[CloudPersistence] Connected via Application Default Credentials (Project: ${this.activeProjectId})`);
          return;
        } catch {
          // ADC not available in local environment, fall through to dev handling
        }
      }

      // 6. No credentials available
      this.isFirebaseConfigured = false;
      this.db = null;

      if (this.isStrictPersistence()) {
        const errorMsg =
          'CRITICAL: Production startup missing Firebase Admin credentials. Provide FIREBASE_SERVICE_ACCOUNT JSON or GOOGLE_APPLICATION_CREDENTIALS.';
        this.initError = errorMsg;
        console.error(`[CloudPersistence] ${errorMsg}`);
      } else {
        console.log(
          `[CloudPersistence] No Cloud Firestore credentials provided. Running in development mode using local JSON persistence.`
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.isFirebaseConfigured = false;
      this.db = null;
      this.initError = message;

      if (this.isStrictPersistence()) {
        console.error(`[CloudPersistence] Critical initialization error in production: ${message}`);
      } else {
        console.warn(`[CloudPersistence] Failed to initialize Cloud Firestore, falling back to local storage: ${message}`);
      }
    }
  }

  public isCloudReady(): boolean {
    return this.isFirebaseConfigured && this.db !== null;
  }

  public getStorageType(): 'firestore' | 'local_json' {
    return this.isCloudReady() ? 'firestore' : 'local_json';
  }

  public getActiveProjectId(): string {
    return this.activeProjectId;
  }

  public getInitError(): string | null {
    return this.initError;
  }

  /**
   * Health and readiness check.
   * Performs an active probe against Firestore if configured.
   */
  public async checkHealth(): Promise<CloudHealthStatus> {
    const mode = this.isProduction() ? 'production' : process.env.NODE_ENV === 'test' ? 'test' : 'development';

    if (this.isCloudReady() && this.db) {
      const startTime = Date.now();
      try {
        // Quick probe: read system_state/workspace_sync document
        const ref = this.db.collection('system_state').doc('workspace_sync');
        await ref.get();
        const latencyMs = Date.now() - startTime;

        return {
          ready: true,
          database: 'firestore',
          storageType: 'firestore',
          healthy: true,
          latencyMs,
          projectId: this.activeProjectId,
          mode,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown Firestore error';
        console.error('[CloudPersistence] Health check probe failed:', message);
        return {
          ready: false,
          database: 'firestore',
          storageType: 'firestore',
          healthy: false,
          error: message,
          projectId: this.activeProjectId,
          mode,
        };
      }
    }

    // When cloud is NOT ready:
    if (this.isStrictPersistence()) {
      return {
        ready: false,
        database: 'unconfigured',
        storageType: 'local_json',
        healthy: false,
        error: this.initError || 'Cloud Firestore is not configured or failed to initialize in production.',
        mode,
      };
    }

    // Development/Test mode with local JSON
    return {
      ready: true,
      database: 'local_json',
      storageType: 'local_json',
      healthy: true,
      mode,
    };
  }

  // =========================================================================
  // WORKSPACE COLLABORATIVE SYNC (Projects, Tasks, Messages, Logs, Notifications)
  // =========================================================================

  public async loadSyncData(): Promise<SharedSyncData> {
    // 1. Load from Cloud Firestore when ready
    if (this.isCloudReady() && this.db) {
      try {
        const syncRef = this.db.collection('system_state').doc('workspace_sync');
        const snap = await syncRef.get();

        if (snap.exists) {
          const d = snap.data() || {};
          return {
            notifications: Array.isArray(d.notifications) ? d.notifications : [],
            logs: Array.isArray(d.logs) ? d.logs : [],
            directMessages: Array.isArray(d.directMessages) ? d.directMessages : [],
            projects: Array.isArray(d.projects) ? d.projects : [],
            tasks: Array.isArray(d.tasks) ? d.tasks : [],
          };
        } else {
          // Document does not exist in Firestore yet.
          // If local backup exists, perform a safe initial migration into Firestore!
          if (fs.existsSync(this.localSyncPath)) {
            try {
              const raw = fs.readFileSync(this.localSyncPath, 'utf8');
              const parsed = JSON.parse(raw);
              const initialData: SharedSyncData = {
                notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
                logs: Array.isArray(parsed.logs) ? parsed.logs : [],
                directMessages: Array.isArray(parsed.directMessages) ? parsed.directMessages : [],
                projects: Array.isArray(parsed.projects) ? parsed.projects : [],
                tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
              };

              console.log('[CloudPersistence] Initializing Firestore workspace_sync from local file seed...');
              await this.saveSyncData(initialData);
              return initialData;
            } catch {
              // Fall through to empty default
            }
          }

          // Return clean initial state
          return {
            notifications: [],
            logs: [],
            directMessages: [],
            projects: [],
            tasks: [],
          };
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[CloudPersistence] Error reading from Cloud Firestore:', message);

        if (this.isStrictPersistence()) {
          // In production, NEVER silently return empty data or fall back to local JSON
          throw new Error(`[CloudPersistence] Production read failure: Unable to load workspace data from Cloud Firestore (${message})`);
        }
      }
    }

    // 2. Local fallback if permitted
    if (this.allowLocalFallback()) {
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
        // Fallback to empty default
      }

      return {
        notifications: [],
        logs: [],
        directMessages: [],
        projects: [],
        tasks: [],
      };
    }

    // Production without cloud persistence
    throw new Error('[CloudPersistence] Cloud Firestore is required in production but is not ready or configured.');
  }

  public async saveSyncData(data: SharedSyncData): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('[CloudPersistence] Invalid data provided to saveSyncData');
    }

    // 1. Write to Cloud Firestore when ready
    if (this.isCloudReady() && this.db) {
      try {
        const syncRef = this.db.collection('system_state').doc('workspace_sync');

        // Firestore document size limit defense: cap historical notification/log/message counts
        await syncRef.set(
          {
            notifications: (data.notifications || []).slice(0, 500),
            logs: (data.logs || []).slice(0, 500),
            directMessages: (data.directMessages || []).slice(0, 1000),
            projects: data.projects || [],
            tasks: data.tasks || [],
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );

        // Also write projects and tasks to individual Firestore collections for queryability and durability
        if (Array.isArray(data.projects) && data.projects.length > 0) {
          const batch = this.db.batch();
          for (const p of data.projects.slice(0, 100)) {
            if (p && p.id) {
              const projRef = this.db.collection('projects').doc(p.id);
              batch.set(projRef, { ...p, updatedAt: p.updatedAt || new Date().toISOString() }, { merge: true });
            }
          }
          await batch.commit().catch(err => {
            console.warn('[CloudPersistence] Non-fatal batch project write warning:', err);
          });
        }

        if (Array.isArray(data.tasks) && data.tasks.length > 0) {
          const batch = this.db.batch();
          for (const t of data.tasks.slice(0, 100)) {
            if (t && t.id) {
              const taskRef = this.db.collection('tasks').doc(t.id);
              batch.set(taskRef, { ...t, updatedAt: t.updatedAt || new Date().toISOString() }, { merge: true });
            }
          }
          await batch.commit().catch(err => {
            console.warn('[CloudPersistence] Non-fatal batch task write warning:', err);
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[CloudPersistence] Error writing to Cloud Firestore:', message);

        if (this.isStrictPersistence()) {
          throw new Error(`[CloudPersistence] Production write failure: Unable to persist workspace data to Cloud Firestore (${message})`);
        }
      }
    } else if (this.isStrictPersistence()) {
      throw new Error('[CloudPersistence] Cannot write: Cloud Firestore is required in production but is not ready.');
    }

    // 2. Maintain local JSON backup in development
    try {
      fs.writeFileSync(this.localSyncPath, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // Safe no-op in read-only filesystems (e.g., containerized serverless)
    }
  }

  // =========================================================================
  // USER ACCOUNTS & INVITATIONS STORE
  // =========================================================================

  public async loadAuthData(): Promise<SharedAuthData | null> {
    if (this.isCloudReady() && this.db) {
      try {
        const authRef = this.db.collection('system_state').doc('auth_store');
        const snap = await authRef.get();

        if (snap.exists) {
          const d = snap.data() || {};
          return {
            accounts: Array.isArray(d.accounts) ? d.accounts : [],
            invitations: Array.isArray(d.invitations) ? d.invitations : [],
            sessions: d.sessions && typeof d.sessions === 'object' ? d.sessions : {},
          };
        } else {
          // Check local auth backup for initial seed
          if (fs.existsSync(this.localAuthPath)) {
            try {
              const raw = fs.readFileSync(this.localAuthPath, 'utf8');
              const parsed = JSON.parse(raw);
              const initialAuth: SharedAuthData = {
                accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
                invitations: Array.isArray(parsed.invitations) ? parsed.invitations : [],
                sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {},
              };
              if (initialAuth.accounts.length > 0) {
                console.log('[CloudPersistence] Seeding Firestore auth_store from local auth backup...');
                await this.saveAuthData(initialAuth);
                return initialAuth;
              }
            } catch {
              // Ignore parse error
            }
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[CloudPersistence] Error reading auth store from Cloud Firestore:', message);

        if (this.isStrictPersistence()) {
          throw new Error(`[CloudPersistence] Production read failure: Unable to load auth store from Cloud Firestore (${message})`);
        }
      }
    }

    return null;
  }

  public async saveAuthData(data: SharedAuthData): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('[CloudPersistence] Invalid data provided to saveAuthData');
    }

    if (this.isCloudReady() && this.db) {
      try {
        const authRef = this.db.collection('system_state').doc('auth_store');
        await authRef.set(
          {
            accounts: data.accounts || [],
            invitations: data.invitations || [],
            sessions: data.sessions || {},
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );

        // Also update sanitized user records in 'users' collection (NEVER storing password hashes there)
        if (Array.isArray(data.accounts) && data.accounts.length > 0) {
          const batch = this.db.batch();
          for (const acc of data.accounts) {
            if (acc && acc.uid) {
              const userRef = this.db.collection('users').doc(acc.uid);
              // Strip passwordHash before writing to public users collection
              const { passwordHash, ...safeProfile } = acc;
              batch.set(userRef, { ...safeProfile, updatedAt: safeProfile.updatedAt || new Date().toISOString() }, { merge: true });
            }
          }
          await batch.commit().catch(err => {
            console.warn('[CloudPersistence] Non-fatal batch users write warning:', err);
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[CloudPersistence] Error saving auth store to Cloud Firestore:', message);

        if (this.isStrictPersistence()) {
          throw new Error(`[CloudPersistence] Production write failure: Unable to persist auth store to Cloud Firestore (${message})`);
        }
      }
    } else if (this.isStrictPersistence()) {
      throw new Error('[CloudPersistence] Cannot write: Cloud Firestore is required in production but is not ready.');
    }

    // Maintain local backup in development
    try {
      fs.writeFileSync(this.localAuthPath, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // Safe no-op
    }
  }
}

export const cloudPersistence = new CloudPersistenceService();
