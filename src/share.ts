/** Pure URL-building functions for sharing and navigation app export. */

export function buildGoogleMapsUrl(from: string, to: string, vias: string[]): string {
  const params = new URLSearchParams({
    api: '1',
    origin: from,
    destination: to,
    travelmode: 'driving',
  })
  if (vias.length > 0) {
    params.set('waypoints', vias.join('|'))
  }
  return 'https://www.google.com/maps/dir/?' + params.toString()
}

export function buildAppleMapsUrl(from: string, to: string): string {
  const params = new URLSearchParams({ saddr: from, daddr: to, dirflg: 'd' })
  return 'https://maps.apple.com/?' + params.toString()
}

export function buildShareTitle(places: string[]): string {
  if (places.length < 2) return 'ChargeStop'
  return `ChargeStop: ${places[0]} → ${places[places.length - 1]}`
}
