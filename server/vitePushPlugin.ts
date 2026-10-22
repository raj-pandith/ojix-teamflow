import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import { handleApiRequest, broadcastRealtimeEvent, SERVER_BOOT_ID, SERVER_BOOT_TIME } from './apiRouter';

export { broadcastRealtimeEvent, SERVER_BOOT_ID, SERVER_BOOT_TIME };

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
    try {
      const handled = await handleApiRequest(req, res);
      if (handled) return;
    } catch (err) {
      console.error('[ViteDevServer Middleware] API error:', err);
    }
    next();
  });
}
