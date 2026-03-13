import { describe, it, expect } from 'vitest'
import {
  haversineM,
  downsampleRoute,
  minDistToRouteKm,
  routeBBox,
  type LatLon,
} from '../src/geo.ts'

describe('haversineM', () => {
  it('returns 0 for identical points', () => {
    expect(haversineM([51.5, -0.1], [51.5, -0.1])).toBe(0)
  })

  it('returns ~111km for 1 degree latitude difference', () => {
    const d = haversineM([51.0, 0.0], [52.0, 0.0])
    expect(d).toBeGreaterThan(110_000)
    expect(d).toBeLessThan(112_000)
  })

  it('returns ~111km for 1 degree longitude at equator', () => {
    const d = haversineM([0.0, 0.0], [0.0, 1.0])
    expect(d).toBeGreaterThan(110_000)
    expect(d).toBeLessThan(112_000)
  })

  it('is approximately symmetric', () => {
    const a: LatLon = [51.5, -0.1]
    const b: LatLon = [53.5, -2.2]
    expect(haversineM(a, b)).toBeCloseTo(haversineM(b, a), 0)
  })
})

describe('downsampleRoute', () => {
  it('returns route unchanged when shorter than targetCount', () => {
    const coords: LatLon[] = [
      [1, 2],
      [3, 4],
      [5, 6],
    ]
    expect(downsampleRoute(coords, 10)).toEqual(coords)
  })

  it('returns at most targetCount + 1 points (last point appended)', () => {
    const coords: LatLon[] = Array.from({ length: 1000 }, (_, i) => [i * 0.001, 0] as LatLon)
    const result = downsampleRoute(coords, 100)
    expect(result.length).toBeLessThanOrEqual(102) // step-based, last point added
  })

  it('always preserves the last point', () => {
    const coords: LatLon[] = Array.from({ length: 500 }, (_, i) => [i * 0.001, 0] as LatLon)
    const result = downsampleRoute(coords, 50)
    expect(result[result.length - 1]).toEqual(coords[coords.length - 1])
  })
})

describe('minDistToRouteKm', () => {
  it('returns 0 when the point is on the route', () => {
    const route: LatLon[] = [
      [51.0, 0.0],
      [52.0, 0.0],
      [53.0, 0.0],
    ]
    expect(minDistToRouteKm([52.0, 0.0], route)).toBe(0)
  })

  it('returns ~111km for a point 1 degree off-route', () => {
    const route: LatLon[] = [
      [51.0, 0.0],
      [52.0, 0.0],
    ]
    const dist = minDistToRouteKm([51.0, 1.0], route)
    // at 51°N, 1° longitude ≈ ~70km; 1° latitude ≈ 111km; closest is (51,0) => ~70km
    expect(dist).toBeGreaterThan(60)
    expect(dist).toBeLessThan(80)
  })
})

describe('routeBBox', () => {
  it('adds padding symmetrically', () => {
    const coords: LatLon[] = [
      [50.0, -1.0],
      [52.0, 1.0],
    ]
    const bbox = routeBBox(coords, 0)
    expect(bbox.south).toBeCloseTo(50.0, 5)
    expect(bbox.north).toBeCloseTo(52.0, 5)
    expect(bbox.west).toBeCloseTo(-1.0, 5)
    expect(bbox.east).toBeCloseTo(1.0, 5)
  })

  it('expands bbox by padKm/111 degrees on each side', () => {
    const coords: LatLon[] = [
      [51.0, -1.0],
      [51.0, -1.0],
    ]
    const bbox = routeBBox(coords, 111) // exactly 1 degree padding
    expect(bbox.south).toBeCloseTo(50.0, 4)
    expect(bbox.north).toBeCloseTo(52.0, 4)
    expect(bbox.west).toBeCloseTo(-2.0, 4)
    expect(bbox.east).toBeCloseTo(0.0, 4)
  })
})
