import { describe, it, expect } from 'vitest'
import { VEHICLES, findVehicle, vehiclesByMake } from '../src/data/vehicles.ts'

describe('VEHICLES', () => {
  it('contains at least one entry', () => {
    expect(VEHICLES.length).toBeGreaterThan(0)
  })

  it('every entry has required fields', () => {
    for (const v of VEHICLES) {
      expect(v.id).toBeTruthy()
      expect(v.make).toBeTruthy()
      expect(v.model).toBeTruthy()
      expect(v.wltpRangeKm).toBeGreaterThan(0)
      expect(v.maxChargeKw).toBeGreaterThan(0)
      expect(['CCS', 'CHAdeMO', 'Tesla', 'CCS+CHAdeMO']).toContain(v.chargePortType)
    }
  })

  it('all ids are unique', () => {
    const ids = VEHICLES.map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('findVehicle', () => {
  it('returns the vehicle for a known id', () => {
    const v = findVehicle('tesla-model-3-lr-2023')
    expect(v).toBeDefined()
    expect(v!.make).toBe('Tesla')
    expect(v!.chargePortType).toBe('CCS')
  })

  it('returns undefined for an unknown id', () => {
    expect(findVehicle('not-a-real-car')).toBeUndefined()
  })
})

describe('vehiclesByMake', () => {
  it('groups all vehicles by make', () => {
    const map = vehiclesByMake()
    expect(map.size).toBeGreaterThan(0)
    let total = 0
    for (const vehicles of map.values()) total += vehicles.length
    expect(total).toBe(VEHICLES.length)
  })

  it('all vehicles in a group share the same make', () => {
    const map = vehiclesByMake()
    for (const [make, vehicles] of map) {
      for (const v of vehicles) expect(v.make).toBe(make)
    }
  })
})
