import type { IncomingMessage, ServerResponse } from 'http';
import { pushBackend } from './pushBackend';
import { authBackend } from './authBackend';
import { cloudPersistence, SharedSyncData } from './cloudPersistence';
import type { UserProfile } from '../src/types/auth';

export const SERVER_BOOT_TIME = Date.now();
export const SERVER_BOOT_ID = `server-boot-${SERVER_BOOT_TIME}`;

export interface SseConnection {
  id: string;
  userId?: string;
  res: ServerResponse;
}

const sseConnections = new Set<SseConnection>();

export function getSseConnectionsCount(): number {
  return sseConnections.size;
}

export function broadcastRealtimeEvent(eventType: string, data: unknown) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseConnections) {
    try {
      client.res.write(payload);
    } catch {
      sseConnections.delete(client);
    }
  }
}

// In-memory sync state synchronized with cloud persistence
let sharedSyncData: SharedSyncData = {
  notifications: [],
  logs: [],
  directMessages: [],
  projects: [],
  tasks: [],
};

// Async initialization of shared sync data
let syncInitialized = false;
export async function initializeSyncData(): Promise<SharedSyncData> {
  if (!syncInitialized) {
    try {
      sharedSyncData = await cloudPersistence.loadSyncData();
      syncInitialized = true;
      console.log(`[ApiRouter] Shared sync storage initialized (engine: ${cloudPersistence.getStorageType()})`);
    } catch (err: unknown) {
      if (cloudPersistence.isStrictPersistence()) {
        throw err;
      }
      console.warn('[ApiRouter] Initial sync load warning:', err);
    }
  }
  return sharedSyncData;
}

export function getSharedSyncData(): SharedSyncData {
  return sharedSyncData;
}

function parseJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 64) {
        reject(new Error('Request payload too large (64KB limit exceeded)'));
      }
    });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        resolve(parsed as T);
      } catch {
        reject(new Error('Invalid JSON format in request body'));
      }
    });
    req.on('error', reject);
  });
}

export function extractAuthToken(req: IncomingMessage): string {
  const authHeader = (req.headers.authorization || (req.headers as any)['Authorization'] || '') as string;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  const xAuthToken = (req.headers['x-auth-token'] || (req.headers as any)['X-Auth-Token'] || '') as string;
  if (typeof xAuthToken === 'string' && xAuthToken.trim()) {
    return xAuthToken.trim();
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/ojix_session=([^;]+)/);
    if (match) {
      return match[1].trim();
    }
  }
  return '';
}

