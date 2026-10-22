import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { UserProfile, UserRole, UserStatus, UserInvitation, AuthSession } from '../src/types/auth';

interface StoredAccount {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  phone?: string;
  avatarUrl?: string;
  passwordHash?: string; // bcrypt hash
  createdAt: string;
  updatedAt: string;
}

interface StoredInvitation {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  phone?: string;
  tokenHash: string;
  tokenLookup: string; // first 16 chars or sha256 prefix for fast lookup
  expiresAt: string;
  createdAt: string;
  createdByUid: string;
  createdByDisplayName: string;
  isUsed: boolean;
  usedAt?: string;
}

interface ServerAuthStore {
  accounts: StoredAccount[];
  invitations: StoredInvitation[];
  sessions: { [token: string]: { uid: string; expiresAt: number } };
}

const authFilePath = path.resolve(process.cwd(), '.server-auth.json');

// Rate limiting store: key = ip/email, value = { count: number, lastAttempt: number, lockedUntil?: number }
const loginAttempts = new Map<string, { count: number; lastAttempt: number; lockedUntil?: number }>();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// Default initial password for seeded demo accounts: "Password123!"
const DEFAULT_DEMO_PASSWORD = 'Password123!';
const DEFAULT_DEMO_HASH = bcrypt.hashSync(DEFAULT_DEMO_PASSWORD, 10);

const SEED_ACCOUNTS: StoredAccount[] = [
  {
    uid: 'user-admin-alex',
    email: 'admin@ojix.local',
    displayName: 'Alex Morgan',
    role: 'workspace_admin',
    status: 'active',
    passwordHash: DEFAULT_DEMO_HASH,
    phone: '+1 (555) 019-2834',
    createdAt: '2026-01-15T08:00:00Z',
    updatedAt: '2026-01-15T08:00:00Z',
  },
  {
    uid: 'user-lead-sarah',
    email: 'lead@ojix.local',
    displayName: 'Sarah Chen',
    role: 'project_lead',
    status: 'active',
    passwordHash: DEFAULT_DEMO_HASH,
    phone: '+1 (555) 014-9921',
    createdAt: '2026-01-15T08:00:00Z',
    updatedAt: '2026-01-15T08:00:00Z',
  },
  {
    uid: 'user-member-marcus',
    email: 'member@ojix.local',
    displayName: 'Marcus Vance',
    role: 'member',
    status: 'active',
    passwordHash: DEFAULT_DEMO_HASH,
    phone: '+1 (555) 017-4832',
    createdAt: '2026-01-15T08:00:00Z',
    updatedAt: '2026-01-15T08:00:00Z',
  },
  {
    uid: 'user-viewer-elena',
    email: 'viewer@ojix.local',
    displayName: 'Elena Rostova',
    role: 'viewer',
    status: 'active',
    passwordHash: DEFAULT_DEMO_HASH,
    phone: '+1 (555) 012-7744',
    createdAt: '2026-01-15T08:00:00Z',
    updatedAt: '2026-01-15T08:00:00Z',
  },
];

class AuthBackend {
  private data: ServerAuthStore = { accounts: [], invitations: [], sessions: {} };

