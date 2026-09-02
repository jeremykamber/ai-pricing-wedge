import { get, set, del } from 'idb-keyval'

/**
 * Zustand persist storage adapter backed by IndexedDB.
 *
 * IndexedDB has effectively unlimited storage (typically 50%+ of disk),
 * unlike localStorage which caps at ~5MB per origin. This is critical
 * for stores that hold large payloads like base64 screenshots.
 *
 * Usage:
 *   storage: createJSONStorage(() => indexedDBStorage)
 */
export const indexedDBStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const value = await get<string>(name)
    return value ?? null
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value)
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name)
  },
}
