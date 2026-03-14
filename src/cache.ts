/** localStorage cache for Overpass query results. TTL + 2 MB LRU eviction. */

const CACHE_PREFIX = 'chargestop_ov1_'
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

interface CacheEntry<T> {
  data: T
  cachedAt: number
}

/** djb2 hash — fast, no dependencies, good enough for cache key collision avoidance. */
function hashKey(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function storageKey(key: string): string {
  return CACHE_PREFIX + hashKey(key)
}

function allCacheKeys(store: Storage): string[] {
  const keys: string[] = []
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i)
    if (k?.startsWith(CACHE_PREFIX)) keys.push(k)
  }
  return keys
}

/** Total bytes used by all cache entries. */
export function cacheSize(store: Storage = localStorage): number {
  try {
    return allCacheKeys(store).reduce((sum, k) => sum + (store.getItem(k)?.length ?? 0) * 2, 0)
  } catch {
    return 0
  }
}

/** Evict oldest entries until total cache is below MAX_BYTES. */
function evictOldest(store: Storage): void {
  const entries: { k: string; cachedAt: number; bytes: number }[] = []
  for (const k of allCacheKeys(store)) {
    try {
      const raw = store.getItem(k)
      if (!raw) continue
      const parsed = JSON.parse(raw) as CacheEntry<unknown>
      entries.push({ k, cachedAt: parsed.cachedAt, bytes: raw.length * 2 })
    } catch {
      // corrupted — remove it
      try {
        store.removeItem(k)
      } catch {
        // corrupted entry, removal failed — skip
      }
    }
  }
  entries.sort((a, b) => a.cachedAt - b.cachedAt) // oldest first
  let total = entries.reduce((s, e) => s + e.bytes, 0)
  for (const entry of entries) {
    if (total <= MAX_BYTES) break
    try {
      store.removeItem(entry.k)
      total -= entry.bytes
    } catch {
      // removal failed — skip
    }
  }
}

export function getCached<T>(key: string, ttlMs: number, store: Storage = localStorage): T | null {
  try {
    const raw = store.getItem(storageKey(key))
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry<T>
    if (Date.now() - entry.cachedAt >= ttlMs) {
      try {
        store.removeItem(storageKey(key))
      } catch {
        // removal failed — safe to ignore
      }
      return null
    }
    return entry.data
  } catch {
    return null
  }
}

export function setCached<T>(key: string, data: T, store: Storage = localStorage): void {
  const entry: CacheEntry<T> = { data, cachedAt: Date.now() }
  const raw = JSON.stringify(entry)
  try {
    if (cacheSize(store) + raw.length * 2 > MAX_BYTES) evictOldest(store)
    store.setItem(storageKey(key), raw)
  } catch {
    // quota exceeded or storage unavailable — fail silently
  }
}

export function clearCache(store: Storage = localStorage): void {
  for (const k of allCacheKeys(store)) {
    try {
      store.removeItem(k)
    } catch {
      // storage unavailable — skip
    }
  }
}
