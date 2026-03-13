import { describe, it, expect, vi } from 'vitest'
import { overpass, buildChargerQuery, buildFoodQuery } from '../src/overpass.ts'
import type { BBox } from '../src/geo.ts'

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
