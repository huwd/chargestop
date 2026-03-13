/** Chain detection and charger classification. */

export interface OsmTags {
  name?: string
  brand?: string
  'brand:wikidata'?: string
  'brand:en'?: string
  amenity?: string
  cuisine?: string
  'socket:type2_combo'?: string
  'socket:chademo'?: string
  'socket:tesla_supercharger'?: string
  'socket:tesla_ccs'?: string
  maxpower?: string
  'charging_station:output'?: string
  network?: string
  operator?: string
  [key: string]: string | undefined
}

export interface OsmElement {
  id: number
  lat: number
  lon: number
  tags: OsmTags
}

/**
 * Known chain names. A place matching this regex is excluded.
 * The regex is intentionally conservative — it anchors on word boundaries
 * so "The Mcgregor Arms" is NOT filtered (only "McDonald's" etc. would be).
 */
export const CHAIN_NAMES =
  /\b(costa|starbucks|caffe nero|mcdonald|burger king|greggs|pret a manger|pret|subway|kfc|nando|wagamama|leon|itsu|wasabi|wetherspoon|tim horton|cafe rouge|harvester|toby carvery|beefeater|brewers fayre|old speckled hen|o'neills|slug and lettuce|revolution|bar \+ block|five guys|honest burger|shake shack|turtle bay|pizza express|pizza hut|domino|papa john)\b/i

export type SocketType = 'CCS' | 'CHAdeMO' | 'Tesla'

export function getChargerSockets(tags: OsmTags): SocketType[] {
  const sockets: SocketType[] = []
  if (tags['socket:type2_combo']) sockets.push('CCS')
  if (tags['socket:chademo']) sockets.push('CHAdeMO')
  if (tags['socket:tesla_supercharger'] ?? tags['socket:tesla_ccs']) sockets.push('Tesla')
  return sockets
}

export function isFastCharger(tags: OsmTags): boolean {
  if (getChargerSockets(tags).length > 0) return true
  const power = parseInt(tags['maxpower'] ?? tags['charging_station:output'] ?? '0', 10)
  return power >= 50
}

/**
 * Returns true if the element is an indie food venue (not a chain, has a name).
 */
export function isIndieFood(el: OsmElement): boolean {
  const tags = el.tags
  if (!tags.name) return false
  if (tags['brand'] ?? tags['brand:wikidata'] ?? tags['brand:en']) return false
  if (CHAIN_NAMES.test(tags.name)) return false
  return true
}

import type { ChargePortType } from './data/vehicles.ts'

/**
 * Returns true if the charger has at least one socket compatible with the vehicle's port type.
 * Tesla vehicles accept both Supercharger and CCS sockets (all UK Teslas support CCS at public chargers).
 */
export function matchesVehiclePort(charger: OsmElement, portType: ChargePortType): boolean {
  const sockets = getChargerSockets(charger.tags)
  switch (portType) {
    case 'CCS':
      return sockets.includes('CCS')
    case 'CHAdeMO':
      return sockets.includes('CHAdeMO')
    case 'Tesla':
      return sockets.includes('Tesla') || sockets.includes('CCS')
    case 'CCS+CHAdeMO':
      return sockets.includes('CCS') || sockets.includes('CHAdeMO')
  }
}

export function formatCuisine(tags: OsmTags): string {
  const c = tags.cuisine ?? ''
  return c ? c.replace(/_/g, ' ').replace(/;/g, ' · ') : ''
}
