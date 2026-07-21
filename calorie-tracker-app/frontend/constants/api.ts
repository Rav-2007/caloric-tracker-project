/**
 * api.ts — single source of truth for the backend base URL and auth header.
 * Override per machine/network without a code edit:
 *   EXPO_PUBLIC_API_URL=http://<ip>:8000 EXPO_PUBLIC_API_KEY=<key> npx expo start
 */
// Use localhost as fallback for emulator/simulator development.
// For physical device testing, set EXPO_PUBLIC_API_URL to your machine's IP.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

const API_KEY = process.env.EXPO_PUBLIC_API_KEY ?? "";

/** Merges the shared X-API-Key header (when configured) with any extra headers. */
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return API_KEY ? { "X-API-Key": API_KEY, ...extra } : { ...(extra ?? {}) };
}

/** Thin fetch wrapper that prefixes API_URL and attaches the auth header. */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers as Record<string, string> | undefined) },
  });
}

/** Extracts a human-readable error message from a non-OK JSON error response. */
export async function readErrorDetail(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (body?.detail) return String(body.detail);
  } catch {
    /* non-JSON body */
  }
  return fallback;
}
