import { describe, it, expect } from 'vitest'
import {
  makeWaypointList,
  insertWaypoint,
  removeWaypoint,
  reverseWaypoints,
  canAddWaypoint,
  waypointLabels,
  type WaypointList,
} from '../src/waypoints.ts'

const EMPTY: WaypointList = makeWaypointList()

describe('makeWaypointList', () => {
  it('starts with two empty-string waypoints (from + to)', () => {
    const wl = makeWaypointList()
    expect(wl.places).toHaveLength(2)
    expect(wl.places[0]).toBe('')
    expect(wl.places[1]).toBe('')
  })

  it('starts with one charge percent entry (for the from waypoint)', () => {
    expect(makeWaypointList().chargePercents).toHaveLength(1)
    expect(makeWaypointList().chargePercents[0]).toBe(100)
  })
})

describe('canAddWaypoint', () => {
  it('returns true when fewer than 8 waypoints', () => {
    expect(canAddWaypoint(EMPTY)).toBe(true)
  })

  it('returns false at 8 waypoints', () => {
    let wl = makeWaypointList()
    for (let i = 0; i < 6; i++) wl = insertWaypoint(wl, `City${i}`, 2)
    expect(wl.places).toHaveLength(8)
    expect(canAddWaypoint(wl)).toBe(false)
  })
})

describe('insertWaypoint', () => {
  it('inserts a via stop at the specified index', () => {
    const wl = insertWaypoint(EMPTY, 'Oxford', 1)
    expect(wl.places).toEqual(['', 'Oxford', ''])
  })

  it('inserts at position 2 for a three-place list', () => {
    let wl = insertWaypoint(EMPTY, 'Oxford', 1)
    wl = insertWaypoint(wl, 'Birmingham', 2)
    expect(wl.places).toEqual(['', 'Oxford', 'Birmingham', ''])
  })

  it('adds a charge percent for the new waypoint (not the last leg)', () => {
    const wl = insertWaypoint(EMPTY, 'Oxford', 1)
    // chargePercents covers from + vias (not to): should now have 2 entries
    expect(wl.chargePercents).toHaveLength(2)
  })

  it('does not add a waypoint beyond 8 total', () => {
    let wl = makeWaypointList()
    for (let i = 0; i < 10; i++) wl = insertWaypoint(wl, `City${i}`, 1)
    expect(wl.places).toHaveLength(8)
  })

  it('clamps insertion index to valid range', () => {
    const wl = insertWaypoint(EMPTY, 'Oxford', 99)
    // Clamped to last valid position (before the final "to" slot)
    expect(wl.places).toContain('Oxford')
    expect(wl.places).toHaveLength(3)
  })
})

describe('removeWaypoint', () => {
  it('removes a via stop by index', () => {
    let wl = insertWaypoint(EMPTY, 'Oxford', 1)
    wl = removeWaypoint(wl, 1)
    expect(wl.places).toEqual(['', ''])
  })

  it('does not remove from or to (indices 0 and last)', () => {
    const wl = insertWaypoint(EMPTY, 'Oxford', 1)
    const unchanged = removeWaypoint(wl, 0)
    expect(unchanged.places).toHaveLength(3)
    const unchanged2 = removeWaypoint(wl, 2)
    expect(unchanged2.places).toHaveLength(3)
  })

  it('removes the associated charge percent', () => {
    let wl = insertWaypoint(EMPTY, 'Oxford', 1)
    expect(wl.chargePercents).toHaveLength(2)
    wl = removeWaypoint(wl, 1)
    expect(wl.chargePercents).toHaveLength(1)
  })
})

describe('reverseWaypoints', () => {
  it('reverses the places list', () => {
    const wl = { ...makeWaypointList(), places: ['London', 'Oxford', 'Edinburgh'] }
    const reversed = reverseWaypoints(wl)
    expect(reversed.places).toEqual(['Edinburgh', 'Oxford', 'London'])
  })

  it('preserves the number of charge percents', () => {
    const wl = insertWaypoint(EMPTY, 'Oxford', 1)
    const reversed = reverseWaypoints(wl)
    expect(reversed.chargePercents).toHaveLength(wl.chargePercents.length)
  })
})

describe('waypointLabels', () => {
  it('labels from/to and numbers via stops', () => {
    let wl = insertWaypoint(EMPTY, 'Oxford', 1)
    wl = insertWaypoint(wl, 'Birmingham', 2)
    const labels = waypointLabels(wl)
    expect(labels[0]).toBe('From')
    expect(labels[1]).toBe('Via 1')
    expect(labels[2]).toBe('Via 2')
    expect(labels[3]).toBe('To')
  })

  it('labels just from/to with no vias', () => {
    const labels = waypointLabels(EMPTY)
    expect(labels).toEqual(['From', 'To'])
  })
})
