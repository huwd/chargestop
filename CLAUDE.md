# CLAUDE.md — chargestop

Extends the [global standard](../standards/standards/CLAUDE.md).

## Project

**ChargeStop** — a static web app that plots a driving route and surfaces
EV fast chargers that have an indie café, pub, or restaurant within a
configurable radius. No chains. No McDonald's. Real food.

## Tech stack

| Concern        | Choice                                      |
|----------------|---------------------------------------------|
| Build          | Vite 5 (TypeScript strict)                  |
| Unit tests     | Vitest                                      |
| E2E tests      | Playwright                                  |
| Lint           | ESLint (typescript-eslint) + Prettier       |
| Map            | Leaflet 1.9                                 |
| Routing        | OSRM public API                             |
| Geocoding      | Nominatim                                   |
| POI data       | Overpass API (public, multi-endpoint)       |
| Hosting        | GitHub Pages (static, no server)            |

## Architecture

```
src/
  geo.ts          — haversine, downsampleRoute, minDistToRoute, bbox, findInsertPosition
  overpass.ts     — query builder + multi-endpoint failover + localStorage cache
  filters.ts      — CHAIN_NAMES blocklist, isFastCharger, filterFood
  routing.ts      — geocode (Nominatim + lat,lon shortcut) + getRoute (OSRM, n waypoints)
  range.ts        — charge-level colouring, terminator, multi-leg variants
  map.ts          — Leaflet initialisation + marker factories + route animation
  ui.ts           — sidebar cards, status bar, drawer (mobile), waypoint list rendering
  waypoints.ts    — immutable WaypointList state model (insert/remove/reverse)
  cache.ts        — localStorage TTL cache with LRU eviction (used by overpass.ts)
  params.ts       — URL param parsing/serialisation (via=, charge_0=, charge_1=, …)
  main.ts         — orchestration: wires events, calls modules
  data/
    vehicles.ts   — UK EV vehicle database
tests/
  geo.test.ts
  filters.test.ts
  overpass.test.ts
  range.test.ts
  routing.test.ts
  waypoints.test.ts
  cache.test.ts
  params.test.ts
  ui.test.ts
e2e/
  route.spec.ts
```

Pure logic (geo, filters) must be fully unit-tested. UI and API modules
use mocks in Vitest; Playwright covers the happy-path end-to-end flow.

## Local development

```bash
npm install
npm run dev        # Vite dev server with HMR
npm run build      # production bundle → dist/
npm run preview    # serve dist/ locally
```

## Verification loop (run before every push)

```bash
npm run check      # runs all of: lint, typecheck, test, build
```

Individual steps:

```bash
npm run lint       # eslint + prettier --check
npm run typecheck  # tsc --noEmit
npm run test       # vitest run
npm run test:e2e   # playwright test
npm run build      # must produce a clean dist/
```

All must pass before opening a PR. CI enforces the same via GitHub Actions.

## Coverage targets

- Line: 80%
- Branch: 75%

Focus coverage on `geo.ts`, `filters.ts`, and `overpass.ts` — these
contain algorithmic logic with the most failure modes.

## Key design decisions

### Why static (no server)?

The Overpass API is free and public — no token needed. The main risk
is rate-limiting on heavy use, which multi-endpoint failover already
handles. A Cloudflare Worker proxy can be added later if needed without
changing the client architecture.

### Why not Google Maps?

Cost and lock-in. OSM + Overpass + OSRM gives full control, zero API
keys, and open data.

### Chain filtering

`filters.ts` maintains a regex blocklist (`CHAIN_NAMES`) of known
chains plus OSM brand tag checks. This is the most subjective and
volatile part of the app — tests should cover boundary cases (e.g. a
pub called "The Mcgregor Arms" should not be filtered).

### Detour calculation

Route is downsampled to ~400 points before distance checks.
`minDistToRoute` is O(n) per charger — acceptable for <1000 chargers
on a UK cross-country route.

## GitHub repo setup

Follow the global standard:
1. Import `protect_main.json` ruleset
2. Import `prevent_tag_deletion.json` ruleset
3. Add `.github/dependabot.yml` (npm + github-actions, weekly)

## Future: server upgrade path

If Overpass rate limits become a problem, introduce a Cloudflare Worker
that caches queries by bbox+query hash (TTL: 1 hour). The client calls
`/api/overpass` instead of the public endpoint — no other changes
needed.
