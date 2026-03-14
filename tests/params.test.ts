import { describe, it, expect } from 'vitest'
import {
  sanitisePlace,
  parseNumericParam,
  parseUrlParams,
  buildUrlSearch,
  sanitiseVehicleId,
} from '../src/params.ts'

describe('sanitisePlace', () => {
  it('returns trimmed string for valid input', () => {
    expect(sanitisePlace('  Luton, UK  ')).toBe('Luton, UK')
  })

  it('returns null for empty string', () => {
    expect(sanitisePlace('')).toBeNull()
    expect(sanitisePlace('   ')).toBeNull()
  })

  it('returns null for strings over 100 chars', () => {
    expect(sanitisePlace('A'.repeat(101))).toBeNull()
    expect(sanitisePlace('A'.repeat(100))).toBe('A'.repeat(100))
  })

  it('returns null when string contains <', () => {
    expect(sanitisePlace('<script>alert(1)</script>')).toBeNull()
  })

  it('returns null when string contains >', () => {
    expect(sanitisePlace('foo > bar')).toBeNull()
  })

  it('returns null when string contains javascript:', () => {
    expect(sanitisePlace('javascript:alert(1)')).toBeNull()
    expect(sanitisePlace('JAVASCRIPT:void(0)')).toBeNull()
  })

  it('accepts place names with apostrophes, commas, hyphens, accents', () => {
    expect(sanitisePlace("King's Cross, London")).toBe("King's Cross, London")
    expect(sanitisePlace('Kraków')).toBe('Kraków')
    expect(sanitisePlace('Stoke-on-Trent')).toBe('Stoke-on-Trent')
  })
})

describe('parseNumericParam', () => {
  it('parses a valid integer within range', () => {
    expect(parseNumericParam('5', 1, 25, 1)).toBe(5)
  })

  it('clamps a value below minimum up to min', () => {
    expect(parseNumericParam('0', 1, 25, 1)).toBe(1)
    expect(parseNumericParam('-99', 1, 25, 1)).toBe(1)
  })

  it('clamps a value above maximum down to max', () => {
    expect(parseNumericParam('999', 1, 25, 1)).toBe(25)
  })

  it('snaps to the nearest step', () => {
    expect(parseNumericParam('175', 50, 600, 50)).toBe(200) // 175/50=3.5 → 4 → 200
    expect(parseNumericParam('120', 50, 600, 50)).toBe(100) // 120/50=2.4 → 2 → 100
  })

  it('returns null for non-numeric input', () => {
    expect(parseNumericParam('abc', 1, 25, 1)).toBeNull()
    expect(parseNumericParam('', 1, 25, 1)).toBeNull()
    expect(parseNumericParam('NaN', 1, 25, 1)).toBeNull()
  })

  it('truncates decimals rather than rejecting them', () => {
    expect(parseNumericParam('5.9', 1, 25, 1)).toBe(5)
  })
})

describe('parseUrlParams', () => {
  it('parses all four valid params', () => {
    const r = parseUrlParams('?from=Luton&to=Newquay&charger_distance=10&food_radius=200')
    expect(r.from).toBe('Luton')
    expect(r.to).toBe('Newquay')
    expect(r.chargerDistance).toBe(10)
    expect(r.foodRadius).toBe(200)
  })

  it('returns empty object for empty search string', () => {
    expect(parseUrlParams('')).toEqual({})
  })

  it('omits params with invalid place names', () => {
    const r = parseUrlParams('?from=<script>&to=ValidPlace')
    expect(r.from).toBeUndefined()
    expect(r.to).toBe('ValidPlace')
  })

  it('omits params with non-numeric slider values', () => {
    const r = parseUrlParams('?charger_distance=abc&food_radius=not-a-number')
    expect(r.chargerDistance).toBeUndefined()
    expect(r.foodRadius).toBeUndefined()
  })

  it('clamps out-of-range charger_distance to valid range', () => {
    const r = parseUrlParams('?charger_distance=999')
    expect(r.chargerDistance).toBe(25)
  })

  it('clamps out-of-range food_radius to valid range and snaps to step', () => {
    expect(parseUrlParams('?food_radius=0').foodRadius).toBe(50)
    expect(parseUrlParams('?food_radius=9999').foodRadius).toBe(600)
  })

  it('ignores unknown params silently', () => {
    const r = parseUrlParams('?from=London&evil=<script>&to=Bristol')
    expect(r.from).toBe('London')
    expect(r.to).toBe('Bristol')
  })
})

