/** Geocoding (Nominatim) and routing (OSRM). */

import { haversineM, type LatLon } from './geo.ts'

export interface RouteResult {
  coords: LatLon[]
  /** Index into coords of the last point in each leg (length === waypoints.length - 1). */
  legEndIndices: number[]
}

/** Regex for a bare "lat,lon" coordinate string — skips Nominatim lookup. */
const LAT_LON_RE = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/

export async function geocode(place: string): Promise<LatLon> {
  const match = LAT_LON_RE.exec(place.trim())
  if (match) return [parseFloat(match[1]), parseFloat(match[2])]

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=1&countrycodes=gb`
  const r = await fetch(url, { headers: { 'User-Agent': 'ChargeStop/1.0' } })
  const d = (await r.json()) as Array<{ lat: string; lon: string }>
  if (!d.length) throw new Error(`Cannot find: ${place}`)
  return [parseFloat(d[0].lat), parseFloat(d[0].lon)]
}

export async function getRoute(waypoints: LatLon[]): Promise<RouteResult> {
  const coordStr = waypoints.map((w) => `${w[1]},${w[0]}`).join(';')
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${coordStr}?overview=full&geometries=geojson`
  const r = await fetch(url)
  const d = (await r.json()) as {
    code: string
    routes: Array<{
      geometry: { coordinates: Array<[number, number]> }
      legs: Array<{ distance: number; duration: number }>
    }>
  }
  if (d.code !== 'Ok') throw new Error('Routing failed — OSRM error')

  const coords: LatLon[] = d.routes[0].geometry.coordinates.map((c) => [c[1], c[0]] as LatLon)
  const legs = d.routes[0].legs

  // Reconstruct where each leg ends within the flat coords array by walking
  // cumulative haversine distance and matching against OSRM leg distances.
  const legEndIndices: number[] = []
  let cumDist = 0
  let legIdx = 0
  let legTarget = legs[0].distance

  for (let i = 1; i < coords.length; i++) {
    cumDist += haversineM(coords[i - 1], coords[i])
    while (legIdx < legs.length - 1 && cumDist >= legTarget) {
      legEndIndices.push(i)
      legIdx++
      legTarget += legs[legIdx].distance
    }
  }
  // Final leg always ends at the last coord (handles float drift)
  legEndIndices.push(coords.length - 1)

  return { coords, legEndIndices }
}
