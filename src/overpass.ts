/** Overpass API client with multi-endpoint failover. */

import type { BBox } from './geo.ts'
import type { OsmElement } from './filters.ts'

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
]

export interface OverpassResponse {
  elements: OsmElement[]
}

export async function overpass(
  query: string,
  endpoints: string[] = OVERPASS_ENDPOINTS,
): Promise<OverpassResponse> {
  let lastErr: Error = new Error('No endpoints configured')
  for (const endpoint of endpoints) {
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status} from ${endpoint}`)
      const text = await r.text()
      if (text.trim().startsWith('<') && !text.includes('"elements"')) {
        throw new Error('Got HTML instead of JSON — server overloaded')
      }
      return JSON.parse(text) as OverpassResponse
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
      console.warn(`Overpass endpoint failed (${endpoint}):`, lastErr.message)
    }
  }
  throw new Error(`All Overpass endpoints failed. Last: ${lastErr.message}`)
}

export function buildChargerQuery(bbox: BBox): string {
  const { south, west, north, east } = bbox
  return `[out:json][timeout:40];
node["amenity"="charging_station"](${south},${west},${north},${east});
out body;`
}

export function buildFoodQuery(lat: number, lon: number, radiusM: number): string {
  return `[out:json][timeout:25];
(
  node["amenity"="cafe"](around:${radiusM},${lat},${lon});
  node["amenity"="restaurant"](around:${radiusM},${lat},${lon});
  node["amenity"="pub"](around:${radiusM},${lat},${lon});
  node["amenity"="bar"](around:${radiusM},${lat},${lon});
);
out body;`
}