  constructor() {
    this.load();
    const timer = setInterval(() => this.cleanExpiredSessions(), 60 * 60 * 1000);
    if (timer && typeof timer.unref === 'function') {
      timer.unref();
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(authFilePath)) {
        const raw = fs.readFileSync(authFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.data = {
          accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
          invitations: Array.isArray(parsed.invitations) ? parsed.invitations : [],
          sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {},
        };
      }
    } catch {
      this.data = { accounts: [], invitations: [], sessions: {} };
    }

    // Ensure seed accounts exist
    let modified = false;
    for (const seed of SEED_ACCOUNTS) {
      const existing = this.data.accounts.find(a => a.email.toLowerCase() === seed.email.toLowerCase());
      if (!existing) {
        this.data.accounts.push({ ...seed });
        modified = true;
      } else if (!existing.passwordHash) {
        existing.passwordHash = DEFAULT_DEMO_HASH;
        modified = true;
      }
    }

    if (modified || !fs.existsSync(authFilePath)) {
      this.save();
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(authFilePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save .server-auth.json:', err);
    }
  }

  private cleanExpiredSessions(): void {
    const now = Date.now();
    let changed = false;
    for (const [token, session] of Object.entries(this.data.sessions)) {
      if (session.expiresAt <= now) {
        delete this.data.sessions[token];
        changed = true;
      }
    }
    if (changed) {
      this.save();
    }
  }

  private sanitizeUser(acc: StoredAccount): UserProfile {
    return {
      uid: acc.uid,
      email: acc.email,
      displayName: acc.displayName,
      role: acc.role,
      status: acc.status,
      phone: acc.phone,
      avatarUrl: acc.avatarUrl,
      createdAt: acc.createdAt,
      updatedAt: acc.updatedAt,
    };
  }

  // --- Rate Limiting ---
  public checkRateLimit(identifier: string): { allowed: boolean; waitSeconds?: number } {
    const now = Date.now();
    const entry = loginAttempts.get(identifier);

    if (!entry) return { allowed: true };

    if (entry.lockedUntil && entry.lockedUntil > now) {
      const waitSeconds = Math.ceil((entry.lockedUntil - now) / 1000);
      return { allowed: false, waitSeconds };
    }

    if (now - entry.lastAttempt > ATTEMPT_WINDOW_MS) {
      loginAttempts.delete(identifier);
      return { allowed: true };
    }

    if (entry.count >= MAX_FAILED_ATTEMPTS) {
      entry.lockedUntil = now + LOCKOUT_DURATION_MS;
      const waitSeconds = Math.ceil(LOCKOUT_DURATION_MS / 1000);
      return { allowed: false, waitSeconds };
    }

    return { allowed: true };
  }

  public recordFailedAttempt(identifier: string): void {
    const now = Date.now();
    const entry = loginAttempts.get(identifier) || { count: 0, lastAttempt: now };
    entry.count += 1;
    entry.lastAttempt = now;
    if (entry.count >= MAX_FAILED_ATTEMPTS) {
      entry.lockedUntil = now + LOCKOUT_DURATION_MS;
    }
    loginAttempts.set(identifier, entry);
  }

  public recordSuccessfulAttempt(identifier: string): void {
    loginAttempts.delete(identifier);
  }

  // --- Authentication ---
  public async login(
    email: string,
    password: string,
    clientIp = 'unknown'
  ): Promise<{ session: AuthSession; cookieHeader: string }> {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const rateCheck = this.checkRateLimit(`${clientIp}:${normalizedEmail}`);

    if (!rateCheck.allowed) {
      throw new Error(`Too many failed login attempts. Please try again in ${rateCheck.waitSeconds} seconds.`);
    }

    const genericError = new Error('Invalid email or password.');

    if (!normalizedEmail || !password) {
      this.recordFailedAttempt(`${clientIp}:${normalizedEmail}`);
      throw genericError;
    }

    const account = this.data.accounts.find(a => a.email.toLowerCase() === normalizedEmail);
    if (!account) {
      this.recordFailedAttempt(`${clientIp}:${normalizedEmail}`);
      throw genericError;
    }

    if (account.status === 'pending_activation') {
      throw new Error('Account pending activation. Please use your activation link to set your password.');
    }

    if (account.status === 'blocked') {
      throw new Error(`Account Suspended: User "${account.displayName}" has been blocked by the Workspace Admin.`);
    }

    if (account.status === 'terminated') {
      throw new Error(`Account Terminated: Access has been permanently revoked.`);
    }

    if (!account.passwordHash) {
      this.recordFailedAttempt(`${clientIp}:${normalizedEmail}`);
      throw genericError;
    }

    const isValid = await bcrypt.compare(password, account.passwordHash);
    if (!isValid) {
      this.recordFailedAttempt(`${clientIp}:${normalizedEmail}`);
      throw genericError;
    }

    this.recordSuccessfulAttempt(`${clientIp}:${normalizedEmail}`);

    // Create session token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    this.data.sessions[token] = {
      uid: account.uid,
      expiresAt,
    };
    this.save();

    const user = this.sanitizeUser(account);
    const cookieHeader = `ojix_session=${token}; Path=/; Max-Age=604800; SameSite=Lax; HttpOnly`;

    return {
      session: { token, user, expiresAt },
      cookieHeader,
    };
  }

  public getSessionUser(token: string): UserProfile | null {
    if (!token) return null;
    const session = this.data.sessions[token];
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      delete this.data.sessions[token];
      this.save();
      return null;
    }

    const account = this.data.accounts.find(a => a.uid === session.uid);
    if (!account || account.status === 'blocked' || account.status === 'terminated') {
      return null;
    }

