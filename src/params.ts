/** URL parameter parsing and serialisation with input validation. */

export interface RouteParams {
  from: string
  to: string
  chargerDistance: number
  foodRadius: number
}

const PLACE_MAX_LEN = 100

export function sanitisePlace(raw: string): string | null {
  const s = raw.trim()
  if (!s || s.length > PLACE_MAX_LEN) return null
  if (/<|>|javascript:/i.test(s)) return null
  return s
}

export function parseNumericParam(
  raw: string,
  min: number,
  max: number,
  step: number,
): number | null {
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n)) return null
  const clamped = Math.max(min, Math.min(max, n))
  return Math.round(clamped / step) * step
}

export function parseUrlParams(search: string): Partial<RouteParams> {
  const p = new URLSearchParams(search)
  const result: Partial<RouteParams> = {}

  const from = p.get('from')
  if (from !== null) {
    const s = sanitisePlace(from)
    if (s) result.from = s
  }

  const to = p.get('to')
  if (to !== null) {
    const s = sanitisePlace(to)
    if (s) result.to = s
  }

  const detour = p.get('charger_distance')
  if (detour !== null) {
    const n = parseNumericParam(detour, 1, 25, 1)
    if (n !== null) result.chargerDistance = n
  }

  const food = p.get('food_radius')
  if (food !== null) {
    const n = parseNumericParam(food, 50, 600, 50)
    if (n !== null) result.foodRadius = n
  }

  return result
}

export function buildUrlSearch(
  from: string,
  to: string,
  chargerDistance: number,
  foodRadius: number,
): string {
  const p = new URLSearchParams({
    from,
    to,
    charger_distance: String(chargerDistance),
    food_radius: String(foodRadius),
  })
  return '?' + p.toString()
}
