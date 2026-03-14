/** Overpass API client with multi-endpoint failover and localStorage caching. */

import type { BBox } from './geo.ts'
import type { OsmElement } from './filters.ts'
import type { ChargePortType } from './data/vehicles.ts'
import { getCached, setCached } from './cache.ts'

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

export interface OverpassOptions {
  store?: Storage
  /** Called with fresh data after a stale-while-revalidate cache hit. */
  onRefresh?: (data: OverpassResponse) => void
}

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
]

export interface OverpassResponse {
  elements: OsmElement[]
}

async function fetchOverpass(query: string, endpoints: string[]): Promise<OverpassResponse> {
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

export async function overpass(
  query: string,
  endpoints: string[] = OVERPASS_ENDPOINTS,
  options: OverpassOptions = {},
): Promise<OverpassResponse> {
  const { store, onRefresh } = options
  const effectiveStore = store ?? (typeof localStorage !== 'undefined' ? localStorage : null)

  if (effectiveStore) {
    const cached = getCached<OverpassResponse>(query, CACHE_TTL_MS, effectiveStore)
    if (cached) {
      // Stale-while-revalidate: return cache immediately, refresh in background
      if (onRefresh) {
        void fetchOverpass(query, endpoints)
          .then((fresh) => {
            if (effectiveStore) setCached(query, fresh, effectiveStore)
            onRefresh(fresh)
          })
          .catch(() => {
            /* background refresh failure is silent */
          })
      }
      return cached
    }
  }

  const data = await fetchOverpass(query, endpoints)
  if (effectiveStore) setCached(query, data, effectiveStore)
  return data
}

const SOCKET_TAGS: Record<ChargePortType, string[]> = {
  CCS: ['socket:type2_combo'],
  CHAdeMO: ['socket:chademo'],
  Tesla: ['socket:tesla_supercharger', 'socket:type2_combo'],
  'CCS+CHAdeMO': ['socket:type2_combo', 'socket:chademo'],
}

export function buildChargerQuery(bbox: BBox, portType?: ChargePortType): string {
  const { south, west, north, east } = bbox
  const b = `${south},${west},${north},${east}`

  if (!portType) {
    return `[out:json][timeout:40];\nnode["amenity"="charging_station"](${b});\nout body;`
  }

  const tags = SOCKET_TAGS[portType]
  if (tags.length === 1) {
    return `[out:json][timeout:40];\nnode["amenity"="charging_station"]["${tags[0]}"](${b});\nout body;`
  }

  const nodes = tags.map((t) => `  node["amenity"="charging_station"]["${t}"](${b});`).join('\n')
  return `[out:json][timeout:40];\n(\n${nodes}\n);\nout body;`
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
