/**
 * Standalone Node.js Web Push Server for OJIX TeamFlow
 * Can be run independently in production (e.g., node server/standaloneServer.ts)
 * or alongside Vite during local development.
 */

import http from 'http';
import { pushBackend } from './pushBackend';

const PORT = process.env.PUSH_SERVER_PORT || process.env.PORT || 3001;

function parseJsonBody<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 64) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : ({} as T));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && url === '/health') {
    sendJson(res, 200, { status: 'ok', pushReady: pushBackend.isReady(), timestamp: new Date().toISOString() });
    return;
  }

  // GET /api/push/vapid-public-key
  if (req.method === 'GET' && url.startsWith('/api/push/vapid-public-key')) {
    sendJson(res, 200, { publicKey: pushBackend.getPublicKey(), isReady: pushBackend.isReady() });
    return;
  }

  // POST /api/push/subscribe
  if (req.method === 'POST' && url === '/api/push/subscribe') {
    try {
      const body = await parseJsonBody<any>(req);
      const sub = pushBackend.registerSubscription(body);
      sendJson(res, 200, { success: true, subscription: sub });
    } catch (err: any) {
      sendJson(res, 400, { error: err.message || 'Registration failed' });
    }
    return;
  }

  // POST /api/push/unsubscribe
  if (req.method === 'POST' && url === '/api/push/unsubscribe') {
    try {
      const body = await parseJsonBody<any>(req);
      const removed = pushBackend.unregisterSubscription(body.endpoint, body.userId);
      sendJson(res, 200, { success: removed });
    } catch (err: any) {
      sendJson(res, 400, { error: err.message || 'Unsubscribe failed' });
    }
    return;
  }

  // GET /api/push/subscriptions?userId=...
  if (req.method === 'GET' && url.startsWith('/api/push/subscriptions')) {
    const parsed = new URL(url, `http://localhost:${PORT}`);
    const userId = parsed.searchParams.get('userId');
    if (!userId) {
      sendJson(res, 400, { error: 'userId is required' });
      return;
    }
    sendJson(res, 200, { subscriptions: pushBackend.getSubscriptionsForUser(userId) });
    return;
  }

  // POST /api/push/send
  if (req.method === 'POST' && url === '/api/push/send') {
    try {
      const body = await parseJsonBody<any>(req);
      const results = await pushBackend.sendPushToUser(body.recipientUserId, body.payload);
      sendJson(res, 200, { success: true, count: results.length, results });
    } catch (err: any) {
      sendJson(res, 500, { error: err.message || 'Push delivery failed' });
    }
    return;
  }

  // GET /api/sync
  if (req.method === 'GET' && url.startsWith('/api/sync')) {
    sendJson(res, 200, { notifications: [], logs: [] });
    return;
  }

  // POST /api/sync
  if (req.method === 'POST' && url === '/api/sync') {
    try {
      const body = await parseJsonBody<any>(req);
      sendJson(res, 200, { success: true, received: body });
    } catch (err: any) {
      sendJson(res, 500, { error: err.message || 'Sync failed' });
    }
    return;
  }

  // POST /api/push/test
  if (req.method === 'POST' && url === '/api/push/test') {
    try {
      const body = await parseJsonBody<any>(req);
      const payload = {
        id: `test-${Date.now()}`,
        title: body.title || 'OJIX TeamFlow — Web Push Verified',
        body: body.body || 'Production Web Push notification delivered successfully via VAPID.',
        tag: 'teamflow-test-push',
        timestamp: Date.now(),
      };
      const results = await pushBackend.sendPushToUser(body.userId, payload);
      sendJson(res, 200, { success: true, count: results.length, results });
    } catch (err: any) {
      sendJson(res, 500, { error: err.message || 'Test push delivery failed' });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`[OJIX Push Server] Listening on port ${PORT} (VAPID Ready: ${pushBackend.isReady()})`);
  });
}

export { server };
