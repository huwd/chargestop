import { describe, it, expect } from 'vitest'
import { buildGoogleMapsUrl, buildAppleMapsUrl, buildShareTitle } from '../src/share.ts'

describe('buildGoogleMapsUrl', () => {
  it('builds a basic two-point URL', () => {
    const url = buildGoogleMapsUrl('London', 'Edinburgh', [])
    expect(url).toContain('google.com/maps')
    expect(url).toContain('origin=London')
    expect(url).toContain('destination=Edinburgh')
    expect(url).toContain('travelmode=driving')
    expect(url).not.toContain('waypoints')
  })

  it('includes a single via as waypoints param', () => {
    const url = buildGoogleMapsUrl('London', 'Edinburgh', ['Oxford'])
    expect(url).toContain('waypoints=Oxford')
  })

  it('pipe-separates multiple vias', () => {
    const url = buildGoogleMapsUrl('London', 'Edinburgh', ['Oxford', 'Birmingham'])
    expect(url).toContain('waypoints=Oxford%7CBirmingham')
  })

  it('URL-encodes place names with spaces', () => {
    const url = buildGoogleMapsUrl('Kings Cross', 'Waverley Station', [])
    expect(url).toContain('Kings+Cross')
    expect(url).toContain('Waverley+Station')
  })
})

describe('buildAppleMapsUrl', () => {
  it('builds a basic two-point URL', () => {
    const url = buildAppleMapsUrl('London', 'Edinburgh')
    expect(url).toContain('maps.apple.com')
    expect(url).toContain('saddr=London')
    expect(url).toContain('daddr=Edinburgh')
    expect(url).toContain('dirflg=d')
  })

  it('URL-encodes place names', () => {
    const url = buildAppleMapsUrl('Kings Cross', 'Waverley Station')
    expect(url).toContain('Kings+Cross')
    expect(url).toContain('Waverley+Station')
  })
})

describe('buildShareTitle', () => {
  it('builds a title from from and to', () => {
    expect(buildShareTitle(['London', 'Edinburgh'])).toBe('ChargeStop: London → Edinburgh')
  })

  it('uses the first and last place only', () => {
    expect(buildShareTitle(['London', 'Oxford', 'Edinburgh'])).toBe(
      'ChargeStop: London → Edinburgh',
    )
  })

  it('returns plain ChargeStop for fewer than two places', () => {
    expect(buildShareTitle([])).toBe('ChargeStop')
    expect(buildShareTitle(['London'])).toBe('ChargeStop')
  })
})
