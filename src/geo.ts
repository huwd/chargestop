/** Geographic utilities: distance, route sampling, bounding box. */

export type LatLon = [number, number]

/**
 * Haversine distance between two [lat, lon] points, in metres.
 */
export function haversineM(a: LatLon, b: LatLon): number {
  const R = 6_371_000
  const dLat = ((b[0] - a[0]) * Math.PI) / 180
  const dLon = ((b[1] - a[1]) * Math.PI) / 180
  const s1 = Math.sin(dLat / 2)
  const s2 = Math.sin(dLon / 2)
  const ac = s1 * s1 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * s2 * s2
  return R * 2 * Math.atan2(Math.sqrt(ac), Math.sqrt(1 - ac))
}

/**
 * Downsample a route to at most `targetCount` points, preserving start and end.
 */
export function downsampleRoute(coords: LatLon[], targetCount = 300): LatLon[] {
  if (coords.length <= targetCount) return coords
  const step = Math.floor(coords.length / targetCount)
  const out: LatLon[] = []
  for (let i = 0; i < coords.length; i += step) out.push(coords[i])
  const last = coords[coords.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

/**
 * Minimum distance (km) from `point` to any point in a sampled route.
 */
export function minDistToRouteKm(point: LatLon, sampled: LatLon[]): number {
  let min = Infinity
  for (const p of sampled) {
    const d = haversineM(point, p)
    if (d < min) min = d
  }
  return min / 1000
}

export interface BBox {
  south: number
  west: number
  north: number
  east: number
}

/**
 * Compute a bounding box from route coords with a padding of `padKm` kilometres.
 */
export function routeBBox(coords: LatLon[], padKm: number): BBox {
  const degPad = padKm / 111
  const lats = coords.map((c) => c[0])
  const lons = coords.map((c) => c[1])
  return {
    south: Math.min(...lats) - degPad,
    north: Math.max(...lats) + degPad,
    west: Math.min(...lons) - degPad,
    east: Math.max(...lons) + degPad,
  }
}
