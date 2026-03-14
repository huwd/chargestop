import { describe, it, expect } from 'vitest'
import {
  effectiveRangeKm,
  cumulativeDistancesKm,
  pointAtDistanceKm,
  chargeColor,
  coloredRouteSegments,
  computeTerminator,
  multiLegColoredSegments,
  computeMultiLegTerminator,
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

// Two-leg route: [51,0]→[52,0]→[53,0] is leg 0 (2 segments ~111km each),
// [53,0]→[54,0]→[55,0] is leg 1.
// legEndIndices = [2, 4] for a 5-point route.
const TWO_LEG_ROUTE: LatLon[] = [
  [51.0, 0.0],
  [52.0, 0.0],
  [53.0, 0.0],
  [54.0, 0.0],
  [55.0, 0.0],
]

describe('multiLegColoredSegments', () => {
  it('returns segments covering the whole route', () => {
    const cum = cumulativeDistancesKm(TWO_LEG_ROUTE)
    const segs = multiLegColoredSegments(TWO_LEG_ROUTE, cum, [2, 4], CAR, [100, 100])
    const allCoords = segs.flatMap((s) => s.coords)
    // First coord of first segment = first route point
    expect(allCoords[0]).toEqual(TWO_LEG_ROUTE[0])
    // Last coord of last segment = last route point
    expect(allCoords.at(-1)).toEqual(TWO_LEG_ROUTE.at(-1))
  })

  it('uses full range for each leg independently', () => {
    const cum = cumulativeDistancesKm(TWO_LEG_ROUTE)
    // Both legs start at 100% with a 400km car — no grey expected
    const segs = multiLegColoredSegments(TWO_LEG_ROUTE, cum, [2, 4], CAR, [100, 100])
    expect(segs.every((s) => s.color !== '#4b5563')).toBe(true)
  })

  it('shows grey on second leg when that leg exceeds range', () => {
    const shortRangeCar: Vehicle = { ...CAR, wltpRangeKm: 100 }
    const cum = cumulativeDistancesKm(TWO_LEG_ROUTE)
    // Leg 1 starts at 100% but is ~222km — grey expected on second leg
    const segs = multiLegColoredSegments(TWO_LEG_ROUTE, cum, [2, 4], shortRangeCar, [100, 100])
    expect(segs.some((s) => s.color === '#4b5563')).toBe(true)
  })

  it('falls back to single-leg behaviour when chargePercents has one entry', () => {
    const cum = cumulativeDistancesKm(TWO_LEG_ROUTE)
    const segs = multiLegColoredSegments(TWO_LEG_ROUTE, cum, [2, 4], CAR, [100])
    expect(segs.length).toBeGreaterThan(0)
  })
})

describe('computeMultiLegTerminator', () => {
  it('returns null when all legs fit within range', () => {
    const cum = cumulativeDistancesKm(TWO_LEG_ROUTE)
    const t = computeMultiLegTerminator(TWO_LEG_ROUTE, cum, [2, 4], CAR, [100, 100])
    expect(t).toBeNull()
  })

  it('returns terminator on first leg that exceeds range', () => {
    const shortRangeCar: Vehicle = { ...CAR, wltpRangeKm: 100 }
    const cum = cumulativeDistancesKm(TWO_LEG_ROUTE)
    // Leg 0 is ~222km, car range 100km — terminator should be within leg 0
    const t = computeMultiLegTerminator(TWO_LEG_ROUTE, cum, [2, 4], shortRangeCar, [100, 100])
    expect(t).not.toBeNull()
    // Terminator point must be in the lat range of leg 0 (51–53)
    expect(t!.point[0]).toBeGreaterThan(51.0)
    expect(t!.point[0]).toBeLessThan(53.0)
  })

  it('ignores earlier legs if only the second exceeds range', () => {
    // Leg 0 = 1 step (~111km), leg 1 = 3 steps (~333km), range = 150km
    const threeStepRoute: LatLon[] = [
      [51.0, 0.0],
      [52.0, 0.0], // leg 0 end
      [53.0, 0.0],
      [54.0, 0.0],
      [55.0, 0.0], // leg 1 end
    ]
    const shortRangeCar: Vehicle = { ...CAR, wltpRangeKm: 150 }
    const cum = cumulativeDistancesKm(threeStepRoute)
    const t = computeMultiLegTerminator(threeStepRoute, cum, [1, 4], shortRangeCar, [100, 100])
    expect(t).not.toBeNull()
    // Terminator should be on leg 1 (lat > 52)
    expect(t!.point[0]).toBeGreaterThan(52.0)
    expect(t!.point[0]).toBeLessThan(55.0)
  })
})
