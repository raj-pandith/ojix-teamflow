import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { handleApiRequest } from '../../server/apiRouter';
import { authBackend } from '../../server/authBackend';

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

describe('Backend Deployment API Consolidation & Verification', () => {
  beforeEach(() => {
    authBackend.reset();
  });

  // =========================================================================
  // 1. Health Checks
  // =========================================================================
  describe('1. Health Check Probes', () => {
    it('responds to GET /health with 200 and JSON status payload', async () => {
      const res = await dispatchMockRequest({ url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');

      const data = res.json();
      expect(data).toBeDefined();
      expect(data.status).toBe('ok');
      expect(data.service).toBe('ojix-teamflow-backend');
      expect(data.storageType).toBeDefined();
      expect(typeof data.pushReady).toBe('boolean');
      expect(data.bootId).toBeDefined();
    });

    it('responds to GET /api/health with identical status verification', async () => {
      const res = await dispatchMockRequest({ url: '/api/health' });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.status).toBe('ok');
    });
  });

  // =========================================================================
  // 2. CORS & Preflight Restrictions
  // =========================================================================
  describe('2. CORS Headers and Preflight', () => {
    it('handles OPTIONS preflight requests with 204 No Content', async () => {
      const res = await dispatchMockRequest({
        method: 'OPTIONS',
        url: '/api/sync',
        headers: {
          origin: 'https://ojix-teamflow.rajpandith1945.workers.dev',
          'access-control-request-method': 'POST',
        },
      });

      expect(res.statusCode).toBe(204);
      expect(res.headers['access-control-allow-methods']).toContain('POST');
      expect(res.headers['access-control-allow-headers']).toContain('Content-Type');
    });

    it('applies configured CORS origin header when matching request origin', async () => {
      const originalEnv = process.env.CLIENT_ORIGIN;
      process.env.CLIENT_ORIGIN = 'https://ojix-teamflow.rajpandith1945.workers.dev,http://localhost:5173';

      try {
        const res = await dispatchMockRequest({
          url: '/health',
          headers: { origin: 'https://ojix-teamflow.rajpandith1945.workers.dev' },
        });

        expect(res.headers['access-control-allow-origin']).toBe(
          'https://ojix-teamflow.rajpandith1945.workers.dev'
        );
        expect(res.headers['access-control-allow-credentials']).toBe('true');
      } finally {
        process.env.CLIENT_ORIGIN = originalEnv;
      }
    });
  });

  // =========================================================================
  // 3. Authentication & RBAC Routes
  // =========================================================================
  describe('3. Production Authentication Endpoints', () => {
    it('authenticates valid credentials and issues session token and cookie', async () => {
      const res = await dispatchMockRequest({
        method: 'POST',
        url: '/api/auth/login',
        body: {
          email: 'admin@ojix.local',
          password: 'Password123!',
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.success).toBe(true);
      expect(data.session).toBeDefined();
      expect(data.session.user.email).toBe('admin@ojix.local');
      expect(data.session.user.role).toBe('workspace_admin');
      expect(res.headers['set-cookie']).toContain('ojix_session=');
    });

    it('rejects invalid password with 401 JSON error (never HTML)', async () => {
      const res = await dispatchMockRequest({
        method: 'POST',
        url: '/api/auth/login',
        body: {
          email: 'admin@ojix.local',
          password: 'WrongPassword!',
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.headers['content-type']).toContain('application/json');
      const data = res.json();
      expect(data.error).toBeDefined();
      expect(data.error).toContain('Invalid email or password');
    });

    it('validates active session via GET /api/auth/me', async () => {
      const { session } = await authBackend.login('admin@ojix.local', 'Password123!');
      const res = await dispatchMockRequest({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${session.token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.success).toBe(true);
      expect(data.user.email).toBe('admin@ojix.local');
    });

    it('rejects invalid or missing token on GET /api/auth/me with 401', async () => {
      const res = await dispatchMockRequest({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: 'Bearer non-existent-token',
        },
      });

      expect(res.statusCode).toBe(401);
      const data = res.json();
      expect(data.error).toContain('Unauthorized');
    });

    it('enforces RBAC: Member cannot access /api/auth/admin/users (403 Forbidden)', async () => {
      const { session } = await authBackend.login('member@ojix.local', 'Password123!');
      const res = await dispatchMockRequest({
        method: 'GET',
        url: '/api/auth/admin/users',
        headers: {
          authorization: `Bearer ${session.token}`,
        },
      });

      expect(res.statusCode).toBe(403);
      const data = res.json();
      expect(data.error).toContain('Forbidden');
    });

    it('enforces RBAC: Workspace Admin successfully retrieves /api/auth/admin/users', async () => {
      const { session } = await authBackend.login('admin@ojix.local', 'Password123!');
      const res = await dispatchMockRequest({
        method: 'GET',
        url: '/api/auth/admin/users',
        headers: {
          authorization: `Bearer ${session.token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.users)).toBe(true);
      expect(data.users.length).toBeGreaterThanOrEqual(4);
    });
  });

  // =========================================================================
  // 4. Collaborative Synchronization & Persistence
  // =========================================================================
  describe('4. Shared Data Synchronization & Cloud Persistence', () => {
    it('persists and returns shared projects and tasks via /api/sync', async () => {
      const sampleProject = {
        id: 'proj-sync-test-101',
        name: 'Deployment Test Project',
        description: 'Verifying sync pipeline',
        memberIds: ['user-admin-alex'],
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const postRes = await dispatchMockRequest({
        method: 'POST',
        url: '/api/sync',
        body: {
          projects: [sampleProject],
        },
      });

      expect(postRes.statusCode).toBe(200);
      const postData = postRes.json();
      expect(postData.projects.some((p: any) => p.id === sampleProject.id)).toBe(true);

      // Verify GET /api/sync retrieves the persisted project
      const getRes = await dispatchMockRequest({ url: '/api/sync' });
      expect(getRes.statusCode).toBe(200);
      const getData = getRes.json();
      expect(getData.projects.some((p: any) => p.id === sampleProject.id)).toBe(true);
    });

    it('handles project deletion via POST /api/sync/delete-project', async () => {
      const res = await dispatchMockRequest({
        method: 'POST',
        url: '/api/sync/delete-project',
        body: { projectId: 'proj-sync-test-101' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);

      const checkRes = await dispatchMockRequest({ url: '/api/sync' });
      const checkData = checkRes.json();
      expect(checkData.projects.some((p: any) => p.id === 'proj-sync-test-101')).toBe(false);
    });
  });

  // =========================================================================
  // 5. Direct Messages API
  // =========================================================================
  describe('5. Messaging API', () => {
    it('creates, persists, and retrieves authorized messages', async () => {
      const msgPayload = {
        senderId: 'user-admin-alex',
        senderDisplayName: 'Alex Morgan',
        recipientId: 'user-lead-sarah',
        recipientDisplayName: 'Sarah Chen',
        subject: 'Deployment Ready',
        body: 'Server consolidated and ready for production.',
      };

      const postRes = await dispatchMockRequest({
        method: 'POST',
        url: '/api/messages',
        body: msgPayload,
      });

      expect(postRes.statusCode).toBe(201);
      const postData = postRes.json();
      expect(postData.success).toBe(true);
      expect(postData.message.id).toBeDefined();

      // Retrieve messages for authorized participant
      const getRes = await dispatchMockRequest({
        method: 'GET',
        url: `/api/messages?userId=user-admin-alex`,
      });

      expect(getRes.statusCode).toBe(200);
      const getData = getRes.json();
      expect(getData.messages.some((m: any) => m.body === msgPayload.body)).toBe(true);

      // Verify authorization: unrelated user cannot see this message
      const unauthorizedRes = await dispatchMockRequest({
        method: 'GET',
        url: `/api/messages?userId=user-viewer-elena`,
      });
      const unauthorizedData = unauthorizedRes.json();
      expect(unauthorizedData.messages.some((m: any) => m.body === msgPayload.body)).toBe(false);
    });
  });

  // =========================================================================
  // 6. Web Push & VAPID Endpoints
  // =========================================================================
  describe('6. Web Push Endpoints', () => {
    it('returns VAPID public key without leaking private key', async () => {
      const res = await dispatchMockRequest({
        method: 'GET',
        url: '/api/push/vapid-public-key',
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data).toHaveProperty('publicKey');
      expect(data).toHaveProperty('isReady');
      // Ensure private key is NEVER in response
      expect(data).not.toHaveProperty('privateKey');
    });

    it('registers push subscription via POST /api/push/subscribe', async () => {
      const res = await dispatchMockRequest({
        method: 'POST',
        url: '/api/push/subscribe',
        body: {
          userId: 'user-admin-alex',
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-device-token',
          keys: {
            p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9t0PwsWt0mSTqYw1O1LGy3',
            auth: 'tBHItDaQLFsChfqW9A==',
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.success).toBe(true);
      expect(data.subscription).toBeDefined();
    });
  });

  // =========================================================================
  // 7. Safe Error & Fallback Responses
  // =========================================================================
  describe('7. Safe Failure & 404 Handling', () => {
    it('returns structured JSON 404 on unhandled endpoints (never HTML)', async () => {
      const res = await dispatchMockRequest({
        method: 'GET',
        url: '/api/non-existent-endpoint',
      });

      expect(res.statusCode).toBe(404);
      expect(res.headers['content-type']).toContain('application/json');
      const data = res.json();
      expect(data.error).toBe('Endpoint not found');
    });
  });
});