    return this.sanitizeUser(account);
  }

  public logout(token: string): string {
    if (token && this.data.sessions[token]) {
      delete this.data.sessions[token];
      this.save();
    }
    return `ojix_session=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`;
  }

  // --- Admin User Management ---
  public getAccounts(): UserProfile[] {
    return this.data.accounts.map(a => this.sanitizeUser(a));
  }

  public getInvitations(): UserInvitation[] {
    return this.data.invitations.map(i => ({
      id: i.id,
      email: i.email,
      displayName: i.displayName,
      role: i.role,
      phone: i.phone,
      token: '', // never expose token in list
      tokenHash: i.tokenHash,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
      createdByUid: i.createdByUid,
      createdByDisplayName: i.createdByDisplayName,
      isUsed: i.isUsed,
      usedAt: i.usedAt,
    }));
  }

  public async inviteUser(
    params: {
      displayName: string;
      email: string;
      role: UserRole;
      phone?: string;
    },
    caller: UserProfile,
    origin = 'http://localhost:5173'
  ): Promise<{ invitation: UserInvitation; activationUrl: string; user: UserProfile }> {
    if (caller.role !== 'workspace_admin') {
      throw new Error('Unauthorized: Only Workspace Admins can invite users.');
    }

    const displayName = (params.displayName || '').trim();
    if (displayName.length < 2) {
      throw new Error('User full name must be at least 2 characters.');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalizedEmail = (params.email || '').trim().toLowerCase();
    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
      throw new Error('A valid email address is required.');
    }

    const existingAccount = this.data.accounts.find(a => a.email.toLowerCase() === normalizedEmail);
    if (existingAccount) {
      throw new Error(`A user account with email "${normalizedEmail}" already exists.`);
    }

    // Check for existing pending invitation
    const pendingInv = this.data.invitations.find(
      i => i.email.toLowerCase() === normalizedEmail && !i.isUsed && new Date(i.expiresAt).getTime() > Date.now()
    );
    if (pendingInv) {
      throw new Error(`A pending invitation for "${normalizedEmail}" is already active.`);
    }

    // Generate cryptographically secure activation token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, 10);
    const tokenLookup = crypto.createHash('sha256').update(rawToken).digest('hex').slice(0, 16);

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48 hours
    const invitationId = `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const newAccount: StoredAccount = {
      uid: `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      email: normalizedEmail,
      displayName,
      role: params.role,
      status: 'pending_activation',
      phone: params.phone?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    const invitation: StoredInvitation = {
      id: invitationId,
      email: normalizedEmail,
      displayName,
      role: params.role,
      phone: params.phone?.trim() || undefined,
      tokenHash,
      tokenLookup,
      expiresAt,
      createdAt: now,
      createdByUid: caller.uid,
      createdByDisplayName: caller.displayName,
      isUsed: false,
    };

    this.data.accounts.push(newAccount);
    this.data.invitations.unshift(invitation);
    this.save();

    const activationUrl = `${origin}/activate?token=${rawToken}&email=${encodeURIComponent(normalizedEmail)}`;

    return {
      invitation: {
        ...invitation,
        token: rawToken,
        activationUrl,
      },
      activationUrl,
      user: this.sanitizeUser(newAccount),
    };
  }

  public async activateAccount(params: {
    token: string;
    email?: string;
    password: string;
    confirmPassword: string;
  }): Promise<{ success: boolean; user: UserProfile; message: string }> {
    const rawToken = (params.token || '').trim();
    if (!rawToken) {
      throw new Error('Activation token is required.');
    }

    if (!params.password || params.password.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }

    if (!/[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(params.password)) {
      throw new Error('Password must contain at least one number or special character.');
    }

    if (params.password !== params.confirmPassword) {
      throw new Error('Passwords do not match.');
    }

    // Lookup invitation by tokenLookup hash prefix or scan
    const tokenLookup = crypto.createHash('sha256').update(rawToken).digest('hex').slice(0, 16);
    let matchedInvitation: StoredInvitation | undefined = this.data.invitations.find(
      i => i.tokenLookup === tokenLookup
    );

    // Fallback: compare tokenHash
    if (!matchedInvitation) {
      for (const inv of this.data.invitations) {
        const isMatch = await bcrypt.compare(rawToken, inv.tokenHash).catch(() => false);
        if (isMatch) {
          matchedInvitation = inv;
          break;
        }
      }
    }

    if (!matchedInvitation) {
      throw new Error('Invalid or expired activation link.');
    }

    if (matchedInvitation.isUsed) {
      throw new Error('This activation link has already been used. Please log in.');
    }

    if (new Date(matchedInvitation.expiresAt).getTime() < Date.now()) {
      throw new Error('This activation link has expired. Please contact your Workspace Admin for a new invitation.');
    }

    const account = this.data.accounts.find(
      a => a.email.toLowerCase() === matchedInvitation!.email.toLowerCase()
    );

    if (!account) {
      throw new Error('Account associated with this invitation was not found.');
    }

    // Hash password and activate account
    const passwordHash = await bcrypt.hash(params.password, 10);
    account.passwordHash = passwordHash;
    account.status = 'active';
    account.updatedAt = new Date().toISOString();

    matchedInvitation.isUsed = true;
    matchedInvitation.usedAt = new Date().toISOString();

    this.save();

    return {
      success: true,
      user: this.sanitizeUser(account),
      message: 'Account successfully activated! You can now log in with your credentials.',
    };
  }

  public async resendInvitation(
    email: string,
    caller: UserProfile,
    origin = 'http://localhost:5173'
  ): Promise<{ invitation: UserInvitation; activationUrl: string }> {
    if (caller.role !== 'workspace_admin') {
      throw new Error('Unauthorized: Only Workspace Admins can resend invitations.');
    }

    const normalizedEmail = (email || '').trim().toLowerCase();
    const account = this.data.accounts.find(a => a.email.toLowerCase() === normalizedEmail);

    if (!account) {
      throw new Error(`User with email "${normalizedEmail}" not found.`);
    }

    if (account.status !== 'pending_activation') {
      throw new Error(`User "${account.displayName}" has already activated their account.`);
    }

    // Invalidate old invitations
    for (const inv of this.data.invitations) {
      if (inv.email.toLowerCase() === normalizedEmail && !inv.isUsed) {
        inv.isUsed = true;
        inv.usedAt = new Date().toISOString();
      }
    }

    // Generate new token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, 10);
    const tokenLookup = crypto.createHash('sha256').update(rawToken).digest('hex').slice(0, 16);

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const invitationId = `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const newInvitation: StoredInvitation = {
      id: invitationId,
      email: normalizedEmail,
      displayName: account.displayName,
      role: account.role,
      phone: account.phone,
      tokenHash,
      tokenLookup,
      expiresAt,
      createdAt: now,
      createdByUid: caller.uid,
      createdByDisplayName: caller.displayName,
      isUsed: false,
    };

    this.data.invitations.unshift(newInvitation);
    this.save();

    const activationUrl = `${origin}/activate?token=${rawToken}&email=${encodeURIComponent(normalizedEmail)}`;

    return {
      invitation: {
        ...newInvitation,
        token: rawToken,
        activationUrl,
      },
      activationUrl,
    };
  }

  public async createUserWithPassword(
    params: {
      displayName: string;
      email: string;
      role: UserRole;
      password: string;
      phone?: string;
    },
    caller: UserProfile
  ): Promise<UserProfile> {
    if (caller.role !== 'workspace_admin') {
      throw new Error('Unauthorized: Only Workspace Admins can create accounts directly.');
    }

    const displayName = (params.displayName || '').trim();
    if (displayName.length < 2) {
      throw new Error('User full name must be at least 2 characters.');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalizedEmail = (params.email || '').trim().toLowerCase();
    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
      throw new Error('A valid email address is required.');
    }

    if (!params.password || params.password.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }

    const existingAccount = this.data.accounts.find(a => a.email.toLowerCase() === normalizedEmail);
    if (existingAccount) {
      throw new Error(`A user account with email "${normalizedEmail}" already exists.`);
    }

    const passwordHash = await bcrypt.hash(params.password, 10);
    const now = new Date().toISOString();

    const newAccount: StoredAccount = {
      uid: `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      email: normalizedEmail,
      displayName,
      role: params.role,
      status: 'active',
      phone: params.phone?.trim() || undefined,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    };

    this.data.accounts.push(newAccount);
    this.save();

    return this.sanitizeUser(newAccount);
  }

  public updateUserRole(targetUid: string, newRole: UserRole, caller: UserProfile): UserProfile {
    if (caller.role !== 'workspace_admin') {
      throw new Error('Unauthorized: Only Workspace Admins can modify member roles.');
    }

    const account = this.data.accounts.find(a => a.uid === targetUid);
    if (!account) {
      throw new Error(`User with UID "${targetUid}" not found.`);
    }

    if (account.uid === caller.uid && newRole !== 'workspace_admin') {
      throw new Error('Security policy: Workspace Admins cannot demote their own account.');
    }

    account.role = newRole;
    account.updatedAt = new Date().toISOString();
    this.save();

    return this.sanitizeUser(account);
  }

  public updateUserStatus(targetUid: string, status: UserStatus, caller: UserProfile): UserProfile {
    if (caller.role !== 'workspace_admin') {
      throw new Error('Unauthorized: Only Workspace Admins can modify account status.');
    }

    const account = this.data.accounts.find(a => a.uid === targetUid);
    if (!account) {
      throw new Error(`User with UID "${targetUid}" not found.`);
    }

    if (account.uid === caller.uid && (status === 'blocked' || status === 'terminated')) {
      throw new Error('Security policy: Workspace Admins cannot suspend or terminate their own account.');
    }

    account.status = status;
    account.updatedAt = new Date().toISOString();

    // If blocked or terminated, terminate all active sessions for this user
    if (status === 'blocked' || status === 'terminated') {
      for (const [token, session] of Object.entries(this.data.sessions)) {
        if (session.uid === targetUid) {
          delete this.data.sessions[token];
        }
      }
    }

    this.save();
    return this.sanitizeUser(account);
  }

  public reset(): void {
    this.data = {
      accounts: SEED_ACCOUNTS.map(a => ({ ...a })),
      invitations: [],
      sessions: {},
    };
    loginAttempts.clear();
    this.save();
  }
}

export const authBackend = new AuthBackend();
