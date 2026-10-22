/**
 * Standalone Node.js Production API Server for OJIX TeamFlow
 * Serves authentication, RBAC, collaborative data sync, messages, SSE, and Web Push.
 * Integrated with Google Cloud Firestore via Firebase Admin SDK.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { handleApiRequest, sendJson } from './apiRouter';
import { pushBackend } from './pushBackend';
import { cloudPersistence } from './cloudPersistence';

// Load .env file in standalone mode if process.env is not already populated
function loadLocalEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch {
    // Ignore in read-only or container environments
  }
}

loadLocalEnv();

// Initialize push backend from environment
pushBackend.initVapid();

export const PORT = parseInt(process.env.PORT || process.env.PUSH_SERVER_PORT || '3001', 10);
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';

export const appHandler = async (req: http.IncomingMessage, res: http.ServerResponse) => {
  try {
    const handled = await handleApiRequest(req, res);
    if (!handled) {
      sendJson(req, res, 404, {
        error: 'Endpoint not found',
        path: req.url || '',
        status: 404,
      });
    }
  } catch (err: unknown) {
    const isProd = process.env.NODE_ENV === 'production';
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('[StandaloneServer] Unhandled request error:', err);
    sendJson(req, res, 500, {
      error: isProd ? 'Internal Server Error' : message,
      status: 500,
    });
  }
};

const server = http.createServer(appHandler);

// Safe Startup Validation & Logging
export function logStartupInfo() {
  const isCloud = cloudPersistence.isCloudReady();
  const projectId = cloudPersistence.getActiveProjectId();
  const storageEngine = cloudPersistence.getStorageType();

  console.log('====================================================');
  console.log('🚀 OJIX TeamFlow Standalone Backend Server');
  console.log(`📡 Port:               ${PORT}`);
  console.log(`🌐 Allowed CORS:       ${CLIENT_ORIGIN}`);
  console.log(`💾 Persistence Engine: ${storageEngine} ${isCloud ? `(Project: ${projectId})` : '(Local fallback)'}`);
  console.log(`🔔 Web Push (VAPID):   ${pushBackend.isReady() ? 'Ready' : 'Not configured (check VAPID keys)'}`);
  console.log(`🛡️ Environment:        ${process.env.NODE_ENV || 'development'}`);
  console.log(`⏱️ Server Time:        ${new Date().toISOString()}`);
  console.log('====================================================');

  if (process.env.NODE_ENV === 'production' && !isCloud) {
    console.error('⚠️ [CRITICAL DEPLOYMENT NOTICE] Cloud Firestore is NOT connected in production!');
    console.error('⚠️ Ensure FIREBASE_SERVICE_ACCOUNT (or GOOGLE_APPLICATION_CREDENTIALS) is set in Render environment variables.');
  }
}

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, '0.0.0.0', () => {
    logStartupInfo();

    // Asynchronous database health probe after socket binding
    cloudPersistence.checkHealth().then(health => {
      if (health.healthy && health.database === 'firestore') {
        console.log(`[StandaloneServer] ✅ Cloud Firestore verified (latency: ${health.latencyMs}ms)`);
      } else if (!health.healthy) {
        console.warn(`[StandaloneServer] ⚠️ Persistence health warning: ${health.error || 'Unavailable'}`);
      }
    });
  });

  const handleShutdown = (signal: string) => {
    console.log(`\n[StandaloneServer] Received ${signal}. Gracefully closing server...`);
    server.close(() => {
      console.log('[StandaloneServer] Server closed successfully.');
      process.exit(0);
    });
    // Force close after 5s timeout
    setTimeout(() => {
      console.warn('[StandaloneServer] Force exit timed out.');
      process.exit(1);
    }, 5000).unref();
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

export { server };
export default server;
