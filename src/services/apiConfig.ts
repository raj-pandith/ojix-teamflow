/**
 * Centralized API configuration and safe HTTP client for OJIX TeamFlow
 * - In local development (VITE_API_URL empty): uses same-origin relative URLs (/api/...).
 * - In production: prepends the configured backend origin (e.g., https://api.ojix.dev).
 */

export function getEffectiveApiBase(): string {
  // If running in browser on localhost or 127.0.0.1, always use local relative URLs
  // so requests hit Vite dev server's built-in API proxy directly without CORS or timeout issues
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return '';
    }
  }
  return (import.meta.env.VITE_API_URL || 'https://ojix-teamflow.onrender.com').replace(/\/+$/, '');
}

export const API_BASE_URL = (import.meta.env.VITE_API_URL || 'https://ojix-teamflow.onrender.com').replace(/\/+$/, '');

export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = getEffectiveApiBase();
  return base ? `${base}${cleanPath}` : cleanPath;
}

export interface SafeFetchResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  isJson: boolean;
}

/**
 * Executes a fetch request and safely handles JSON vs non-JSON (e.g. HTML 404/fallback) responses,
 * preventing 'Unexpected end of JSON input' or 'Unexpected token <' parsing exceptions.
 */
export async function safeFetchJson<T = any>(
  path: string,
  init?: RequestInit
): Promise<SafeFetchResult<T>> {
  try {
    const url = apiUrl(path);
    const res = await fetch(url, init);
    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (!isJson) {
      return {
        ok: false,
        status: res.status,
        data: null,
        error: `Server returned non-JSON response (${contentType || 'empty'})`,
        isJson: false,
      };
    }

    const data = await res.json();
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? undefined : data?.error || `Request failed with status ${res.status}`,
      isJson: true,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network request failed';
    return {
      ok: false,
      status: 0,
      data: null,
      error: message,
      isJson: false,
    };
  }
}
