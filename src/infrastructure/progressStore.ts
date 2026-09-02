/**
 * Shared in-memory progress store for long-running VPS tasks.
 * Separated from getProgress.ts (a "use server" file) so that VPS API routes
 * can import it directly — "use server" modules can only export async functions.
 */

export interface ProgressState {
  step?: string;
  streamingText?: string;
  personaName?: string;
  completedResponses?: number;
  totalResponses?: number;
  completedCount?: number;
  totalCount?: number;
  error?: string;
  hasCompleted?: boolean;
}

// Store on globalThis to survive Next.js HMR (dev mode), which resets module-level
// variables when files change. The running IIFE writes to the original Map, and
// polling reads from it — if they become different objects, progress is lost.
const KEY = '__kynd_progress_map';
const progressMap: Map<string, ProgressState> =
  (globalThis as any)[KEY] ?? ((globalThis as any)[KEY] = new Map());

export { progressMap };
