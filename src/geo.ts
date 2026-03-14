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
 * Bearing in degrees (0–360) from point a to point b.
 */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const dLon = ((b[1] - a[1]) * Math.PI) / 180
  const lat1 = (a[0] * Math.PI) / 180
  const lat2 = (b[0] * Math.PI) / 180
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/**
 * Point at `distKm` from `origin` along `bearDeg`.
 */
export function destinationPoint(origin: LatLon, bearDeg: number, distKm: number): LatLon {
  const R = 6371
  const d = distKm / R
  const lat1 = (origin[0] * Math.PI) / 180
  const lon1 = (origin[1] * Math.PI) / 180
  const brng = (bearDeg * Math.PI) / 180
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng),
  )
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    )
  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI]
}

/**
 * Best index at which to insert `point` into `waypoints` to minimise the
 * added detour. Returns a value in [1, waypoints.length].
 *
 * For each consecutive segment (waypoints[i] → waypoints[i+1]) the marginal
 * detour of inserting `point` between them is:
 *   haversine(A, P) + haversine(P, B) − haversine(A, B)
 * The segment with the smallest marginal detour wins.
 */
export function findInsertPosition(waypoints: LatLon[], point: LatLon): number {
  if (waypoints.length <= 1) return 1
  let bestIdx = 1
  let bestDetour = Infinity
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]
    const b = waypoints[i + 1]
    const detour = haversineM(a, point) + haversineM(point, b) - haversineM(a, b)
    if (detour < bestDetour) {
      bestDetour = detour
      bestIdx = i + 1
    }
  }
  return bestIdx
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
