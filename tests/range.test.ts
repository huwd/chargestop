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
  routeProjectionKm,
  planChargingStops,
} from '../src/range.ts'
import type { OsmElement } from '../src/filters.ts'
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

// ─── routeProjectionKm ────────────────────────────────────────────────────────

// North-south route: 4 points, each ~111km apart
// 51→52→53→54 °N along the prime meridian
describe('routeProjectionKm', () => {
  it('projects a point exactly on the route to its cumulative distance', () => {
    const cum = cumulativeDistancesKm(ROUTE)
    // ROUTE[1] = [52, 0] is exactly on the route
    const d = routeProjectionKm(ROUTE[1], ROUTE, cum)
    expect(d).toBeCloseTo(cum[1], 0)
  })

  it('projects a point beside the first segment to somewhere in that segment', () => {
    const cum = cumulativeDistancesKm(ROUTE)
    // Point beside midpoint of first segment
    const midLat = 51.5
    const pt: LatLon = [midLat, 0.1] // slightly east of route
    const d = routeProjectionKm(pt, ROUTE, cum)
    // Should project to ~half of first segment distance
    expect(d).toBeGreaterThan(0)
    expect(d).toBeLessThan(cum[1])
  })

  it('projects a point past the end of the route to the route total length', () => {
    const cum = cumulativeDistancesKm(ROUTE)
    const pt: LatLon = [60.0, 0.0] // far north of route end
    const d = routeProjectionKm(pt, ROUTE, cum)
    expect(d).toBeCloseTo(cum[cum.length - 1], 0)
  })

  it('projects a point before the start to 0', () => {
    const cum = cumulativeDistancesKm(ROUTE)
    const pt: LatLon = [50.0, 0.0] // south of route start
    const d = routeProjectionKm(pt, ROUTE, cum)
    expect(d).toBeCloseTo(0, 0)
  })
})

// ─── planChargingStops ────────────────────────────────────────────────────────

function makeCharger(id: number, lat: number, lon: number): OsmElement {
  return {
    id,
    lat,
    lon,
    tags: {
      amenity: 'charging_station',
      'socket:type2_combo': '2',
    },
  }
}

// Simple 4-point N-S route ~333km total
// [51,0] → [52,0] → [53,0] → [54,0]
// CAR has 400km range, chargePercents default to 80% target

describe('planChargingStops', () => {
  it('returns empty stops when route is reachable without charging', () => {
    const cum = cumulativeDistancesKm(ROUTE)
    // 100% charge, 400km range, route ~333km — no stop needed
    const plan = planChargingStops(ROUTE, cum, [], CAR, 100)
    expect(plan.stops).toHaveLength(0)
  })

  it('picks the single required stop when route just exceeds range', () => {
    // Route ~333km; car 200km (min=0, target=100); charger at ~189km
    // From 0: picks charger at ~189km (< 200km range)
    // From 189km: 189+200=389 > 333 → destination reachable
    const shortCar: Vehicle = { ...CAR, wltpRangeKm: 200 }
    const chargers = [makeCharger(1, 52.7, 0.0)] // ~189km along ROUTE
    const cum = cumulativeDistancesKm(ROUTE)
    const plan = planChargingStops(ROUTE, cum, chargers, shortCar, 100, 0, 100)
    expect(plan.stops).toHaveLength(1)
    expect(plan.stops[0].charger.id).toBe(1)
  })

  it('picks the furthest charger when multiple are in range (greedy)', () => {
    // Car 200km (min=0, target=100); chargers at ~111km and ~189km — picks ~189km
    // From 189km: 189+200=389 > 333 → destination reachable in one stop
    const shortCar: Vehicle = { ...CAR, wltpRangeKm: 200 }
    const nearCharger = makeCharger(1, 52.0, 0.0) // ~111km
    const farCharger = makeCharger(2, 52.7, 0.0) // ~189km
    const cum = cumulativeDistancesKm(ROUTE)
    const plan = planChargingStops(ROUTE, cum, [nearCharger, farCharger], shortCar, 100, 0, 100)
    expect(plan.stops[0].charger.id).toBe(2)
  })

  it('returns two stops when route requires two charging sessions', () => {
    // 3-segment route ~333km; car range 180km; min=0, target=100%
    // Stop 1 at ~111km: reachable (111<180). From there, stop 2 at ~222km: reachable (222-111=111<180).
    // From 222km: 333-222=111 < 180 → destination reachable.
    const threeSegRoute: LatLon[] = [
      [51.0, 0.0],
      [52.0, 0.0],
      [53.0, 0.0],
      [54.0, 0.0],
    ]
    const shortCar: Vehicle = { ...CAR, wltpRangeKm: 180 }
    const chargers = [makeCharger(1, 52.0, 0.0), makeCharger(2, 53.0, 0.0)]
    const cum = cumulativeDistancesKm(threeSegRoute)
    const plan = planChargingStops(threeSegRoute, cum, chargers, shortCar, 100, 0, 100)
    expect(plan.stops).toHaveLength(2)
    expect(plan.stops[0].charger.id).toBe(1)
    expect(plan.stops[1].charger.id).toBe(2)
  })

  it('throws when no charger can bridge the gap', () => {
    const shortCar: Vehicle = { ...CAR, wltpRangeKm: 50 } // range too short
    const cum = cumulativeDistancesKm(ROUTE)
    expect(() => planChargingStops(ROUTE, cum, [], shortCar, 100)).toThrow()
  })

  it('respects minChargePercent as a buffer', () => {
    // Car range 400km, but with 10% min buffer, usable range = 360km
    // Route ~333km — should still be reachable
    const cum = cumulativeDistancesKm(ROUTE)
    const plan = planChargingStops(ROUTE, cum, [], CAR, 100, 10)
    expect(plan.stops).toHaveLength(0)
  })

  it('returns correct arrivalSocPercent for the stop', () => {
    // Two-segment route ~222km; charger at ~111km (midpoint)
    const twoSegRoute: LatLon[] = [
      [51.0, 0.0],
      [52.0, 0.0],
      [53.0, 0.0],
    ]
    const shortCar: Vehicle = { ...CAR, wltpRangeKm: 200 }
    const charger = makeCharger(1, 52.0, 0.0) // ~111km along route
    const cum = cumulativeDistancesKm(twoSegRoute)
    const plan = planChargingStops(twoSegRoute, cum, [charger], shortCar, 100)
    const stop = plan.stops[0]
    // Arrival SoC: started at 100%, travelled ~111km on 200km range → ~44.5% remaining
    expect(stop.arrivalSocPercent).toBeGreaterThan(40)
    expect(stop.arrivalSocPercent).toBeLessThan(60)
  })

  it('returns departureSocPercent equal to targetChargePercent', () => {
    // Two-segment route ~222km; charger at ~111km; 200km car charges to 80%
    // Usable from stop: 200*(80-10)/100 = 140km; 111+140=251 > 222 — reachable
    const twoSegRoute: LatLon[] = [
      [51.0, 0.0],
      [52.0, 0.0],
      [53.0, 0.0],
    ]
    const shortCar: Vehicle = { ...CAR, wltpRangeKm: 200 }
    const charger = makeCharger(1, 52.0, 0.0)
    const cum = cumulativeDistancesKm(twoSegRoute)
    const plan = planChargingStops(twoSegRoute, cum, [charger], shortCar, 100, 10, 80)
    expect(plan.stops[0].departureSocPercent).toBe(80)
  })
})
