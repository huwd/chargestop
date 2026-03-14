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
})

describe('getRoute', () => {
  it('returns an array of [lat, lon] coords from the OSRM response', async () => {
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
              duration: 18720,
            },
          ],
        }),
      }),
    )

    const coords = await getRoute([51.878, -0.4152], [50.413, -5.084])
    expect(coords).toHaveLength(3)
    // OSRM returns [lon, lat] — getRoute should swap to [lat, lon]
    expect(coords[0][0]).toBeCloseTo(51.878)
    expect(coords[0][1]).toBeCloseTo(-0.4152)

    vi.unstubAllGlobals()
  })

  it('throws when OSRM returns a non-Ok code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ code: 'NoRoute', routes: [] }),
      }),
    )

    await expect(getRoute([51.0, 0.0], [52.0, 0.0])).rejects.toThrow('Routing failed')

    vi.unstubAllGlobals()
  })
})
