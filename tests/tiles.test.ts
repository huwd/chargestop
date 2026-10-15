import { describe, expect, it } from 'vitest'
import { tileUrl } from '../src/tiles'

describe('tileUrl', () => {
  it('uses the CARTO rastertiles endpoint with the key as a query param', () => {
    expect(tileUrl('abc123')).toBe(
      'https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=abc123',
    )
  })

  it('url-encodes the key', () => {
    expect(tileUrl('a b&c')).toContain('?key=a%20b%26c')
  })
})
