import { describe, it, expect, vi } from 'vitest'
import { geocode, getRoute } from '../src/routing.ts'

describe('geocode', () => {
  it('returns [lat, lon] for a successful result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => [{ lat: '51.5074', lon: '-0.1278' }],
      }),
    )

    const result = await geocode('London')
    expect(result[0]).toBeCloseTo(51.5074)
    expect(result[1]).toBeCloseTo(-0.1278)

    vi.unstubAllGlobals()
  })

  it('throws when no results are returned', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => [],
      }),
    )

    await expect(geocode('Nonexistent Place XYZ')).rejects.toThrow('Cannot find')

    vi.unstubAllGlobals()
  })

  it('skips network call for "lat,lon" string', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await geocode('51.5074,-0.1278')
    expect(result[0]).toBeCloseTo(51.5074)
    expect(result[1]).toBeCloseTo(-0.1278)
    expect(fetchSpy).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
  })
})

describe('getRoute', () => {
  it('returns coords and a single legEndIndex for two waypoints', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          code: 'Ok',
          routes: [
            {
              geometry: {
                coordinates: [
                  [-0.4152, 51.878],
                  [-1.0, 52.0],
                  [-5.084, 50.413],
                ],
              },
              legs: [{ distance: 500000, duration: 18720 }],
            },
          ],
        }),
      }),
    )

    const result = await getRoute([
      [51.878, -0.4152],
      [50.413, -5.084],
    ])
    expect(result.coords).toHaveLength(3)
    // OSRM returns [lon, lat] — getRoute should swap to [lat, lon]
    expect(result.coords[0][0]).toBeCloseTo(51.878)
    expect(result.coords[0][1]).toBeCloseTo(-0.4152)
    // Single leg: legEndIndices has one entry pointing to last coord
    expect(result.legEndIndices).toHaveLength(1)
    expect(result.legEndIndices[0]).toBe(2)

    vi.unstubAllGlobals()
  })

  it('throws when OSRM returns a non-Ok code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ code: 'NoRoute', routes: [] }),
      }),
    )

    await expect(
      getRoute([
        [51.0, 0.0],
        [52.0, 0.0],
      ]),
    ).rejects.toThrow('Routing failed')

    vi.unstubAllGlobals()
  })

  it('splits leg end indices correctly for three waypoints', async () => {
    // 5 coords: first leg ends around index 2, second leg ends at index 4
    // Coords roughly 1 degree apart in latitude (~111km each step)
    // leg[0].distance ≈ haversine([0,0]→[0,2]) ≈ 222km = 222000m
    // leg[1].distance ≈ haversine([0,2]→[0,4]) ≈ 222km = 222000m
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          code: 'Ok',
          routes: [
            {
              geometry: {
                coordinates: [
                  [0, 0],
                  [0, 1],
                  [0, 2],
                  [0, 3],
                  [0, 4],
                ],
              },
              // Approximate leg distances for 2 degrees lat each
              legs: [
                { distance: 222000, duration: 8000 },
                { distance: 222000, duration: 8000 },
              ],
            },
          ],
        }),
      }),
    )

    const result = await getRoute([
      [0, 0],
      [2, 0],
      [4, 0],
    ])

    expect(result.coords).toHaveLength(5)
    expect(result.legEndIndices).toHaveLength(2)
    // Last leg always ends at the final coord
    expect(result.legEndIndices[1]).toBe(4)
    // First leg ends somewhere before the last coord
    expect(result.legEndIndices[0]).toBeGreaterThan(0)
    expect(result.legEndIndices[0]).toBeLessThan(4)

    vi.unstubAllGlobals()
  })

  it('builds OSRM URL with all waypoints', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      json: async () => ({
        code: 'Ok',
        routes: [
          {
            geometry: {
              coordinates: [
                [0, 0],
                [1, 1],
                [2, 2],
              ],
            },
            legs: [
              { distance: 100000, duration: 3600 },
              { distance: 100000, duration: 3600 },
            ],
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    await getRoute([
      [0, 0],
      [1, 1],
      [2, 2],
    ])

    const calledUrl = fetchSpy.mock.calls[0][0] as string
    // All three waypoints should appear in the URL as lon,lat;lon,lat;lon,lat
    expect(calledUrl).toContain('0,0;1,1;2,2')

    vi.unstubAllGlobals()
  })
})
