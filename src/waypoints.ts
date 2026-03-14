/** Immutable waypoint list state model for multi-leg journey planning. */

const MAX_WAYPOINTS = 8
const DEFAULT_CHARGE = 100

export interface WaypointList {
  /** Place names: [from, ...vias, to]. Always at least 2 entries. */
  places: string[]
  /** Starting charge % for each leg origin (places[0..n-2]). Length = places.length - 1. */
  chargePercents: number[]
}

export function makeWaypointList(): WaypointList {
  return { places: ['', ''], chargePercents: [DEFAULT_CHARGE] }
}

export function canAddWaypoint(wl: WaypointList): boolean {
  return wl.places.length < MAX_WAYPOINTS
}

/**
 * Insert a new via stop at `insertIdx` (1-based, clamped to [1, places.length-1]).
 * Does nothing if already at MAX_WAYPOINTS.
 */
export function insertWaypoint(wl: WaypointList, place: string, insertIdx: number): WaypointList {
  if (!canAddWaypoint(wl)) return wl
  const idx = Math.max(1, Math.min(wl.places.length - 1, insertIdx))
  const places = [...wl.places.slice(0, idx), place, ...wl.places.slice(idx)]
  // chargePercents covers all legs except the last; inserting a stop adds one leg
  const chargePercents = [
    ...wl.chargePercents.slice(0, idx - 1),
    DEFAULT_CHARGE,
    ...wl.chargePercents.slice(idx - 1),
  ]
  return { places, chargePercents }
}

/**
 * Remove the stop at `removeIdx`. Cannot remove from (index 0) or to (last index).
 */
export function removeWaypoint(wl: WaypointList, removeIdx: number): WaypointList {
  if (removeIdx === 0 || removeIdx === wl.places.length - 1) return wl
  const places = wl.places.filter((_, i) => i !== removeIdx)
  // chargePercents index for a via at removeIdx is removeIdx - 1 (leg leaving from that via)
  // Actually: chargePercents[i] = charge for leg starting at places[i].
  // Removing places[removeIdx] removes the leg that starts there → remove chargePercents[removeIdx-1]
  // Wait: chargePercents[0] is for leg 0 (places[0]→places[1]),
  //        chargePercents[1] is for leg 1 (places[1]→places[2]), etc.
  // Removing places[removeIdx] collapses leg removeIdx-1 and leg removeIdx into one leg.
  // Keep chargePercents for legs before removeIdx, drop chargePercents[removeIdx-1].
  const chargePercents = wl.chargePercents.filter((_, i) => i !== removeIdx - 1)
  return { places, chargePercents }
}

/** Reverse the waypoint order; charge percents are reset to defaults. */
export function reverseWaypoints(wl: WaypointList): WaypointList {
  const places = [...wl.places].reverse()
  return { places, chargePercents: wl.chargePercents.map(() => DEFAULT_CHARGE) }
}

/** Human-readable label for each waypoint slot. */
export function waypointLabels(wl: WaypointList): string[] {
  return wl.places.map((_, i) => {
    if (i === 0) return 'From'
    if (i === wl.places.length - 1) return 'To'
    return `Via ${i}`
  })
}