export function getCallingUser(req: IncomingMessage): UserProfile | null {
  const token = extractAuthToken(req);
  if (!token) return null;
  const account = authBackend.getSessionAccount(token);
  if (!account) return null;
  return {
    uid: account.uid,
    email: account.email,
    displayName: account.displayName,
    role: account.role,
    status: account.status,
    phone: account.phone,
    avatarUrl: account.avatarUrl,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function getCorsOrigin(req: IncomingMessage): string {
  const requestOrigin = (req.headers.origin as string) || '';
  const configuredOrigin = process.env.CLIENT_ORIGIN || '';

  if (!configuredOrigin || configuredOrigin === '*') {
    return requestOrigin || '*';
  }

  const allowedOrigins = configuredOrigin.split(',').map(s => s.trim().toLowerCase());
  if (requestOrigin && allowedOrigins.includes(requestOrigin.toLowerCase())) {
    return requestOrigin;
  }

  // If request origin does not match allowed origin, return first allowed origin
  return allowedOrigins[0] || '*';
}

function applyCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  const origin = getCorsOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Auth-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (origin !== '*') {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}

export function sendJson(
  req: IncomingMessage,
  res: ServerResponse,
  statusCode: number,
  data: unknown,
  cookieHeader?: string
) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  applyCorsHeaders(req, res);
  if (cookieHeader) {
    res.setHeader('Set-Cookie', cookieHeader);
  }
  res.end(JSON.stringify(data));
}

/**
 * Core API Router handler for OJIX TeamFlow.
 * Handles all production endpoints consistently across standalone server and Vite dev server.
 * Returns true if the request was handled, false if not matched.
 */
export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const url = req.url || '';
  const method = req.method || 'GET';

  // Ensure sync data is loaded
  if (!syncInitialized) {
    try {
      await initializeSyncData();
    } catch (err: unknown) {
      if (cloudPersistence.isStrictPersistence() && !url.startsWith('/health') && !url.startsWith('/ready') && !url.startsWith('/api/health') && !url.startsWith('/api/ready')) {
        const message = err instanceof Error ? err.message : 'Database initialization failure';
        sendJson(req, res, 503, { error: message, status: 503, ready: false });
        return true;
      }
    }
  }

  // 1. CORS Preflight
  if (method === 'OPTIONS') {
    if (
      url === '/health' ||
      url === '/api/health' ||
      url === '/ready' ||
      url === '/api/ready' ||
      url === '/api/health/ready' ||
      url.startsWith('/api/')
    ) {
      res.statusCode = 204;
      applyCorsHeaders(req, res);
      res.end();
      return true;
    }
  }

  // 2. Health & Readiness Check Endpoints
  // Liveness Check (Is the process running?)
  if (method === 'GET' && (url === '/health' || url === '/api/health')) {
    const isReady = cloudPersistence.isCloudReady();
    sendJson(req, res, 200, {
      status: 'ok',
      service: 'ojix-teamflow-backend',
      uptimeSeconds: Math.round(process.uptime()),
      pushReady: pushBackend.isReady(),
      storageType: cloudPersistence.getStorageType(),
      databaseHealthy: isReady || !cloudPersistence.isStrictPersistence(),
      activeSseConnections: sseConnections.size,
      bootId: SERVER_BOOT_ID,
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  // Readiness Check (Is the database actually connected and responding?)
  if (method === 'GET' && (url === '/ready' || url === '/api/ready' || url === '/api/health/ready')) {
    const health = await cloudPersistence.checkHealth();
    const statusCode = health.ready ? 200 : 503;
    sendJson(req, res, statusCode, {
      status: health.ready ? 'ready' : 'unready',
      service: 'ojix-teamflow-backend',
      uptimeSeconds: Math.round(process.uptime()),
      ...health,
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  // =========================================================================
  // 3. AUTHENTICATION & RBAC ENDPOINTS (/api/auth)
  // =========================================================================

  // POST /api/auth/login
  if (method === 'POST' && url === '/api/auth/login') {
    try {
      const body = await parseJsonBody<{ email?: string; password?: string }>(req);
      if (!body.email || !body.password) {
        sendJson(req, res, 400, { error: 'Please enter both your email address and password.' });
        return true;
      }
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
        req.socket.remoteAddress ||
        '127.0.0.1';

      const { session, cookieHeader } = await authBackend.login(body.email, body.password, clientIp);
      sendJson(req, res, 200, { success: true, session }, cookieHeader);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      sendJson(req, res, 401, { error: message });
    }
    return true;
  }

  // POST /api/auth/logout
  if (method === 'POST' && url === '/api/auth/logout') {
    try {
      const token = extractAuthToken(req);
      const cookieHeader = authBackend.logout(token);
      sendJson(req, res, 200, { success: true }, cookieHeader);
    } catch {
      sendJson(req, res, 200, { success: true });
    }
    return true;
  }

  // GET /api/auth/me
  if (method === 'GET' && url.startsWith('/api/auth/me')) {
    const token = extractAuthToken(req);
    const user = authBackend.getSessionUser(token);
    if (!user) {
      sendJson(req, res, 401, { error: 'Unauthorized: No active or valid session', user: null });
      return true;
    }
    sendJson(req, res, 200, { success: true, user });
    return true;
  }

  // POST /api/auth/activate
  if (method === 'POST' && url === '/api/auth/activate') {
    try {
      const body = await parseJsonBody<{
        token: string;
        email?: string;
        password: string;
        confirmPassword: string;
      }>(req);
      const result = await authBackend.activateAccount(body);
      broadcastRealtimeEvent('sync', { accounts: authBackend.getAccounts() });
      broadcastRealtimeEvent('user_updated', result.user);
      sendJson(req, res, 200, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Activation failed';
      sendJson(req, res, 400, { error: message });
    }
    return true;
  }

  // GET /api/auth/admin/users
  if (method === 'GET' && url.startsWith('/api/auth/admin/users')) {
    const token = extractAuthToken(req);
    const caller = authBackend.getSessionUser(token);
    if (!caller || caller.role !== 'workspace_admin') {
      sendJson(req, res, 403, { error: 'Forbidden: Only Workspace Admins can view all accounts' });
      return true;
    }
    sendJson(req, res, 200, { success: true, users: authBackend.getAccounts() });
    return true;
  }

  // GET /api/auth/admin/invitations
  if (method === 'GET' && url.startsWith('/api/auth/admin/invitations')) {
    const token = extractAuthToken(req);
    const caller = authBackend.getSessionUser(token);
    if (!caller || caller.role !== 'workspace_admin') {
      sendJson(req, res, 403, { error: 'Forbidden: Only Workspace Admins can view invitations' });
      return true;
    }
    sendJson(req, res, 200, { success: true, invitations: authBackend.getInvitations() });
    return true;
  }

  // POST /api/auth/admin/invite-user
  if (method === 'POST' && url === '/api/auth/admin/invite-user') {
    try {
      const token = extractAuthToken(req);
      const caller = authBackend.getSessionUser(token);
      if (!caller || caller.role !== 'workspace_admin') {
        sendJson(req, res, 403, { error: 'Forbidden: Only Workspace Admins can invite new users' });
        return true;
      }
      const body = await parseJsonBody<{
        displayName: string;
        email: string;
        role: any;
        phone?: string;
      }>(req);
      const origin = (req.headers.origin as string) || process.env.CLIENT_ORIGIN || 'http://localhost:5173';
      const result = await authBackend.inviteUser(body, caller, origin);
      broadcastRealtimeEvent('sync', { accounts: authBackend.getAccounts() });
      broadcastRealtimeEvent('user_updated', result.user);
      sendJson(req, res, 201, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invite failed';
      sendJson(req, res, 400, { error: message });
    }
    return true;
  }

  // POST /api/auth/admin/create-user
  if (method === 'POST' && url === '/api/auth/admin/create-user') {
    try {
      const token = extractAuthToken(req);
      const caller = authBackend.getSessionUser(token);
      if (!caller || caller.role !== 'workspace_admin') {
        sendJson(req, res, 403, { error: 'Forbidden: Only Workspace Admins can create user accounts' });
        return true;
      }
      const body = await parseJsonBody<{
        displayName: string;
        email: string;
        role: any;
        password: string;
        phone?: string;
      }>(req);
      const newUser = await authBackend.createUserWithPassword(body, caller);
      broadcastRealtimeEvent('sync', { accounts: authBackend.getAccounts() });
      broadcastRealtimeEvent('user_updated', newUser);
      sendJson(req, res, 201, { success: true, user: newUser });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'User creation failed';
      sendJson(req, res, 400, { error: message });
    }
    return true;
  }

  // POST /api/auth/admin/resend-invite
  if (method === 'POST' && url === '/api/auth/admin/resend-invite') {
    try {
      const token = extractAuthToken(req);
      const caller = authBackend.getSessionUser(token);
      if (!caller || caller.role !== 'workspace_admin') {
        sendJson(req, res, 403, { error: 'Forbidden: Only Workspace Admins can resend invitations' });
        return true;
      }
      const body = await parseJsonBody<{ email: string }>(req);
      const origin = (req.headers.origin as string) || process.env.CLIENT_ORIGIN || 'http://localhost:5173';
      const result = await authBackend.resendInvitation(body.email, caller, origin);
      sendJson(req, res, 200, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Resending invitation failed';
      sendJson(req, res, 400, { error: message });
    }
    return true;
  }

  // POST /api/auth/admin/update-role
  if (method === 'POST' && url === '/api/auth/admin/update-role') {
    try {
      const token = extractAuthToken(req);
      const caller = authBackend.getSessionUser(token);
      if (!caller || caller.role !== 'workspace_admin') {
        sendJson(req, res, 403, { error: 'Forbidden: Only Workspace Admins can modify member roles' });
        return true;
      }
      const body = await parseJsonBody<{ targetUid: string; role: any }>(req);
      const updated = authBackend.updateUserRole(body.targetUid, body.role, caller);
      broadcastRealtimeEvent('sync', { accounts: authBackend.getAccounts() });
      broadcastRealtimeEvent('user_updated', updated);
      sendJson(req, res, 200, { success: true, user: updated });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Role update failed';
      sendJson(req, res, 400, { error: message });
    }
    return true;
  }

  // POST /api/auth/admin/update-status
  if (method === 'POST' && url === '/api/auth/admin/update-status') {
    try {
      const token = extractAuthToken(req);
      const caller = authBackend.getSessionUser(token);
      if (!caller || caller.role !== 'workspace_admin') {
        sendJson(req, res, 403, { error: 'Forbidden: Only Workspace Admins can modify member status' });
        return true;
      }
      const body = await parseJsonBody<{ targetUid: string; status: any }>(req);
      const updated = authBackend.updateUserStatus(body.targetUid, body.status, caller);
      broadcastRealtimeEvent('sync', { accounts: authBackend.getAccounts() });
      broadcastRealtimeEvent('user_updated', updated);
      sendJson(req, res, 200, { success: true, user: updated });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Status update failed';
      sendJson(req, res, 400, { error: message });
    }
    return true;
  }

  // =========================================================================
  // 4. REALTIME SERVER-SENT EVENTS (SSE) STREAM (/api/sync/events)
  // =========================================================================
  if (method === 'GET' && url.startsWith('/api/sync/events')) {
    const parsedUrl = new URL(url, 'http://localhost');
    const userId = parsedUrl.searchParams.get('userId') || '';

    applyCorsHeaders(req, res);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    });

    res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', bootId: SERVER_BOOT_ID, timestamp: Date.now() })}\n\n`);

    const connection: SseConnection = {
      id: `sse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId,
      res,
    };
    sseConnections.add(connection);

    const heartbeat = setInterval(() => {
      try {
        res.write(': keep-alive\n\n');
      } catch {
        clearInterval(heartbeat);
        sseConnections.delete(connection);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseConnections.delete(connection);
    });
    return true;
  }

  // =========================================================================
  // 5. WEB PUSH NOTIFICATION ROUTES (/api/push)
  // =========================================================================

  // GET /api/push/vapid-public-key
  if (method === 'GET' && url.startsWith('/api/push/vapid-public-key')) {
    const key = pushBackend.getPublicKey();
    sendJson(req, res, 200, { publicKey: key, isReady: pushBackend.isReady() });
    return true;
  }

  // POST /api/push/subscribe
  if (method === 'POST' && url === '/api/push/subscribe') {
    try {
      const body = await parseJsonBody<{
        userId: string;
        endpoint: string;
        keys: { p256dh: string; auth: string };
        userAgent?: string;
        deviceLabel?: string;
      }>(req);

      if (!body.userId || !body.endpoint || !body.keys) {
        sendJson(req, res, 400, { error: 'Missing required subscription fields (userId, endpoint, keys).' });
        return true;
      }

      const sub = pushBackend.registerSubscription(body);
      sendJson(req, res, 200, { success: true, subscription: sub });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Subscription registration failed';
      sendJson(req, res, 400, { error: message });
    }
    return true;
  }

  // POST /api/push/unsubscribe
  if (method === 'POST' && url === '/api/push/unsubscribe') {
    try {
      const body = await parseJsonBody<{ userId: string; endpoint: string }>(req);
      if (!body.userId || !body.endpoint) {
        sendJson(req, res, 400, { error: 'Missing userId or endpoint.' });
        return true;
      }
      const removed = pushBackend.unregisterSubscription(body.endpoint, body.userId);
      sendJson(req, res, 200, { success: removed });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unsubscribe failed';
      sendJson(req, res, 400, { error: message });
    }
    return true;
  }

  // GET /api/push/subscriptions?userId=...
  if (method === 'GET' && url.startsWith('/api/push/subscriptions')) {
    const parsedUrl = new URL(url, 'http://localhost');
    const userId = parsedUrl.searchParams.get('userId');
    if (!userId) {
      sendJson(req, res, 400, { error: 'userId query parameter is required.' });
      return true;
    }
    const subs = pushBackend.getSubscriptionsForUser(userId);
    sendJson(req, res, 200, { subscriptions: subs });
    return true;
  }

  // POST /api/push/test
  if (method === 'POST' && url === '/api/push/test') {
    try {
      const body = await parseJsonBody<{
        userId: string;
        title?: string;
        body?: string;
        deviceLabel?: string;
      }>(req);

      if (!body.userId) {
        sendJson(req, res, 400, { error: 'Missing userId parameter.' });
        return true;
      }

      const payload = {
        id: `test-${Date.now()}`,
        title: body.title || 'OJIX TeamFlow — Test Web Push',
        body: body.body || `Web Push notification verified for ${body.deviceLabel || 'device'}. Native VAPID delivery successful!`,
        tag: 'teamflow-push-test',
        url: '/messages',
        timestamp: Date.now(),
      };

      const results = await pushBackend.sendPushToUser(body.userId, payload);
      sendJson(req, res, 200, { success: true, count: results.length, results });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Test push failed';
      sendJson(req, res, 500, { error: message });
    }
    return true;
  }

  // POST /api/push/send
  if (method === 'POST' && url === '/api/push/send') {
    try {
      const body = await parseJsonBody<{
        recipientUserId: string;
        payload: any;
      }>(req);

      if (!body.recipientUserId || !body.payload) {
        sendJson(req, res, 400, { error: 'Missing recipientUserId or payload.' });
        return true;
      }

      const dedupKey = body.payload.deduplicationKey || null;
      const notif = {
        id: body.payload.id || `notif-${Date.now()}`,
        recipientUserId: body.recipientUserId,
        actorUserId: body.payload.actorUserId || '',
        actorDisplayName: body.payload.actorDisplayName || 'Team Member',
        type: body.payload.type || 'TASK_COMMENT_MENTION',
        title: body.payload.title || 'OJIX TeamFlow Alert',
        body: body.payload.body || '',
        projectId: body.payload.projectId || null,
        projectName: body.payload.projectName || null,
        taskId: body.payload.taskId || null,
        taskTitle: body.payload.taskTitle || null,
        commentId: body.payload.commentId || null,
        conversationId: body.payload.conversationId || null,
        isRead: false,
        createdAt: new Date().toISOString(),
        deduplicationKey: dedupKey,
      };

      const exists = sharedSyncData.notifications.some(
        n => (n.id && n.id === notif.id) || (dedupKey && n.deduplicationKey && n.deduplicationKey === dedupKey)
      );
      if (!exists) {
        sharedSyncData.notifications.unshift(notif);
        cloudPersistence.saveSyncData(sharedSyncData).catch(() => {});
        broadcastRealtimeEvent('notification', notif);
      }

      const results = await pushBackend.sendPushToUser(body.recipientUserId, body.payload);
      sendJson(req, res, 200, { success: true, count: results.length, duplicate: exists, results });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Send push failed';
      sendJson(req, res, 500, { error: message });
    }
    return true;
  }

  // =========================================================================
  // 6. MESSAGES API (/api/messages)
  // =========================================================================

  // GET /api/messages
  if (method === 'GET' && url.startsWith('/api/messages')) {
    const caller = getCallingUser(req);
    if (caller) {
      if (caller.status === 'blocked' || caller.status === 'terminated') {
        sendJson(req, res, 403, { error: `Permission denied: Account is ${caller.status}. Message access revoked.` });
        return true;
      }
    }

    const parsedUrl = new URL(url, 'http://localhost');
    const conversationId = parsedUrl.searchParams.get('conversationId');
    const userId = parsedUrl.searchParams.get('userId');
    const pageParam = parsedUrl.searchParams.get('page');
    const pageSizeParam = parsedUrl.searchParams.get('pageSize') || parsedUrl.searchParams.get('limit');

    let list = [...sharedSyncData.directMessages];
    if (conversationId) {
      list = list.filter(m => m.conversationId === conversationId);
    }
    if (userId) {
      list = list.filter(m => m.senderId === userId || m.recipientId === userId);
    }

    // Role-based privacy: non-admin callers can only access messages they are participant in
    if (caller && caller.role !== 'workspace_admin') {
      list = list.filter(m => m.senderId === caller.uid || m.recipientId === caller.uid);
    }

    list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const total = list.length;

    if (pageParam !== null || pageSizeParam !== null) {
      const pageSize = Math.max(1, Math.min(100, parseInt(pageSizeParam || '20', 10) || 20));
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.max(1, Math.min(parseInt(pageParam || '1', 10) || 1, totalPages));
      const startIndex = (page - 1) * pageSize;
      const pagedMessages = list.slice(startIndex, startIndex + pageSize);

      sendJson(req, res, 200, {
        success: true,
        count: pagedMessages.length,
        total,
        page,
        pageSize,
        totalPages,
        hasMore: page < totalPages,
        messages: pagedMessages,
      });
      return true;
    }

    sendJson(req, res, 200, {
      success: true,
      count: list.length,
      total,
      page: 1,
      pageSize: total,
      totalPages: 1,
      hasMore: false,
      messages: list,
    });
    return true;
  }

  // POST /api/messages
  if (method === 'POST' && url === '/api/messages') {
    try {
      const caller = getCallingUser(req);
      if (caller) {
        if (caller.status === 'blocked' || caller.status === 'terminated') {
          sendJson(req, res, 403, { error: `Permission denied: Account is ${caller.status}. Message sending revoked.` });
          return true;
        }
        if (caller.role === 'viewer') {
          sendJson(req, res, 403, { error: 'Permission denied: Viewers have read-only access and cannot send direct messages.' });
          return true;
        }
      }

      const body = await parseJsonBody<{
        id?: string;
        senderId: string;
        senderDisplayName?: string;
        recipientId: string;
        recipientDisplayName?: string;
        subject?: string;
        body: string;
        conversationId?: string;
      }>(req);

      if (!body.senderId || !body.recipientId || !body.body?.trim()) {
        sendJson(req, res, 400, { error: 'Missing senderId, recipientId, or body.' });
        return true;
      }

      const trimmedBody = body.body.trim();
      if (trimmedBody.length > 2000) {
        sendJson(req, res, 400, { error: 'Message body cannot exceed 2000 characters.' });
        return true;
      }

      const conversationId =
        body.conversationId || `conv-${[body.senderId, body.recipientId].sort().join('-')}`;
      const now = new Date().toISOString();
      const messageId = body.id || `dm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

      const message = {
        id: messageId,
        conversationId,
        senderId: body.senderId,
        senderDisplayName: body.senderDisplayName || 'Team Member',
        recipientId: body.recipientId,
        recipientDisplayName: body.recipientDisplayName || 'Team Member',
        subject: body.subject?.trim() || undefined,
        body: trimmedBody,
        isRead: false,
        createdAt: now,
      };

      const existingIdx = sharedSyncData.directMessages.findIndex(m => m.id === message.id);
      if (existingIdx === -1) {
        sharedSyncData.directMessages.push(message);
      } else {
        sharedSyncData.directMessages[existingIdx] = message;
      }

      // Also create real-time notification for recipient
      const bodyPreview = trimmedBody.length > 100 ? `${trimmedBody.slice(0, 100)}...` : trimmedBody;
      const notifTitle = body.subject?.trim()
        ? `New message: ${body.subject.trim()}`
        : `Message from ${message.senderDisplayName}`;

      const notif = {
        id: `notif-dm-${message.id}`,
        recipientUserId: body.recipientId,
        actorUserId: body.senderId,
        actorDisplayName: message.senderDisplayName,
        type: 'DIRECT_MESSAGE_RECEIVED',
        title: notifTitle,
        body: `${message.senderDisplayName}: "${bodyPreview}"`,
        entityType: 'conversation',
        entityId: conversationId,
        conversationId,
        isRead: false,
        createdAt: now,
        deduplicationKey: `dm-notif-${message.id}`,
      };

      const notifExists = sharedSyncData.notifications.some(
        n => n.id === notif.id || (n.deduplicationKey && n.deduplicationKey === notif.deduplicationKey)
      );
      if (!notifExists) {
        sharedSyncData.notifications.unshift(notif);
      }

      await cloudPersistence.saveSyncData(sharedSyncData);

      broadcastRealtimeEvent('message', message);
      broadcastRealtimeEvent('sync', {
        directMessages: [message],
        notifications: [notif],
      });

      pushBackend.sendPushToUser(body.recipientId, {
        id: notif.id,
        recipientUserId: body.recipientId,
        actorUserId: body.senderId,
        actorDisplayName: message.senderDisplayName,
        title: notifTitle,
        body: notif.body,
        type: 'DIRECT_MESSAGE_RECEIVED',
        conversationId,
        timestamp: Date.now(),
        requireInteraction: true,
      }).catch(() => {});

      sendJson(req, res, 201, { success: true, message });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Send message failed';
      sendJson(req, res, 500, { error: message });
    }
    return true;
  }

  // =========================================================================
  // 7. COLLABORATIVE SYNC API (/api/sync)
  // =========================================================================

  // GET /api/sync
  if (method === 'GET' && url.startsWith('/api/sync')) {
    const token = extractAuthToken(req);
    const caller = getCallingUser(req);
    if (token && !caller) {
      sendJson(req, res, 401, { error: 'Unauthorized: Invalid, expired, or revoked session.' });
      return true;
    }
    if (caller) {
      if (caller.status === 'blocked' || caller.status === 'terminated') {
        sendJson(req, res, 403, { error: `Permission denied: Account is ${caller.status}. Workspace access revoked.` });
        return true;
      }
    }

    sendJson(req, res, 200, {
      bootId: SERVER_BOOT_ID,
      notifications: sharedSyncData.notifications,
      logs: sharedSyncData.logs,
      directMessages: sharedSyncData.directMessages,
      projects: sharedSyncData.projects,
      tasks: sharedSyncData.tasks,
      accounts: authBackend.getAccounts(),
    });
    return true;
  }

  // POST /api/sync
  if (method === 'POST' && url === '/api/sync') {
    try {
      const token = extractAuthToken(req);
      const caller = getCallingUser(req);
      if (token && !caller) {
        sendJson(req, res, 401, { error: 'Unauthorized: Invalid, expired, or revoked session.' });
        return true;
      }
      if (caller) {
        if (caller.status === 'blocked' || caller.status === 'terminated') {
          sendJson(req, res, 403, { error: `Permission denied: Account is ${caller.status}. Workspace access revoked.` });
          return true;
        }
        if (caller.role === 'viewer') {
          sendJson(req, res, 403, { error: 'Permission denied: Viewers have read-only access and cannot modify projects or tasks.' });
          return true;
        }
      }

      const body = await parseJsonBody<{
        notifications?: any[];
        logs?: any[];
        directMessages?: any[];
        projects?: any[];
        tasks?: any[];
      }>(req);

      // Role check: Members cannot create brand-new projects
      if (caller && caller.role === 'member' && Array.isArray(body.projects)) {
        for (const p of body.projects) {
          if (p && p.id && !sharedSyncData.projects.some(existing => existing.id === p.id)) {
            sendJson(req, res, 403, { error: 'Permission denied: Members cannot create new projects. Only Project Leads and Workspace Admins can create projects.' });
            return true;
          }
        }
      }

      // Validate task state machine & role assignments
      if (Array.isArray(body.tasks)) {
        const accounts = authBackend.getAccounts();
        for (const t of body.tasks) {
          if (!t || !t.id) continue;

          // Check assignee eligibility: Workspace Admins and Viewers cannot be assigned tasks
          if (t.assigneeId) {
            const assignee = accounts.find(a => a.uid === t.assigneeId);
            if (assignee && (assignee.role === 'workspace_admin' || assignee.role === 'viewer')) {
              sendJson(req, res, 400, {
                error: `Invalid task assignee: Users with role '${assignee.role}' cannot be assigned tasks. Assignee must be a Member or Project Lead.`,
              });
              return true;
            }
          }

          // Check state machine transition: cannot jump directly from in_progress to done
          const existing = sharedSyncData.tasks.find(existingTask => existingTask.id === t.id);
          if (existing) {
            if (existing.status === 'in_progress' && t.status === 'done') {
              sendJson(req, res, 400, {
                error: 'Invalid status transition: Task cannot jump directly from In Progress to Done. Must be submitted for In Review first.',
              });
              return true;
            }

            // Self-review policy: assigned member cannot approve their own task to done if reviewer is assigned
            if (existing.status === 'in_review' && t.status === 'done') {
              if (
                caller &&
                caller.uid === t.assigneeId &&
                t.reviewerId &&
                t.reviewerId !== t.assigneeId &&
                caller.role !== 'workspace_admin'
              ) {
                sendJson(req, res, 403, {
                  error: 'Self-review policy: The assigned member cannot approve their own task to Done. Reviewer approval required.',
                });
                return true;
              }
            }
          }
        }
      }

      let changed = false;

      // Sync projects
      if (Array.isArray(body.projects) && body.projects.length > 0) {
        for (const p of body.projects) {
          if (!p || !p.id) continue;
          const idx = sharedSyncData.projects.findIndex(item => item.id === p.id);
          if (idx === -1) {
            sharedSyncData.projects.push(p);
            changed = true;
          } else {
            const existing = sharedSyncData.projects[idx];
            const mergedMemberIds = Array.from(new Set([...(existing.memberIds || []), ...(p.memberIds || [])]));
            const isNewer = !existing.updatedAt || !p.updatedAt || new Date(p.updatedAt) >= new Date(existing.updatedAt);
            const updatedProject = {
              ...(isNewer ? p : existing),
              memberIds: mergedMemberIds,
            };
            if (JSON.stringify(updatedProject) !== JSON.stringify(existing)) {
              sharedSyncData.projects[idx] = updatedProject;
              changed = true;
            }
          }
        }
      }

      // Sync tasks
      if (Array.isArray(body.tasks) && body.tasks.length > 0) {
        for (const t of body.tasks) {
          if (!t || !t.id) continue;
          const idx = sharedSyncData.tasks.findIndex(item => item.id === t.id);
          if (idx === -1) {
            sharedSyncData.tasks.push(t);
            changed = true;
          } else {
            const existing = sharedSyncData.tasks[idx];
            const isNewer = !existing.updatedAt || !t.updatedAt || new Date(t.updatedAt) >= new Date(existing.updatedAt);
            if (isNewer && JSON.stringify(t) !== JSON.stringify(existing)) {
              sharedSyncData.tasks[idx] = t;
              changed = true;
            }
          }
        }
      }

      // Sync notifications
      if (Array.isArray(body.notifications)) {
        for (const n of body.notifications) {
          if (!n || !n.id) continue;
          const dedupKey = n.deduplicationKey || null;
          const idx = sharedSyncData.notifications.findIndex(
            item => item.id === n.id || (dedupKey && item.deduplicationKey && item.deduplicationKey === dedupKey)
          );
          if (idx === -1) {
            sharedSyncData.notifications.unshift(n);
            changed = true;
          } else if (n.isRead !== sharedSyncData.notifications[idx].isRead) {
            sharedSyncData.notifications[idx] = { ...sharedSyncData.notifications[idx], isRead: n.isRead };
            changed = true;
          }
        }
      }

      // Sync logs
      if (Array.isArray(body.logs)) {
        for (const l of body.logs) {
          if (!l || !l.id) continue;
          const exists = sharedSyncData.logs.some(item => item.id === l.id);
          if (!exists) {
            sharedSyncData.logs.unshift(l);
            changed = true;
          }
        }
      }

      // Sync direct messages
      if (Array.isArray(body.directMessages)) {
        for (const m of body.directMessages) {
          if (!m || !m.id) continue;
          const idx = sharedSyncData.directMessages.findIndex(item => item.id === m.id);
          if (idx === -1) {
            sharedSyncData.directMessages.push(m);
            changed = true;
          } else if (m.isRead !== sharedSyncData.directMessages[idx].isRead) {
            sharedSyncData.directMessages[idx] = { ...sharedSyncData.directMessages[idx], isRead: m.isRead };
            changed = true;
          }
        }
      }

      if (changed) {
        await cloudPersistence.saveSyncData(sharedSyncData);
        broadcastRealtimeEvent('sync', {
          notifications: body.notifications,
          logs: body.logs,
          directMessages: body.directMessages,
          projects: sharedSyncData.projects,
          tasks: sharedSyncData.tasks,
        });
      }

      sendJson(req, res, 200, sharedSyncData);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      sendJson(req, res, 500, { error: message });
    }
    return true;
  }

  // POST /api/sync/delete-project
  if (method === 'POST' && url === '/api/sync/delete-project') {
    try {
      const caller = getCallingUser(req);
      if (caller && (caller.role === 'viewer' || caller.role === 'member')) {
        sendJson(req, res, 403, { error: 'Permission denied: Only Workspace Admins and Project Leads can delete projects.' });
        return true;
      }

      const body = await parseJsonBody<{ projectId: string }>(req);
      if (body.projectId) {
        sharedSyncData.projects = sharedSyncData.projects.filter(p => p.id !== body.projectId);
        sharedSyncData.tasks = sharedSyncData.tasks.filter(t => t.projectId !== body.projectId);
        await cloudPersistence.saveSyncData(sharedSyncData);
        broadcastRealtimeEvent('sync', {
          projects: sharedSyncData.projects,
          tasks: sharedSyncData.tasks,
          deletedProjectId: body.projectId,
        });
      }
      sendJson(req, res, 200, { success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Delete project sync failed';
      sendJson(req, res, 500, { error: message });
    }
    return true;
  }

  // POST /api/sync/delete-task
  if (method === 'POST' && url === '/api/sync/delete-task') {
    try {
      const caller = getCallingUser(req);
      if (caller && caller.role === 'viewer') {
        sendJson(req, res, 403, { error: 'Permission denied: Viewers cannot delete tasks.' });
        return true;
      }

      const body = await parseJsonBody<{ taskId: string }>(req);
      if (body.taskId) {
        sharedSyncData.tasks = sharedSyncData.tasks.filter(t => t.id !== body.taskId);
        await cloudPersistence.saveSyncData(sharedSyncData);
        broadcastRealtimeEvent('sync', {
          tasks: sharedSyncData.tasks,
          deletedTaskId: body.taskId,
        });
      }
      sendJson(req, res, 200, { success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Delete task sync failed';
      sendJson(req, res, 500, { error: message });
    }
    return true;
  }

  // Clear all data (Admin restricted)
  if ((method === 'POST' || method === 'GET') && (url === '/api/clear-all-data' || url === '/api/sync/clear')) {
    try {
      const caller = getCallingUser(req);
      if (cloudPersistence.isProduction() || caller) {
        if (!caller || caller.role !== 'workspace_admin') {
          sendJson(req, res, 403, { error: 'Forbidden: Only Workspace Admins can clear all workspace data.' });
          return true;
        }
      }

      sharedSyncData.notifications = [];
      sharedSyncData.logs = [];
      sharedSyncData.directMessages = [];
      sharedSyncData.projects = [];
      sharedSyncData.tasks = [];
      await cloudPersistence.saveSyncData(sharedSyncData);
      authBackend.reset();
      pushBackend.clearAllSubscriptions();
      broadcastRealtimeEvent('sync', {
        notifications: [],
        logs: [],
        directMessages: [],
        projects: [],
        tasks: [],
        accounts: authBackend.getAccounts(),
      });
      broadcastRealtimeEvent('cleared', { timestamp: Date.now() });
      sendJson(req, res, 200, { success: true, message: 'All server synced data cleared and database reset.' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Clear failed';
      sendJson(req, res, 500, { error: message });
    }
    return true;
  }

  // =========================================================================
  // 8. CRM INTEGRATION API (/api/crm)
  // =========================================================================

  // GET /api/crm/projects — Fetch available won deals from OJIX ClientFlow CRM
  if (method === 'GET' && url.startsWith('/api/crm/projects')) {
    const token = extractAuthToken(req);
    const caller = getCallingUser(req);
    if (!token || !caller) {
      sendJson(req, res, 401, { error: 'Unauthorized: Authentication required to fetch CRM projects.' });
      return true;
    }
    if (caller.status === 'blocked' || caller.status === 'terminated') {
      sendJson(req, res, 403, { error: `Permission denied: Account is ${caller.status}. Workspace access revoked.` });
      return true;
    }
    if (caller.role !== 'workspace_admin') {
      sendJson(req, res, 403, { error: 'Permission denied: Only Workspace Admins are authorized to fetch CRM projects.' });
      return true;
    }

    const apiKey = process.env.CLIENTFLOW_CRM_API_KEY || 'ojix-teamflow-clientflow-2026';
    const baseUrl = process.env.CLIENTFLOW_CRM_API_URL || 'https://client-flow-5xb8.vercel.app/api/projects?stage=WON';
    const targetUrl = baseUrl.includes('api_key=')
      ? baseUrl
      : `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(apiKey)}`;

    try {
      const crmRes = await fetch(targetUrl);
      if (!crmRes.ok) {
        sendJson(req, res, crmRes.status, {
          error: `OJIX ClientFlow CRM server returned HTTP status ${crmRes.status}.`,
          status: crmRes.status,
        });
        return true;
      }
      const crmData = await crmRes.json();
      if (!crmData || typeof crmData !== 'object' || !Array.isArray(crmData.projects)) {
        sendJson(req, res, 502, {
          error: 'Invalid response format received from OJIX ClientFlow CRM.',
        });
        return true;
      }

      // Annotate projects with alreadyImported & validation status
      const enrichedProjects = crmData.projects.map((proj: any) => {
        const extId = proj.id;
        const dealId = proj.dealId;
        const isAlreadyImported = sharedSyncData.projects.some(
          p => (p.crmMetadata?.externalId && p.crmMetadata.externalId === extId) ||
               (dealId && p.crmMetadata?.dealId && p.crmMetadata.dealId === dealId)
        );
        const isValidDateRange = !proj.startDate || !proj.dueDate || proj.startDate <= proj.dueDate;
        const validationError = !isValidDateRange
          ? `Target completion date (${proj.dueDate}) must be on or after start date (${proj.startDate}).`
          : undefined;

        return {
          ...proj,
          isAlreadyImported,
          isValidDateRange,
          validationError,
        };
      });

      sendJson(req, res, 200, {
        success: true,
        message: crmData.message || 'Projects successfully fetched from OJIX ClientFlow CRM',
        sourceApp: crmData.sourceApp || 'OJIX ClientFlow (CRM)',
        targetApp: crmData.targetApp || 'OJIX TeamFlow (Project OS)',
        totalCount: enrichedProjects.length,
        projects: enrichedProjects,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to connect to OJIX ClientFlow CRM';
      sendJson(req, res, 502, { error: message });
    }
    return true;
  }

  // POST /api/crm/import — Import selected projects into TeamFlow with server-side validation & atomicity
  if (method === 'POST' && url === '/api/crm/import') {
    const token = extractAuthToken(req);
    const caller = getCallingUser(req);
    if (!token || !caller) {
      sendJson(req, res, 401, { error: 'Unauthorized: Authentication required to import projects.' });
      return true;
    }
    if (caller.status === 'blocked' || caller.status === 'terminated') {
      sendJson(req, res, 403, { error: `Permission denied: Account is ${caller.status}. Workspace access revoked.` });
      return true;
    }
    if (caller.role !== 'workspace_admin') {
      sendJson(req, res, 403, { error: 'Permission denied: Only Workspace Admins can import projects from ClientFlow CRM.' });
      return true;
    }

    try {
      const body = await parseJsonBody<{ projects: any[] }>(req);
      if (!Array.isArray(body.projects) || body.projects.length === 0) {
        sendJson(req, res, 400, { error: 'No projects provided for import.' });
        return true;
      }

      const accounts = authBackend.getAccounts();
      const adminUsers = accounts.filter(
        u => u.role === 'workspace_admin' && u.status !== 'blocked' && u.status !== 'terminated'
      );
      const adminIds = adminUsers.map(u => u.uid);

      const importedProjects: any[] = [];
      const failedProjects: Array<{ id: string; name: string; reason: string }> = [];

      for (const crmProj of body.projects) {
        const projName = (crmProj.name || crmProj.title || '').trim();
        const projObjective = (crmProj.objective || '').trim();
        const crmId = crmProj.id || crmProj.dealId || '';

        if (!crmId) {
          failedProjects.push({
            id: crmId || 'unknown',
            name: projName || 'Unnamed CRM Project',
            reason: 'Missing external project identifier.',
          });
          continue;
        }

        if (!projName) {
          failedProjects.push({
            id: crmId,
            name: crmId,
            reason: 'Project name is required.',
          });
          continue;
        }

        // Duplicate check
        const already = sharedSyncData.projects.some(
          p => (p.crmMetadata?.externalId && p.crmMetadata.externalId === crmId) ||
               (crmProj.dealId && p.crmMetadata?.dealId && p.crmMetadata.dealId === crmProj.dealId)
        );
        if (already) {
          failedProjects.push({
            id: crmId,
            name: projName,
            reason: 'This project has already been imported into TeamFlow.',
          });
          continue;
        }

        // Date validation: dueDate must not be earlier than startDate
        if (crmProj.startDate && crmProj.dueDate && crmProj.startDate > crmProj.dueDate) {
          failedProjects.push({
            id: crmId,
            name: projName,
            reason: `Target completion date (${crmProj.dueDate}) must be on or after start date (${crmProj.startDate}).`,
          });
          continue;
        }

        const now = new Date().toISOString();
        const newProject = {
          id: `proj-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
          workspaceId: 'ws-ojix-main',
          name: projName,
          objective: projObjective || `Imported from OJIX ClientFlow CRM (Deal ID: ${crmProj.dealId || crmId}).`,
          ownerId: caller.uid,
          status: (crmProj.status === 'active' || crmProj.status === 'planning' || crmProj.status === 'on_hold')
            ? crmProj.status
            : 'active',
          startDate: crmProj.startDate || now.split('T')[0],
          dueDate: crmProj.dueDate || now.split('T')[0],
          memberIds: Array.from(new Set([caller.uid, ...adminIds])),
          createdAt: now,
          updatedAt: now,
          crmMetadata: {
            source: 'clientflow_crm',
            externalId: crmProj.id,
            dealId: crmProj.dealId,
            clientName: crmProj.client?.name,
            clientEmail: crmProj.client?.email,
            clientPhone: crmProj.client?.phone,
            dealValue: crmProj.dealValue,
            dealStage: crmProj.dealStage,
            temperature: crmProj.temperature,
            sourceStatus: crmProj.status,
            isReadyForExecution: crmProj.isReadyForExecution,
            crmWorkspaceId: crmProj.workspaceId,
            crmWorkspaceName: crmProj.workspaceName,
            sourceCreatedAt: crmProj.createdAt,
            lastActivityAt: crmProj.lastActivityAt,
            importedAt: now,
            importedByUid: caller.uid,
          },
        };

        sharedSyncData.projects.push(newProject);
        importedProjects.push(newProject);
      }

      if (importedProjects.length > 0) {
        await cloudPersistence.saveSyncData(sharedSyncData);
        broadcastRealtimeEvent('sync', { projects: importedProjects });
        broadcastRealtimeEvent('project_created', importedProjects);
      }

      sendJson(req, res, 200, {
        success: failedProjects.length === 0,
        totalRequested: body.projects.length,
        importedCount: importedProjects.length,
        failedCount: failedProjects.length,
        importedProjects,
        failedProjects,
      });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Import failed';
      sendJson(req, res, 500, { error: message });
      return true;
    }
  }

  return false;
}
