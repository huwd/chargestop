import { describe, it, expect } from 'vitest'
import {
  CHAIN_NAMES,
  getChargerSockets,
  isFastCharger,
  isIndieFood,
  formatCuisine,
  type OsmElement,
  type OsmTags,
} from '../src/filters.ts'

function el(tags: OsmTags): OsmElement {
  return { id: 1, lat: 51.5, lon: -0.1, tags }
}

describe('CHAIN_NAMES regex', () => {
  const chains = [
    'Costa',
    'Costa Coffee',
    "McDonald's",
    'Starbucks',
    'Greggs',
    'KFC',
    "Nando's",
    'Pret a Manger',
    'Pret',
    'Wetherspoon',
    'J D Wetherspoon',
  ]

  it.each(chains)('filters chain: %s', (name) => {
    expect(CHAIN_NAMES.test(name)).toBe(true)
  })

  it('does not filter: The Mcgregor Arms (surname contains mc)', () => {
    expect(CHAIN_NAMES.test('The Mcgregor Arms')).toBe(false)
  })

  it('does not filter: The Old Bell', () => {
    expect(CHAIN_NAMES.test('The Old Bell')).toBe(false)
  })

  it('does not filter: Nero (short name, not caffe nero)', () => {
    expect(CHAIN_NAMES.test('Nero')).toBe(false)
  })

  it('does filter: Subway', () => {
    expect(CHAIN_NAMES.test('Subway')).toBe(true)
  })
})

describe('getChargerSockets', () => {
  it('returns empty array for unknown socket types', () => {
    expect(getChargerSockets({ 'socket:type2': '2' })).toEqual([])
  })

  it('returns CCS for type2_combo', () => {
    expect(getChargerSockets({ 'socket:type2_combo': '2' })).toEqual(['CCS'])
  })

  it('returns CHAdeMO', () => {
    expect(getChargerSockets({ 'socket:chademo': '1' })).toContain('CHAdeMO')
  })

  it('returns Tesla for supercharger', () => {
    expect(getChargerSockets({ 'socket:tesla_supercharger': '8' })).toContain('Tesla')
  })

  it('returns Tesla for tesla_ccs', () => {
    expect(getChargerSockets({ 'socket:tesla_ccs': '4' })).toContain('Tesla')
  })

  it('returns multiple socket types', () => {
    const sockets = getChargerSockets({
      'socket:type2_combo': '2',
      'socket:chademo': '1',
    })
    expect(sockets).toContain('CCS')
    expect(sockets).toContain('CHAdeMO')
    expect(sockets).toHaveLength(2)
  })
})

describe('isFastCharger', () => {
  it('returns true when CCS socket present', () => {
    expect(isFastCharger({ 'socket:type2_combo': '2' })).toBe(true)
  })

  it('returns true when maxpower >= 50', () => {
    expect(isFastCharger({ maxpower: '50' })).toBe(true)
    expect(isFastCharger({ maxpower: '150' })).toBe(true)
  })

  it('returns false when maxpower < 50 and no DC socket', () => {
    expect(isFastCharger({ maxpower: '22' })).toBe(false)
  })

  it('returns false for unknown tags', () => {
    expect(isFastCharger({})).toBe(false)
  })
})

describe('isIndieFood', () => {
  it('returns false when name is missing', () => {
    expect(isIndieFood(el({ amenity: 'cafe' }))).toBe(false)
  })

  it('returns false when brand tag is present', () => {
    expect(isIndieFood(el({ name: 'The Beanery', brand: 'Some Co' }))).toBe(false)
  })

  it('returns false when brand:wikidata is present', () => {
    expect(isIndieFood(el({ name: 'Café Test', 'brand:wikidata': 'Q12345' }))).toBe(false)
  })

  it('returns false for a known chain name', () => {
    expect(isIndieFood(el({ name: 'Costa Coffee' }))).toBe(false)
  })

  it('returns true for a genuinely indie venue', () => {
    expect(isIndieFood(el({ name: 'The Anchor', amenity: 'pub' }))).toBe(true)
  })

  it('returns true for indie café with cuisine tag', () => {
    expect(isIndieFood(el({ name: 'River Café', amenity: 'cafe', cuisine: 'coffee' }))).toBe(true)
  })
})

describe('formatCuisine', () => {
  it('returns empty string when no cuisine tag', () => {
    expect(formatCuisine({})).toBe('')
  })

  it('replaces underscores with spaces', () => {
    expect(formatCuisine({ cuisine: 'fish_and_chips' })).toBe('fish and chips')
  })

  it('replaces semicolons with ·', () => {
    expect(formatCuisine({ cuisine: 'pizza;pasta' })).toBe('pizza · pasta')
  })
})
