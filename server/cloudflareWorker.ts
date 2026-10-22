export interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
}

const BACKEND_URL = 'https://ojix-teamflow.onrender.com';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Forward API and health check requests directly to Render backend
    if (
      url.pathname.startsWith('/api/') ||
      url.pathname === '/health' ||
      url.pathname === '/ready'
    ) {
      const targetUrl = new URL(url.pathname + url.search, BACKEND_URL);
      const newHeaders = new Headers(request.headers);
      newHeaders.set('host', targetUrl.host);

      // Handle OPTIONS preflight if needed, or pass through
      const newRequest = new Request(targetUrl.toString(), {
        method: request.method,
        headers: newHeaders,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
        redirect: 'follow',
      });

      return fetch(newRequest);
    }

    // Serve static frontend assets from ./dist
    return env.ASSETS.fetch(request);
  },
};
