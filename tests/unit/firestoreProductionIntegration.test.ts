import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { handleApiRequest } from '../../server/apiRouter';
import { authBackend } from '../../server/authBackend';
import { CloudPersistenceService } from '../../server/cloudPersistence';

interface MockResponseResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  json: () => any;
}

function dispatchMockRequest(options: {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
}): Promise<MockResponseResult> {
  return new Promise((resolve) => {
    const req = new EventEmitter() as any;
    req.method = options.method || 'GET';
    req.url = options.url;
    req.headers = { ...(options.headers || {}) };
    req.socket = { remoteAddress: '127.0.0.1' };

    const resHeaders: Record<string, string> = {};
    let statusCode = 200;
    let resBody = '';

    const res = new EventEmitter() as any;
    res.statusCode = 200;
    res.setHeader = (name: string, value: string) => {
      resHeaders[name.toLowerCase()] = value;
    };
    res.getHeader = (name: string) => resHeaders[name.toLowerCase()];
    res.writeHead = (code: number, headers?: Record<string, string>) => {
      statusCode = code;
      if (headers) {
        for (const [k, v] of Object.entries(headers)) {
          resHeaders[k.toLowerCase()] = v;
        }
      }
    };
    res.write = (chunk: string | Buffer) => {
      resBody += chunk.toString();
    };
    res.end = (chunk?: string | Buffer) => {
      if (chunk) {
        resBody += chunk.toString();
      }
      statusCode = res.statusCode || statusCode;
      resolve({
        statusCode,
        headers: resHeaders,
        body: resBody,
        json: () => {
          try {
            return JSON.parse(resBody);
          } catch {
            return null;
          }
        },
      });
    };

    handleApiRequest(req, res).then((handled) => {
      if (!handled) {
        res.statusCode = 404;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'Endpoint not found', path: options.url }));
      }
    });

    if (options.body) {
      const payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      req.emit('data', Buffer.from(payload));
    }
    req.emit('end');
  });
}

