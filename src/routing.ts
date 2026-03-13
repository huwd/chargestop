/** Geocoding (Nominatim) and routing (OSRM). */

import type { LatLon } from './geo.ts'

export async function geocode(place: string): Promise<LatLon> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=1&countrycodes=gb`
  const r = await fetch(url, { headers: { 'User-Agent': 'ChargeStop/1.0' } })
  const d = (await r.json()) as Array<{ lat: string; lon: string }>
  if (!d.length) throw new Error(`Cannot find: ${place}`)
  return [parseFloat(d[0].lat), parseFloat(d[0].lon)]
}

export async function getRoute(from: LatLon, to: LatLon): Promise<LatLon[]> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`
  const r = await fetch(url)
  const d = (await r.json()) as {
    code: string
    routes: Array<{ geometry: { coordinates: Array<[number, number]> } }>
  }
  if (d.code !== 'Ok') throw new Error('Routing failed — OSRM error')
  return d.routes[0].geometry.coordinates.map((c) => [c[1], c[0]] as LatLon)
}
