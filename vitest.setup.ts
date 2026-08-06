import { vi } from 'vitest'

const storageMap = new Map<string, string>()

vi.stubGlobal('localStorage', {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => { storageMap.set(key, value) },
  removeItem: (key: string) => { storageMap.delete(key) },
  clear: () => storageMap.clear(),
  get length() { return storageMap.size },
  key: (index: number) => [...storageMap.keys()][index] ?? null,
})

// Zustand persist stores use IndexedDB (idb-keyval), which doesn't exist in
// jsdom. Without this, every store write rejects with "indexedDB is not
// defined" as an unhandled rejection and fails the suite. Store logic is
// tested directly; persistence is exercised by the browser E2E specs instead.
vi.mock('idb-keyval', () => ({
  get: vi.fn(async () => null),
  set: vi.fn(async () => {}),
  del: vi.fn(async () => {}),
  createStore: vi.fn(() => ({})),
}))
