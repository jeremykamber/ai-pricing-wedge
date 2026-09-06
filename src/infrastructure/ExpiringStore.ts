/**
 * Generic in-memory store with automatic TTL-based cleanup.
 *
 * Survives Next.js HMR via globalThis keys — the running IIFE writes to the
 * original Map, and polling reads from it; without this, hot reload wipes
 * the in-memory data while the old instance still owns it.
 *
 * Extracted from AnalysisResultStore and PersonaGenerationStore to eliminate
 * duplicated cleanup/storage logic (Ousterhout red flag: Repetition).
 */

const CLEANUP_MS = 30 * 60 * 1000; // 30 minutes

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
const globalMaps: Record<string, Map<unknown, unknown>> = (globalThis as Record<string, unknown>).__kynd_global_maps as Record<string, Map<unknown, unknown>>
  ?? ((globalThis as Record<string, unknown>).__kynd_global_maps = {} as Record<string, Map<unknown, unknown>>);

function getGlobalMap<K, V>(key: string): Map<K, V> {
  if (!globalMaps[key]) globalMaps[key] = new Map();
  return globalMaps[key] as Map<K, V>;
}

export class ExpiringStore<V> {
  private data: Map<string, V>;
  private timers: Map<string, ReturnType<typeof setTimeout>>;

  constructor(
    private readonly dataKey: string,
    private readonly timerKey: string,
  ) {
    this.data = getGlobalMap<string, V>(dataKey);
    this.timers = getGlobalMap<string, ReturnType<typeof setTimeout>>(timerKey);
  }

  get(key: string): V | undefined {
    return this.data.get(key);
  }

  set(key: string, value: V): void {
    this.data.set(key, value);
    this.scheduleCleanup(key);
  }

  delete(key: string): void {
    this.data.delete(key);
    const timer = this.timers.get(key);
    clearTimeout(timer);
    this.timers.delete(key);
  }

  private scheduleCleanup(key: string): void {
    const existing = this.timers.get(key);
    clearTimeout(existing);
    this.timers.set(key, setTimeout(() => this.delete(key), CLEANUP_MS));
  }
}
