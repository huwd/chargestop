import { describe, it, expect, beforeEach } from 'vitest'
import { getCached, setCached, clearCache, cacheSize } from '../src/cache.ts'

/** Minimal in-memory Storage implementation for tests. */
function makeMockStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (k: string): string | null => store.get(k) ?? null,
    setItem: (k: string, v: string): void => {
      store.set(k, v)
    },
    removeItem: (k: string): void => {
      store.delete(k)
    },
    clear: (): void => {
      store.clear()
    },
    get length(): number {
      return store.size
    },
    key: (i: number): string | null => [...store.keys()][i] ?? null,
  }
}

describe('getCached', () => {
  let store: Storage

  beforeEach(() => {
    store = makeMockStorage()
  })

  it('returns null when nothing is cached', () => {
    expect(getCached('missing-key', 3600_000, store)).toBeNull()
  })

  it('returns data when within TTL', () => {
    setCached('q1', { elements: [] }, store)
    expect(getCached('q1', 3600_000, store)).toEqual({ elements: [] })
  })

  it('returns null when TTL is zero (immediately expired)', () => {
    setCached('q1', { elements: [] }, store)
    expect(getCached('q1', 0, store)).toBeNull()
  })

  it('removes the entry when it has expired', () => {
    setCached('q1', { elements: [] }, store)
    getCached('q1', 0, store) // expire it
    expect(store.getItem('chargestop_ov1_q1')).toBeNull()
  })

  it('returns null for corrupted JSON', () => {
    store.setItem('chargestop_ov1_bad', 'not-json')
    expect(getCached('bad', 3600_000, store)).toBeNull()
  })

  it('returns null when storage.getItem throws', () => {
    const throwing: Storage = {
      ...makeMockStorage(),
      getItem: () => {
        throw new Error('SecurityError')
      },
    }
    expect(getCached('q1', 3600_000, throwing)).toBeNull()
  })
})

describe('setCached', () => {
  let store: Storage

  beforeEach(() => {
    store = makeMockStorage()
  })

  it('stores data retrievable by getCached', () => {
    const data = { elements: [{ id: 1, lat: 51, lon: 0, tags: {} }] }
    setCached('mykey', data, store)
    expect(getCached('mykey', 3600_000, store)).toEqual(data)
  })

  it('overwrites an existing entry', () => {
    setCached('k', { elements: [] }, store)
    setCached('k', { elements: [{ id: 2, lat: 52, lon: 1, tags: {} }] }, store)
    const result = getCached<{ elements: { id: number }[] }>('k', 3600_000, store)
    expect(result?.elements[0].id).toBe(2)
  })

  it('does not throw when storage.setItem throws (quota exceeded)', () => {
    const full: Storage = {
      ...makeMockStorage(),
      setItem: () => {
        throw new DOMException('QuotaExceededError')
      },
    }
    expect(() => setCached('k', { elements: [] }, full)).not.toThrow()
  })

  it('evicts oldest entries when budget is exceeded', () => {
    // Fill with entries until eviction is triggered (MAX_BYTES = 2MB)
    // Use a key that would push over budget when added
    const bigData = { elements: [{ id: 1, lat: 0, lon: 0, tags: { x: 'a'.repeat(500_000) } }] }
    setCached('old1', bigData, store)
    setCached('old2', bigData, store)
    setCached('old3', bigData, store)
    setCached('old4', bigData, store)
    setCached('new', bigData, store)
    // After eviction, 'new' should be present
    expect(getCached('new', 3600_000, store)).not.toBeNull()
    // Some old entries should have been evicted to make room
    const remaining = ['old1', 'old2', 'old3', 'old4'].filter(
      (k) => getCached(k, 3600_000, store) !== null,
    ).length
    expect(remaining).toBeLessThan(4)
  })
})

describe('clearCache', () => {
  it('removes all cache entries', () => {
    const store = makeMockStorage()
    setCached('a', { elements: [] }, store)
    setCached('b', { elements: [] }, store)
    clearCache(store)
    expect(getCached('a', 3600_000, store)).toBeNull()
    expect(getCached('b', 3600_000, store)).toBeNull()
  })

  it('does not remove non-cache keys', () => {
    const store = makeMockStorage()
    store.setItem('other_app_key', 'keep-me')
    setCached('x', { elements: [] }, store)
    clearCache(store)
    expect(store.getItem('other_app_key')).toBe('keep-me')
  })

  it('does not throw when storage is unavailable', () => {
    const broken: Storage = {
      ...makeMockStorage(),
      removeItem: () => {
        throw new Error('unavailable')
      },
    }
    expect(() => clearCache(broken)).not.toThrow()
  })
})

describe('cacheSize', () => {
  it('returns 0 for empty cache', () => {
    expect(cacheSize(makeMockStorage())).toBe(0)
  })

  it('returns approximate byte count of stored entries', () => {
    const store = makeMockStorage()
    setCached('k', { elements: [] }, store)
    expect(cacheSize(store)).toBeGreaterThan(0)
  })
})
