import { describe, it, expect } from 'vitest'
import {
  effectiveRangeKm,
  cumulativeDistancesKm,
  pointAtDistanceKm,
  chargeColor,
  coloredRouteSegments,
  computeTerminator,
} from '../src/range.ts'
import type { LatLon } from '../src/geo.ts'
import type { Vehicle } from '../src/data/vehicles.ts'

const CAR: Vehicle = {
  id: 'test-car',
  make: 'Test',
  model: 'Car',
  variant: 'Standard',
  year: 2023,
  wltpRangeKm: 400,
  batteryKwh: 60,
  chargePortType: 'CCS',
  maxChargeKw: 150,
}

// Simple north-south route, each segment ~111km (1 degree latitude)
const ROUTE: LatLon[] = [
  [51.0, 0.0],
  [52.0, 0.0],
  [53.0, 0.0],
  [54.0, 0.0],
]

describe('effectiveRangeKm', () => {
  it('returns full WLTP range at 100%', () => {
    expect(effectiveRangeKm(CAR, 100)).toBeCloseTo(400, 0)
  })

  it('returns half WLTP range at 50%', () => {
    expect(effectiveRangeKm(CAR, 50)).toBeCloseTo(200, 0)
  })

  it('returns 0 at 0%', () => {
    expect(effectiveRangeKm(CAR, 0)).toBe(0)
  })
})

describe('cumulativeDistancesKm', () => {
  it('first value is always 0', () => {
    expect(cumulativeDistancesKm(ROUTE)[0]).toBe(0)
  })

  it('is monotonically increasing', () => {
    const d = cumulativeDistancesKm(ROUTE)
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThan(d[i - 1])
  })

  it('has same length as input coords', () => {
    expect(cumulativeDistancesKm(ROUTE)).toHaveLength(ROUTE.length)
  })

  it('total is approximately 333km for 3-degree route', () => {
    const total = cumulativeDistancesKm(ROUTE).at(-1)!
    expect(total).toBeGreaterThan(320)
    expect(total).toBeLessThan(340)
  })
})

describe('pointAtDistanceKm', () => {
  it('returns null when target exceeds route length', () => {
    const cum = cumulativeDistancesKm(ROUTE)
    expect(pointAtDistanceKm(ROUTE, cum, 999)).toBeNull()
  })

  it('returns a point near the first waypoint at ~111km', () => {
    const cum = cumulativeDistancesKm(ROUTE)
    const pt = pointAtDistanceKm(ROUTE, cum, 111)
    expect(pt).not.toBeNull()
    expect(pt![0]).toBeGreaterThan(51.5)
    expect(pt![0]).toBeLessThan(52.5)
  })

  it('interpolates between waypoints', () => {
    const cum = cumulativeDistancesKm(ROUTE)
    const halfFirst = cum[1] / 2
    const pt = pointAtDistanceKm(ROUTE, cum, halfFirst)
    expect(pt![0]).toBeGreaterThan(51.0)
    expect(pt![0]).toBeLessThan(52.0)
  })
})

describe('chargeColor', () => {
  it('returns green above 60%', () => {
    expect(chargeColor(1.0)).toBe('#5ecf8a')
    expect(chargeColor(0.61)).toBe('#5ecf8a')
  })

  it('returns amber between 30% and 60%', () => {
    expect(chargeColor(0.6)).toBe('#f0c040')
    expect(chargeColor(0.31)).toBe('#f0c040')
  })

  it('returns orange between 10% and 30%', () => {
    expect(chargeColor(0.3)).toBe('#f97316')
    expect(chargeColor(0.11)).toBe('#f97316')
  })

  it('returns red at 10% and below', () => {
    expect(chargeColor(0.1)).toBe('#ef4444')
    expect(chargeColor(0.0)).toBe('#ef4444')
  })
})

describe('coloredRouteSegments', () => {
  it('returns a single green segment when range far exceeds route', () => {
    const cum = cumulativeDistancesKm(ROUTE)
    const segs = coloredRouteSegments(ROUTE, cum, 9999)
    expect(segs.every((s) => s.color === '#5ecf8a')).toBe(true)
  })

  it('includes a grey segment beyond the range limit', () => {
    const cum = cumulativeDistancesKm(ROUTE)
    // Range of 150km means ~1.5 degrees covered, last segment is beyond range
    const segs = coloredRouteSegments(ROUTE, cum, 150)
    const colors = segs.map((s) => s.color)
    expect(colors).toContain('#4b5563')
  })

  it('all segment coords arrays have at least 2 points', () => {
    const cum = cumulativeDistancesKm(ROUTE)
    const segs = coloredRouteSegments(ROUTE, cum, 200)
    segs.forEach((s) => expect(s.coords.length).toBeGreaterThanOrEqual(2))
  })

  it('adjacent segments share a boundary point for continuity', () => {
    const cum = cumulativeDistancesKm(ROUTE)
    const segs = coloredRouteSegments(ROUTE, cum, 150)
    for (let i = 1; i < segs.length; i++) {
      const lastOfPrev = segs[i - 1].coords.at(-1)!
      const firstOfNext = segs[i].coords[0]
      expect(lastOfPrev).toEqual(firstOfNext)
    }
  })
})

describe('computeTerminator', () => {
  it('returns null when range exceeds route length', () => {
    const cum = cumulativeDistancesKm(ROUTE)
    expect(computeTerminator(ROUTE, cum, 9999)).toBeNull()
  })

  it('returns a terminator point within the route bounds', () => {
    const cum = cumulativeDistancesKm(ROUTE)
    const t = computeTerminator(ROUTE, cum, 150)
    expect(t).not.toBeNull()
    expect(t!.point[0]).toBeGreaterThan(51.0)
    expect(t!.point[0]).toBeLessThan(54.0)
  })

  it('returns two ends for the perpendicular line', () => {
    const cum = cumulativeDistancesKm(ROUTE)
    const t = computeTerminator(ROUTE, cum, 150)
    expect(t!.ends).toHaveLength(2)
    // Ends should be offset from the terminator point
    expect(t!.ends[0]).not.toEqual(t!.ends[1])
  })
})
