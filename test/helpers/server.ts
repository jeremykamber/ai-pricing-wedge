// Shared E2E helpers: server bootstrap, screenshot dir, common timeouts.
// Browser-based E2E tests (test/*.spec.ts) reuse this instead of each
// hardcoding their own server management.

import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

export const PORTS_TO_TRY = [3000, 3001, 3100, 3207];
export const SCREENSHOT_DIR = path.resolve(process.cwd(), '.sisyphus', 'evidence');
export const SERVER_TIMEOUT = 120_000; // 2 min
export const TEST_TIMEOUT = 60_000; // 1 min

/**
 * Browser specs run in parallel forks (vitest pool: forks), so each spec
 * should pass its own `preferredPort` to avoid two forks racing to spawn
 * (or killing each other's) dev server. If a dev server is already running
 * on any candidate port, both specs reuse it and neither owns it.
 */
export async function findOrStartServer(opts: { preferredPort?: number } = {}): Promise<{
  url: string;
  process: ChildProcess | null;
}> {
  const candidates = opts.preferredPort
    ? [...new Set([opts.preferredPort, ...PORTS_TO_TRY])]
    : PORTS_TO_TRY;

  // Reuse an already-running dev server if one is up (faster iteration).
  for (const port of candidates) {
    const url = `http://localhost:${port}`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        return { url, process: null };
      }
    } catch {
      // port not in use
    }
  }

  // No existing server — start one on the dedicated (preferred) port.
  const port = opts.preferredPort ?? PORTS_TO_TRY[PORTS_TO_TRY.length - 1];
  const url = `http://localhost:${port}`;
  const server = spawn('bun', ['run', 'next', 'dev', '-p', String(port)], {
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const serverOut: string[] = [];
  server.stdout?.on('data', (d: Buffer) => serverOut.push(d.toString()));
  server.stderr?.on('data', (d: Buffer) => serverOut.push(d.toString()));

  server.on('error', (err) => {
    console.error(`[E2E] Server process error:`, err.message);
  });

  server.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.warn(`[E2E] Server exited with code ${code}. Output:\n${serverOut.slice(-10).join('')}`);
    }
  });

  const start = Date.now();
  let lastError: string | null = null;
  while (Date.now() - start < SERVER_TIMEOUT) {
    try {
      const res = await fetch(url);
      if (res.ok) return { url, process: server };
      lastError = `status ${res.status}`;
    } catch (err) {
      lastError = (err as Error).message;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Server at ${url} not ready within ${SERVER_TIMEOUT}ms. Last error: ${lastError}`);
}

export async function ensureScreenshotDir(): Promise<void> {
  await fs.promises.mkdir(SCREENSHOT_DIR, { recursive: true });
}
