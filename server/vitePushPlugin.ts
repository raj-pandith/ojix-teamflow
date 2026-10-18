import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import { pushBackend } from './pushBackend';

interface SharedSyncData {
  notifications: any[];
  logs: any[];
}

const syncFilePath = path.resolve(process.cwd(), '.server-sync.json');

export const SERVER_BOOT_TIME = Date.now();
export const SERVER_BOOT_ID = `server-boot-${SERVER_BOOT_TIME}`;

export const DEFAULT_SEED_NOTIFICATIONS: any[] = [];

function loadSyncData(): SharedSyncData {
  try {
    // When server restarts, start with 0 seeded notifications
    const seededData: SharedSyncData = {
      notifications: [],
      logs: [],
    };
    fs.writeFileSync(syncFilePath, JSON.stringify(seededData, null, 2), 'utf8');
    return seededData;
  } catch {
    return { notifications: [], logs: [] };
  }
}


function saveSyncData(data: SharedSyncData) {
  try {
    fs.writeFileSync(syncFilePath, JSON.stringify(data, null, 2), 'utf8');
  } catch {}
}

const sharedSyncData: SharedSyncData = loadSyncData();

interface SseConnection {
  id: string;
  userId?: string;
  res: ServerResponse;
}

const sseConnections = new Set<SseConnection>();

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

// Helper to parse JSON body from incoming HTTP request
function parseJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 64) {
        // 64kb limit
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        resolve(parsed as T);
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.end(JSON.stringify(data));
}

export function viteWebPushPlugin(): Plugin {
  return {
    name: 'vite-web-push-plugin',
    configureServer(server: ViteDevServer) {
      setupPushMiddlewares(server.middlewares);
    },
    configurePreviewServer(server: PreviewServer) {
      setupPushMiddlewares(server.middlewares);
    },
  };
}

function setupPushMiddlewares(middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void }) {
  middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url || '';

    // Handle CORS preflight
    if (req.method === 'OPTIONS' && (url.startsWith('/api/push') || url.startsWith('/api/sync'))) {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.end();
      return;
    }

    // 0. GET /api/sync/events — Real-Time Zero-Latency Server-Sent Events (SSE) Stream
    if (req.method === 'GET' && url.startsWith('/api/sync/events')) {
      const parsedUrl = new URL(url, 'http://localhost');
      const userId = parsedUrl.searchParams.get('userId') || '';

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
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
      return;
    }

    // 1. GET /api/push/vapid-public-key
    if (req.method === 'GET' && url.startsWith('/api/push/vapid-public-key')) {
      const key = pushBackend.getPublicKey();
      sendJson(res, 200, { publicKey: key, isReady: pushBackend.isReady() });
      return;
    }

    // 2. POST /api/push/subscribe
    if (req.method === 'POST' && url === '/api/push/subscribe') {
      try {
        const body = await parseJsonBody<{
          userId: string;
          endpoint: string;
          keys: { p256dh: string; auth: string };
          userAgent?: string;
          deviceLabel?: string;
        }>(req);

        if (!body.userId || !body.endpoint || !body.keys) {
          sendJson(res, 400, { error: 'Missing required subscription fields (userId, endpoint, keys).' });
          return;
        }

        const sub = pushBackend.registerSubscription(body);
        sendJson(res, 200, { success: true, subscription: sub });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Subscription registration failed';
        sendJson(res, 400, { error: message });
      }
      return;
    }

    // 3. POST /api/push/unsubscribe
    if (req.method === 'POST' && url === '/api/push/unsubscribe') {
      try {
        const body = await parseJsonBody<{ userId: string; endpoint: string }>(req);
        if (!body.userId || !body.endpoint) {
          sendJson(res, 400, { error: 'Missing userId or endpoint.' });
          return;
        }

        const removed = pushBackend.unregisterSubscription(body.endpoint, body.userId);
        sendJson(res, 200, { success: removed });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unsubscribe failed';
        sendJson(res, 400, { error: message });
      }
      return;
    }

    // 4. GET /api/push/subscriptions?userId=...
    if (req.method === 'GET' && url.startsWith('/api/push/subscriptions')) {
      const parsedUrl = new URL(url, 'http://localhost');
      const userId = parsedUrl.searchParams.get('userId');

      if (!userId) {
        sendJson(res, 400, { error: 'userId query parameter is required.' });
        return;
      }

      const subs = pushBackend.getSubscriptionsForUser(userId);
      sendJson(res, 200, { subscriptions: subs });
      return;
    }

    // 5. POST /api/push/test
    if (req.method === 'POST' && url === '/api/push/test') {
      try {
        const body = await parseJsonBody<{
          userId: string;
          title?: string;
          body?: string;
          deviceLabel?: string;
        }>(req);

        if (!body.userId) {
          sendJson(res, 400, { error: 'Missing userId parameter.' });
          return;
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
        sendJson(res, 200, { success: true, count: results.length, results });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Test push failed';
        sendJson(res, 500, { error: message });
      }
      return;
    }

    // 6. POST /api/push/send
    if (req.method === 'POST' && url === '/api/push/send') {
      try {
        const body = await parseJsonBody<{
          recipientUserId: string;
          payload: any;
        }>(req);

        if (!body.recipientUserId || !body.payload) {
          sendJson(res, 400, { error: 'Missing recipientUserId or payload.' });
          return;
        }

        // Store notification in shared sync store for multi-browser & multi-device sync
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
          saveSyncData(sharedSyncData);

          // Broadcast to all active browsers in real time (< 10ms)
          broadcastRealtimeEvent('notification', notif);
        }

        const results = await pushBackend.sendPushToUser(body.recipientUserId, body.payload);
        sendJson(res, 200, { success: true, count: results.length, duplicate: exists, results });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Send push failed';
        sendJson(res, 500, { error: message });
      }
      return;
    }

    // 7. GET /api/sync
    if (req.method === 'GET' && url.startsWith('/api/sync')) {
      sendJson(res, 200, {
        bootId: SERVER_BOOT_ID,
        notifications: sharedSyncData.notifications,
        logs: sharedSyncData.logs,
      });
      return;
    }

    // 8. POST /api/sync
    if (req.method === 'POST' && url === '/api/sync') {
      try {
        const body = await parseJsonBody<{
          notifications?: any[];
          logs?: any[];
        }>(req);

        let changed = false;
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

        if (changed) {
          saveSyncData(sharedSyncData);
          broadcastRealtimeEvent('sync', { notifications: body.notifications, logs: body.logs });
        }

        sendJson(res, 200, sharedSyncData);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Sync failed';
        sendJson(res, 500, { error: message });
      }
      return;
    }

    next();
  });
}