describe('Production-Ready Firestore Architecture & Security Integration', () => {
  beforeEach(() => {
    authBackend.reset();
  });

  // =========================================================================
  // 1. Startup & Credential Validation
  // =========================================================================
  describe('1. Production Startup & Credential Safety', () => {
    it('initializes Admin SDK only once and reuses existing instance', () => {
      const service = new CloudPersistenceService();
      const initialDb = service.getDb();
      service.initFirebase();
      expect(service.getDb()).toBe(initialDb);
    });

    it('prohibits local JSON fallback in production mode when Cloud Firestore is missing', async () => {
      const prodService = new CloudPersistenceService();
      // Simulate production environment
      vi.spyOn(prodService, 'isProduction').mockReturnValue(true);
      vi.spyOn(prodService, 'isStrictPersistence').mockReturnValue(true);
      vi.spyOn(prodService, 'isCloudReady').mockReturnValue(false);

      expect(prodService.allowLocalFallback()).toBe(false);

      await expect(prodService.loadSyncData()).rejects.toThrow(
        /Cloud Firestore is required in production/
      );

      await expect(
        prodService.saveSyncData({
          notifications: [],
          logs: [],
          directMessages: [],
          projects: [],
          tasks: [],
        })
      ).rejects.toThrow(/Cloud Firestore is required in production/);
    });

    it('health check probe reports unready (503) when Firestore is missing in production', async () => {
      const prodService = new CloudPersistenceService();
      vi.spyOn(prodService, 'isProduction').mockReturnValue(true);
      vi.spyOn(prodService, 'isStrictPersistence').mockReturnValue(true);
      vi.spyOn(prodService, 'isCloudReady').mockReturnValue(false);

      const health = await prodService.checkHealth();
      expect(health.ready).toBe(false);
      expect(health.healthy).toBe(false);
      expect(health.database).toBe('unconfigured');
    });
  });

  // =========================================================================
  // 2. Health & Readiness API Probes
  // =========================================================================
  describe('2. Liveness & Readiness Probes', () => {
    it('GET /health returns 200 with service metadata and database status', async () => {
      const res = await dispatchMockRequest({ url: '/health' });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.status).toBe('ok');
      expect(data.service).toBe('ojix-teamflow-backend');
      expect(data.databaseHealthy).toBeDefined();
    });

    it('GET /ready responds with database readiness', async () => {
      const res = await dispatchMockRequest({ url: '/ready' });
      expect([200, 503]).toContain(res.statusCode);
      const data = res.json();
      expect(data.status).toBeDefined();
      expect(data.service).toBe('ojix-teamflow-backend');
    });
  });

  // =========================================================================
  // 3. RBAC & Role Permission Enforcement
  // =========================================================================
  describe('3. Role Permission Enforcement (Viewer, Member, Project Lead, Admin)', () => {
    it('Viewer cannot modify workspace data via POST /api/sync (403 Forbidden)', async () => {
      const { session } = await authBackend.login('viewer@ojix.local', 'Password123!');
      const res = await dispatchMockRequest({
        method: 'POST',
        url: '/api/sync',
        headers: { authorization: `Bearer ${session.token}` },
        body: {
          projects: [
            {
              id: 'proj-viewer-hack',
              name: 'Viewer Unauthorized Project',
              memberIds: ['user-viewer-elena'],
            },
          ],
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toContain('Viewers have read-only access');
    });

    it('Viewer cannot send direct messages via POST /api/messages (403 Forbidden)', async () => {
      const { session } = await authBackend.login('viewer@ojix.local', 'Password123!');
      const res = await dispatchMockRequest({
        method: 'POST',
        url: '/api/messages',
        headers: { authorization: `Bearer ${session.token}` },
        body: {
          senderId: 'user-viewer-elena',
          recipientId: 'user-admin-alex',
          body: 'Viewer attempt to send message',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toContain('Viewers have read-only access');
    });

    it('Viewer cannot delete projects or tasks (403 Forbidden)', async () => {
      const { session } = await authBackend.login('viewer@ojix.local', 'Password123!');

      const projRes = await dispatchMockRequest({
        method: 'POST',
        url: '/api/sync/delete-project',
        headers: { authorization: `Bearer ${session.token}` },
        body: { projectId: 'proj-001' },
      });
      expect(projRes.statusCode).toBe(403);

      const taskRes = await dispatchMockRequest({
        method: 'POST',
        url: '/api/sync/delete-task',
        headers: { authorization: `Bearer ${session.token}` },
        body: { taskId: 'task-001' },
      });
      expect(taskRes.statusCode).toBe(403);
    });

    it('Member cannot create new projects via POST /api/sync (403 Forbidden)', async () => {
      const { session } = await authBackend.login('member@ojix.local', 'Password123!');
      const res = await dispatchMockRequest({
        method: 'POST',
        url: '/api/sync',
        headers: { authorization: `Bearer ${session.token}` },
        body: {
          projects: [
            {
              id: `proj-member-illegal-${Date.now()}`,
              name: 'Member Created Project',
              memberIds: ['user-member-marcus'],
            },
          ],
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toContain('Members cannot create new projects');
    });

    it('Rejects assigning tasks to Workspace Admins or Viewers (400 Bad Request)', async () => {
      const { session } = await authBackend.login('lead@ojix.local', 'Password123!');
      const res = await dispatchMockRequest({
        method: 'POST',
        url: '/api/sync',
        headers: { authorization: `Bearer ${session.token}` },
        body: {
          tasks: [
            {
              id: 'task-illegal-admin-assignee',
              title: 'Assigning to Admin',
              assigneeId: 'user-admin-alex', // Workspace Admin is not permitted as task assignee
              status: 'in_progress',
            },
          ],
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('cannot be assigned tasks');
    });

    it('Enforces task state machine: Cannot transition directly from in_progress to done (400 Bad Request)', async () => {
      const { session } = await authBackend.login('lead@ojix.local', 'Password123!');

      // First create task in progress
      await dispatchMockRequest({
        method: 'POST',
        url: '/api/sync',
        headers: { authorization: `Bearer ${session.token}` },
        body: {
          tasks: [
            {
              id: 'task-state-machine-test-1',
              title: 'State Machine Flow',
              assigneeId: 'user-member-marcus',
              status: 'in_progress',
            },
          ],
        },
      });

      // Attempt invalid transition directly to done
      const invalidRes = await dispatchMockRequest({
        method: 'POST',
        url: '/api/sync',
        headers: { authorization: `Bearer ${session.token}` },
        body: {
          tasks: [
            {
              id: 'task-state-machine-test-1',
              title: 'State Machine Flow',
              assigneeId: 'user-member-marcus',
              status: 'done', // Direct jump from in_progress to done!
            },
          ],
        },
      });

      expect(invalidRes.statusCode).toBe(400);
      expect(invalidRes.json().error).toContain('cannot jump directly from In Progress to Done');
    });

    it('Enforces self-review policy: assigned member cannot self-approve task to done (403 Forbidden)', async () => {
      const { session: leadSession } = await authBackend.login('lead@ojix.local', 'Password123!');

      // Set task in_review with reviewer Sarah and assignee Marcus
      await dispatchMockRequest({
        method: 'POST',
        url: '/api/sync',
        headers: { authorization: `Bearer ${leadSession.token}` },
        body: {
          tasks: [
            {
              id: 'task-review-test-1',
              title: 'Review Policy Verification',
              assigneeId: 'user-member-marcus',
              reviewerId: 'user-lead-sarah',
              status: 'in_review',
            },
          ],
        },
      });

      // Now Marcus (the assignee) attempts to approve the task to done
      const { session: memberSession } = await authBackend.login('member@ojix.local', 'Password123!');
      const approveRes = await dispatchMockRequest({
        method: 'POST',
        url: '/api/sync',
        headers: { authorization: `Bearer ${memberSession.token}` },
        body: {
          tasks: [
            {
              id: 'task-review-test-1',
              title: 'Review Policy Verification',
              assigneeId: 'user-member-marcus',
              reviewerId: 'user-lead-sarah',
              status: 'done',
            },
          ],
        },
      });

      expect(approveRes.statusCode).toBe(403);
      expect(approveRes.json().error).toContain('Self-review policy');
    });
  });

  // =========================================================================
  // 4. Message Privacy & Cross-User Isolation
  // =========================================================================
  describe('4. Cross-User Privacy & Direct Messages Isolation', () => {
    it('ensures private direct messages are isolated to discussion participants', async () => {
      // Alex sends message to Sarah
      const msgRes = await dispatchMockRequest({
        method: 'POST',
        url: '/api/messages',
        body: {
          senderId: 'user-admin-alex',
          recipientId: 'user-lead-sarah',
          body: 'Confidential lead briefing',
        },
      });
      expect(msgRes.statusCode).toBe(201);

      // Marcus logs in and attempts to retrieve messages
      const { session: marcusSession } = await authBackend.login('member@ojix.local', 'Password123!');
      const getRes = await dispatchMockRequest({
        method: 'GET',
        url: '/api/messages',
        headers: { authorization: `Bearer ${marcusSession.token}` },
      });

      expect(getRes.statusCode).toBe(200);
      const data = getRes.json();
      // Marcus must NOT see the message between Alex and Sarah
      expect(data.messages.some((m: any) => m.body === 'Confidential lead briefing')).toBe(false);
    });
  });

  // =========================================================================
  // 5. Blocked / Terminated Account Protection
  // =========================================================================
  describe('5. Blocked / Terminated Accounts Access Termination', () => {
    it('blocks terminated or blocked accounts from accessing sync or sending messages', async () => {
      // 1. Marcus logs in while active to get a session token
      const { session: marcusSession } = await authBackend.login('member@ojix.local', 'Password123!');
      expect(marcusSession.token).toBeDefined();

      // 2. Admin logs in and blocks Marcus
      const { session: adminSession } = await authBackend.login('admin@ojix.local', 'Password123!');
      await dispatchMockRequest({
        method: 'POST',
        url: '/api/auth/admin/update-status',
        headers: { authorization: `Bearer ${adminSession.token}` },
        body: {
          targetUid: 'user-member-marcus',
          status: 'blocked',
        },
      });

      // 3. Marcus attempts to query sync with his previous session token -> rejected (session terminated/blocked)
      const syncRes = await dispatchMockRequest({
        method: 'GET',
        url: '/api/sync',
        headers: { authorization: `Bearer ${marcusSession.token}` },
      });
      expect([401, 403]).toContain(syncRes.statusCode);

      // 4. Subsequent login attempts by Marcus are also rejected
      await expect(authBackend.login('member@ojix.local', 'Password123!')).rejects.toThrow(
        /Account Suspended/
      );
    });
  });
});
