/** Range calculation and route charge-level visualisation. */

import { haversineM, bearingDeg, destinationPoint, type LatLon } from './geo.ts'
import type { Vehicle } from './data/vehicles.ts'

/** Usable range from current charge level. */
export function effectiveRangeKm(vehicle: Vehicle, chargePercent: number): number {
  return vehicle.wltpRangeKm * (chargePercent / 100)
}

/** Cumulative distances (km) at each route point. Result[0] is always 0. */
export function cumulativeDistancesKm(coords: LatLon[]): number[] {
  const out = [0]
  for (let i = 1; i < coords.length; i++) {
    out.push(out[i - 1] + haversineM(coords[i - 1], coords[i]) / 1000)
  }
  return out
}

/**
 * Interpolated point on the route at exactly `targetKm` cumulative distance.
 * Returns null if targetKm exceeds the route length.
 */
export function pointAtDistanceKm(
  coords: LatLon[],
  cumDistKm: number[],
  targetKm: number,
): LatLon | null {
  if (targetKm >= cumDistKm[cumDistKm.length - 1]) return null
  for (let i = 1; i < cumDistKm.length; i++) {
    if (cumDistKm[i] >= targetKm) {
      const t = (targetKm - cumDistKm[i - 1]) / (cumDistKm[i] - cumDistKm[i - 1])
      return [
        coords[i - 1][0] + t * (coords[i][0] - coords[i - 1][0]),
        coords[i - 1][1] + t * (coords[i][1] - coords[i - 1][1]),
      ]
    }
  }
  throw new Error('pointAtDistanceKm: no segment found — cumDistKm array is inconsistent')
}

/** Color representing a charge level ratio (0–1). */
export function chargeColor(remainingRatio: number): string {
  if (remainingRatio > 0.6) return '#5ecf8a' // green
  if (remainingRatio > 0.3) return '#f0c040' // amber
  if (remainingRatio > 0.1) return '#f97316' // orange
  return '#ef4444' // red
}

export interface RouteSegment {
  coords: LatLon[]
  color: string
}

/**
 * Splits the route into colored segments reflecting remaining charge.
 * Points beyond `rangeKm` are coloured grey (unreachable without charging).
 */
export function coloredRouteSegments(
  coords: LatLon[],
  cumDistKm: number[],
  rangeKm: number,
): RouteSegment[] {
  const segments: RouteSegment[] = []
  let current: LatLon[] = [coords[0]]
  let currentColor = chargeColor(1.0)

  for (let i = 1; i < coords.length; i++) {
    const dist = cumDistKm[i]
    const color = dist > rangeKm ? '#4b5563' : chargeColor(Math.max(0, 1 - dist / rangeKm))
    if (color !== currentColor) {
      current.push(coords[i])
      segments.push({ coords: current, color: currentColor })
      current = [coords[i]]
      currentColor = color
    } else {
      current.push(coords[i])
    }
  }
  if (current.length > 1) segments.push({ coords: current, color: currentColor })
  return segments
}

export interface TerminatorLine {
  point: LatLon
  ends: [LatLon, LatLon]
}

/**
 * Computes a perpendicular terminator line at the range limit point on the route.
 * Returns null if the range exceeds the route length.
 */
export function computeTerminator(
  coords: LatLon[],
  cumDistKm: number[],
  rangeKm: number,
): TerminatorLine | null {
  const point = pointAtDistanceKm(coords, cumDistKm, rangeKm)
  if (!point) return null

  // Find the route segment index nearest to the range limit
  let nearestIdx = 0
  let minDelta = Infinity
  for (let i = 0; i < cumDistKm.length; i++) {
    const delta = Math.abs(cumDistKm[i] - rangeKm)
    if (delta < minDelta) {
      minDelta = delta
      nearestIdx = i
    }
  }
  const prevIdx = Math.max(0, nearestIdx - 1)
  const nextIdx = Math.min(coords.length - 1, nearestIdx + 1)
  const brng = bearingDeg(coords[prevIdx], coords[nextIdx])
  const perp = (brng + 90) % 360

  return {
    point,
    ends: [destinationPoint(point, perp, 0.4), destinationPoint(point, (perp + 180) % 360, 0.4)],
  }
}