describe('sanitiseVehicleId', () => {
  it('accepts a valid vehicle id', () => {
    expect(sanitiseVehicleId('tesla-model-3-lr-2023')).toBe('tesla-model-3-lr-2023')
  })

  it('returns null for empty string', () => {
    expect(sanitiseVehicleId('')).toBeNull()
  })

  it('returns null for ids with invalid characters', () => {
    expect(sanitiseVehicleId('tesla model 3')).toBeNull()
    expect(sanitiseVehicleId('<script>')).toBeNull()
    expect(sanitiseVehicleId('Tesla_Model_3')).toBeNull()
  })

  it('returns null for ids over 60 characters', () => {
    expect(sanitiseVehicleId('a'.repeat(61))).toBeNull()
    expect(sanitiseVehicleId('a'.repeat(60))).toBe('a'.repeat(60))
  })
})

describe('parseUrlParams — vehicle params', () => {
  it('parses vehicle and charge params', () => {
    const r = parseUrlParams('?vehicle=tesla-model-3-lr-2023&charge=80')
    expect(r.vehicleId).toBe('tesla-model-3-lr-2023')
    expect(r.chargePercent).toBe(80)
  })

  it('clamps charge to 10–100 range', () => {
    expect(parseUrlParams('?charge=5').chargePercent).toBe(10)
    expect(parseUrlParams('?charge=999').chargePercent).toBe(100)
  })

  it('rejects invalid vehicle id', () => {
    expect(parseUrlParams('?vehicle=<evil>').vehicleId).toBeUndefined()
  })
})

describe('parseUrlParams — indie param', () => {
  it('parses indie=0 as indieOnly false', () => {
    expect(parseUrlParams('?indie=0').indieOnly).toBe(false)
  })

  it('parses indie=1 as indieOnly true', () => {
    expect(parseUrlParams('?indie=1').indieOnly).toBe(true)
  })

  it('omits indieOnly when param is absent', () => {
    expect(parseUrlParams('').indieOnly).toBeUndefined()
  })

  it('ignores invalid indie values', () => {
    expect(parseUrlParams('?indie=maybe').indieOnly).toBeUndefined()
    expect(parseUrlParams('?indie=2').indieOnly).toBeUndefined()
  })
})

describe('buildUrlSearch', () => {
  it('builds a round-trippable query string', () => {
    const qs = buildUrlSearch('Luton', 'Newquay', 5, 150)
    const r = parseUrlParams(qs)
    expect(r.from).toBe('Luton')
    expect(r.to).toBe('Newquay')
    expect(r.chargerDistance).toBe(5)
    expect(r.foodRadius).toBe(150)
  })

  it('URL-encodes special characters in place names', () => {
    const qs = buildUrlSearch("King's Cross", 'Bristol', 5, 150)
    expect(qs).toContain('King')
    const r = parseUrlParams(qs)
    expect(r.from).toBe("King's Cross")
  })

  it('includes vehicle and charge when provided', () => {
    const qs = buildUrlSearch('Luton', 'Newquay', 5, 150, 'tesla-model-3-lr-2023', 80)
    const r = parseUrlParams(qs)
    expect(r.vehicleId).toBe('tesla-model-3-lr-2023')
    expect(r.chargePercent).toBe(80)
  })

  it('omits indie param when indieOnly is true (default)', () => {
    const qs = buildUrlSearch('London', 'Edinburgh', 5, 150, undefined, undefined, true)
    expect(qs).not.toContain('indie')
  })

  it('includes indie=0 when indieOnly is false', () => {
    const qs = buildUrlSearch('London', 'Edinburgh', 5, 150, undefined, undefined, false)
    expect(qs).toContain('indie=0')
    expect(parseUrlParams(qs).indieOnly).toBe(false)
  })
})
