import { describe, it, expect, vi, beforeEach } from 'vitest'
import { overpass, buildChargerQuery, buildFoodQuery } from '../src/overpass.ts'
import { setCached } from '../src/cache.ts'
import type { BBox } from '../src/geo.ts'

function makeMockStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => store.clear(),
    get length() {
      return store.size
    },
    key: (i: number) => [...store.keys()][i] ?? null,
  }
}

describe('buildChargerQuery', () => {
  it('includes the bounding box values', () => {
    const bbox: BBox = { south: 50.0, west: -5.0, north: 52.0, east: 0.0 }
    const q = buildChargerQuery(bbox)
    expect(q).toContain('50')
    expect(q).toContain('-5')
    expect(q).toContain('52')
    expect(q).toContain('charging_station')
  })

  it('adds CCS socket tag when portType is CCS', () => {
    const bbox: BBox = { south: 50.0, west: -5.0, north: 52.0, east: 0.0 }
    const q = buildChargerQuery(bbox, 'CCS')
    expect(q).toContain('socket:type2_combo')
  })

  it('adds CHAdeMO socket tag when portType is CHAdeMO', () => {
    const bbox: BBox = { south: 50.0, west: -5.0, north: 52.0, east: 0.0 }
    const q = buildChargerQuery(bbox, 'CHAdeMO')
    expect(q).toContain('socket:chademo')
  })

  it('queries both Tesla and CCS sockets for Tesla portType', () => {
    const bbox: BBox = { south: 50.0, west: -5.0, north: 52.0, east: 0.0 }
    const q = buildChargerQuery(bbox, 'Tesla')
    expect(q).toContain('socket:tesla_supercharger')
    expect(q).toContain('socket:type2_combo')
  })

  it('queries both CCS and CHAdeMO for CCS+CHAdeMO portType', () => {
    const bbox: BBox = { south: 50.0, west: -5.0, north: 52.0, east: 0.0 }
    const q = buildChargerQuery(bbox, 'CCS+CHAdeMO')
    expect(q).toContain('socket:type2_combo')
    expect(q).toContain('socket:chademo')
  })

  it('omits socket filter when no portType given', () => {
    const bbox: BBox = { south: 50.0, west: -5.0, north: 52.0, east: 0.0 }
    const q = buildChargerQuery(bbox)
    expect(q).not.toContain('socket:')
  })
})

describe('buildFoodQuery', () => {
  it('includes lat, lon and radius', () => {
    const q = buildFoodQuery(51.5, -0.1, 200)
    expect(q).toContain('51.5')
    expect(q).toContain('-0.1')
    expect(q).toContain('200')
    expect(q).toContain('"amenity"="cafe"')
    expect(q).toContain('"amenity"="pub"')
  })
})

describe('overpass() — caching', () => {
  let store: Storage

  beforeEach(() => {
    store = makeMockStorage()
    vi.unstubAllGlobals()
  })

  it('returns cached data without calling fetch', async () => {
    const cached = { elements: [{ id: 99, lat: 51.5, lon: -0.1, tags: {} }] }
    setCached('my-query', cached, store)
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    const result = await overpass('my-query', ['https://example.com'], { store })
    expect(result.elements[0].id).toBe(99)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('calls onRefresh with fresh data after a cache hit', async () => {
    const cached = { elements: [] }
    const fresh = { elements: [{ id: 42, lat: 51, lon: 0, tags: {} }] }
    setCached('my-query', cached, store)

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(fresh),
      }),
    )

    const refreshed: { elements: { id: number }[] }[] = []
    await overpass('my-query', ['https://example.com'], {
      store,
      onRefresh: (d) => refreshed.push(d as { elements: { id: number }[] }),
    })

    // onRefresh is async background — flush microtasks
    await new Promise((r) => setTimeout(r, 10))
    expect(refreshed).toHaveLength(1)
    expect(refreshed[0].elements[0].id).toBe(42)
  })

  it('fetches and caches when no cache entry exists', async () => {
    const data = { elements: [{ id: 7, lat: 52, lon: 1, tags: {} }] }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify(data) }),
    )

    const result = await overpass('cold-query', ['https://example.com'], { store })
    expect(result.elements[0].id).toBe(7)
    // Should now be in cache
    const { getCached } = await import('../src/cache.ts')
    expect(getCached('cold-query', 3600_000, store)).toEqual(data)
  })
})

describe('overpass()', () => {
  it('returns parsed JSON from the first successful endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ elements: [{ id: 1, lat: 51.5, lon: -0.1, tags: {} }] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await overpass('[out:json];node(1);out;', ['https://example.com/api'])
    expect(result.elements).toHaveLength(1)
    expect(mockFetch).toHaveBeenCalledOnce()

    vi.unstubAllGlobals()
  })

  it('falls over to second endpoint when first fails', async () => {
    let callCount = 0
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.reject(new Error('Connection refused'))
      return Promise.resolve({
        ok: true,
        text: async () => JSON.stringify({ elements: [] }),
      })
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await overpass('test', ['https://fail.example', 'https://ok.example'])
    expect(result.elements).toHaveLength(0)
    expect(mockFetch).toHaveBeenCalledTimes(2)

    vi.unstubAllGlobals()
  })

  it('throws when all endpoints fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    await expect(overpass('test', ['https://a.example', 'https://b.example'])).rejects.toThrow(
      'All Overpass endpoints failed',
    )

    vi.unstubAllGlobals()
  })

  it('throws when server returns HTML (overloaded)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '<html><body>Server too busy</body></html>',
      }),
    )

    await expect(overpass('test', ['https://x.example'])).rejects.toThrow(
      'All Overpass endpoints failed',
    )

    vi.unstubAllGlobals()
  })
})
