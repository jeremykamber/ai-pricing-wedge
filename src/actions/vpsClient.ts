/**
 * Shared VPS HTTP client for server actions.
 *
 * Every action that talks to the VPS backend duplicates the same boilerplate:
 * VPS_BACKEND_URL, Authorization header, JSON Content-Type, error handling.
 * This module owns that plumbing once. Each action provides only the endpoint
 * path and its request body — the client handles the rest.
 *
 * Ousterhout red flag addressed: Repetition (identical fetch boilerplate
 * across 8+ action files).
 */

import { VPS_BACKEND_URL, getVpsAuthToken } from "@/infrastructure/config";

export interface VpsResponse {
  ok: boolean;
  status: number;
  data: unknown;
  error?: string;
}

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getVpsAuthToken()}`,
  };
}

/**
 * POST JSON to a VPS endpoint. Returns the parsed response body on success,
 * or a VpsResponse with the error details on failure. Callers never need to
 * deal with fetch errors, non-2xx status codes, or response parsing.
 */
export async function vpsPost<T = unknown>(
  endpoint: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${VPS_BACKEND_URL}/api/vps/${endpoint}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => res.statusText);
    throw new Error(`VPS ${endpoint} failed (${res.status}): ${errBody}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Raw POST to a VPS endpoint. Returns the fetch Response so callers can
 * read the body as a stream (for SSE/chunked responses).
 */
export async function vpsFetchRaw(
  endpoint: string,
  body: unknown,
): Promise<Response> {
  return fetch(`${VPS_BACKEND_URL}/api/vps/${endpoint}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
}

/**
 * GET from a VPS endpoint. Used by polling actions (progress, results,
 * screenshots). Returns the parsed JSON body.
 */
export async function vpsGet<T = unknown>(
  endpoint: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${VPS_BACKEND_URL}/api/vps/${endpoint}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${getVpsAuthToken()}` },
  });

  if (!res.ok) {
    throw new Error(`VPS ${endpoint} failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}
