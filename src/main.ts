/** Orchestration: wires UI events to routing, Overpass, and map. */

import L from 'leaflet'
import { initMap, makeChargerMarker, makeFoodMarker, buildRangeLayer } from './map.ts'
import { geocode, getRoute } from './routing.ts'
import { downsampleRoute, minDistToRouteKm, routeBBox, type LatLon } from './geo.ts'
import { overpass, buildChargerQuery, buildFoodQuery } from './overpass.ts'
import {
  isFastCharger,
  isIndieFood,
  getChargerSockets,
  matchesVehiclePort,
  type OsmElement,
} from './filters.ts'
import {
  setStatus,
  setPlanStep,
  buildChargerCard,
  renderFoodList,
  initDrawer,
  populateVehiclePicker,
  renderWaypointList,
  renderShareBar,
} from './ui.ts'
import { buildShareTitle } from './share.ts'
import { parseUrlParams, buildUrlSearch } from './params.ts'
import { findVehicle, type Vehicle } from './data/vehicles.ts'
import {
  effectiveRangeKm,
  cumulativeDistancesKm,
  coloredRouteSegments,
  computeTerminator,
  multiLegColoredSegments,
  computeMultiLegTerminator,
  planChargingStops,
  type ChargingPlan,
} from './range.ts'
import {
  makeWaypointList,
  insertWaypoint,
  removeWaypoint,
  reverseWaypoints,
  canAddWaypoint,
  type WaypointList,
} from './waypoints.ts'
import { findInsertPosition as findWpInsertPos } from './geo.ts'

// ─── DOM refs ────────────────────────────────────────────────────────────────

const waypointsListEl = document.getElementById('waypoints-list') as HTMLElement
const addStopBtn = document.getElementById('add-stop-btn') as HTMLButtonElement
const reverseBtn = document.getElementById('reverse-btn') as HTMLButtonElement
const detourSlider = document.getElementById('detour-slider') as HTMLInputElement
const detourVal = document.getElementById('detour-val') as HTMLElement
const foodSlider = document.getElementById('food-slider') as HTMLInputElement
const foodVal = document.getElementById('food-val') as HTMLElement
const indieToggle = document.getElementById('indie-toggle') as HTMLInputElement
const vehicleSelect = document.getElementById('vehicle-select') as HTMLSelectElement
const planBtn = document.getElementById('plan-btn') as HTMLButtonElement
const statusMsg = document.getElementById('status-msg') as HTMLElement
const statusDot = document.getElementById('status-dot') as HTMLElement
const shareBarEl = document.getElementById('share-bar') as HTMLElement
const resultsDiv = document.getElementById('results') as HTMLElement
const planSteps = document.getElementById('plan-steps') as HTMLElement
const sidebar = document.getElementById('sidebar') as HTMLElement
const drawerToggle = document.getElementById('drawer-toggle') as HTMLButtonElement
const sidebarHeader = document.getElementById('sidebar-header') as HTMLElement

const status = (msg: string, state: Parameters<typeof setStatus>[3] = 'active'): void =>
  setStatus(statusMsg, statusDot, msg, state)
const step = (s: Parameters<typeof setPlanStep>[1], fromCache = false): void =>
  setPlanStep(planSteps, s, fromCache)

// ─── Vehicle picker ───────────────────────────────────────────────────────────

populateVehiclePicker(vehicleSelect)

function selectedVehicle(): Vehicle | null {
  const id = vehicleSelect.value
  return id ? (findVehicle(id) ?? null) : null
}

vehicleSelect.addEventListener('change', () => {
  const v = selectedVehicle()
  if (v) localStorage.setItem('chargestop_vehicle', v.id)
  else localStorage.removeItem('chargestop_vehicle')
  redrawWaypoints()
})

// ─── Waypoint state ───────────────────────────────────────────────────────────

let wpState: WaypointList = makeWaypointList()

function redrawWaypoints(): void {
  const showCharge = selectedVehicle() !== null
  renderWaypointList(waypointsListEl, wpState, showCharge, {
    onInputChange(idx, value) {
      wpState = { ...wpState, places: wpState.places.map((p, i) => (i === idx ? value : p)) }
    },
    onRemove(idx) {
      wpState = removeWaypoint(wpState, idx)
      redrawWaypoints()
    },
    onChargeChange(legIdx, value) {
      const percents = [...wpState.chargePercents]
      percents[legIdx] = value
      wpState = { ...wpState, chargePercents: percents }
    },
    onDrop(fromIdx, toIdx) {
      const places = [...wpState.places]
      const [moved] = places.splice(fromIdx, 1)
      places.splice(toIdx, 0, moved)
      // Reset charge percents to defaults after reorder
      wpState = { ...wpState, places, chargePercents: wpState.chargePercents.map(() => 100) }
      redrawWaypoints()
    },
  })
  addStopBtn.disabled = !canAddWaypoint(wpState)
}

addStopBtn.addEventListener('click', () => {
  wpState = insertWaypoint(wpState, '', wpState.places.length - 1)
  redrawWaypoints()
  // Focus the new input
  const inputs = waypointsListEl.querySelectorAll('.wp-input')
  const newInput = inputs[inputs.length - 2] as HTMLInputElement | null
  newInput?.focus()
})

reverseBtn.addEventListener('click', () => {
  wpState = reverseWaypoints(wpState)
  redrawWaypoints()
})

redrawWaypoints()

// ─── Map state ────────────────────────────────────────────────────────────────

const map = initMap('map')
let routeLayer: L.Polyline | null = null
let rangeLayer: L.FeatureGroup | null = null
let chargerMarkers: L.Marker[] = []
let foodMarkers: L.Marker[] = []

function clearFoodMarkers(): void {
  foodMarkers.forEach((m) => map.removeLayer(m))
  foodMarkers = []
}

function clearAll(): void {
  if (routeLayer) {
    map.removeLayer(routeLayer)
    routeLayer = null
  }
  if (rangeLayer) {
    map.removeLayer(rangeLayer)
    rangeLayer = null
  }
  chargerMarkers.forEach((m) => map.removeLayer(m))
  chargerMarkers = []
  clearFoodMarkers()
}

// ─── Slider wiring ────────────────────────────────────────────────────────────

detourSlider.addEventListener('input', () => {
  detourVal.textContent = detourSlider.value
})
foodSlider.addEventListener('input', () => {
  foodVal.textContent = foodSlider.value
})

// ─── Food loader (per charger) ────────────────────────────────────────────────

function attachFoodLoader(
  charger: OsmElement,
  card: HTMLElement,
  marker: L.Marker,
  foodRadiusM: number,
): void {
  let cachedData: import('./overpass.ts').OverpassResponse | null = null
  let lastRenderedIndie: boolean | null = null

  const chargerName = charger.tags.name ?? charger.tags.operator ?? 'Charging Station'

  const renderFood = (data: import('./overpass.ts').OverpassResponse): void => {
    const indieOnly = indieToggle.checked
    cachedData = data
    lastRenderedIndie = indieOnly

    const foods = indieOnly ? data.elements.filter(isIndieFood) : data.elements
    const foodDiv = document.getElementById(`food-${charger.id}`)
    if (!foodDiv) return

    if (foods.length > 0) {
      map.removeLayer(marker)
      const newMarker = makeChargerMarker(charger.lat, charger.lon, true)
      newMarker.bindPopup(marker.getPopup() ?? '')
      newMarker.addTo(map)
      chargerMarkers = chargerMarkers.filter((m) => m !== marker)
      chargerMarkers.push(newMarker)
      newMarker.on('click', () => {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        void loadFood()
      })
    }

    foodMarkers.forEach((m) => map.removeLayer(m))
    foodMarkers = []
    foodDiv.innerHTML = renderFoodList(foods, [charger.lat, charger.lon], foodRadiusM, indieOnly)

    foods.forEach((f) => {
      const fm = makeFoodMarker(f.lat, f.lon, f.tags.amenity ?? '')
      const cuisine = f.tags.cuisine ? ` · ${f.tags.cuisine}` : ''
      const indieNote = indieOnly
        ? '<br><i style="color:#8b93a4;font-size:0.85em">✓ No brand tag — likely indie</i>'
        : ''
      fm.bindPopup(
        `<b style="color:#5ecf8a">${f.tags.name ?? 'Unnamed'}</b><br>` +
          `${f.tags.amenity ?? ''}${cuisine}${indieNote}`,
      )
      fm.addTo(map)
      foodMarkers.push(fm)
    })

    const placeLabel = indieOnly ? 'indie place' : 'place'
    status(
      `${foods.length} ${placeLabel}${foods.length !== 1 ? 's' : ''} near ${chargerName}`,
      'ok',
    )
  }

  const loadFood = async (): Promise<void> => {
    const indieOnly = indieToggle.checked
    const isActive = card.classList.contains('active')
    const toggleChanged = lastRenderedIndie !== null && lastRenderedIndie !== indieOnly

    // Close if already showing the same result set
    if (isActive && !toggleChanged) {
      card.classList.remove('active')
      document.getElementById(`food-${charger.id}`)?.classList.remove('open')
      clearFoodMarkers()
      return
    }

    document.querySelectorAll('.charger-card.active').forEach((el) => el.classList.remove('active'))
    document.querySelectorAll('.food-list.open').forEach((el) => el.classList.remove('open'))
    clearFoodMarkers()

    card.classList.add('active')
    const foodDiv = document.getElementById(`food-${charger.id}`)
    if (!foodDiv) return
    foodDiv.classList.add('open')

    // Re-render from cache if only the toggle changed — no new fetch needed
    if (cachedData && toggleChanged) {
      renderFood(cachedData)
      return
    }

    const searchingMsg = indieOnly ? 'Searching for indie food…' : 'Searching for food…'
    foodDiv.innerHTML = `<div class="food-searching">${searchingMsg}</div>`
    status(`Searching for food near ${chargerName}…`, 'active')

    map.setView([charger.lat, charger.lon], 15, { animate: true })
    marker.openPopup()

    try {
      const query = buildFoodQuery(charger.lat, charger.lon, foodRadiusM)
      const data = await overpass(query, undefined, {
        onRefresh: (fresh) => renderFood(fresh),
      })
      renderFood(data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      foodDiv.innerHTML = `<div class="food-none">Overpass error: ${msg}</div>`
      status('Food search failed', 'err')
    }
  }

  card.addEventListener('click', (e) => {
    // Don't trigger food load when clicking the + route button
    if ((e.target as HTMLElement).closest('.add-to-route-btn')) return
    void loadFood()
  })
  marker.on('click', () => {
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    void loadFood()
  })

  // Re-render immediately when the indie toggle changes while this card is active
  indieToggle.addEventListener('change', () => {
    if (card.classList.contains('active') && cachedData) {
      renderFood(cachedData)
    }
  })

  // "Add to route" button
  const addBtn = card.querySelector('.add-to-route-btn') as HTMLButtonElement | null
  if (addBtn) {
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      const coords: LatLon = [charger.lat, charger.lon]
      const currentPlaces = wpState.places
      const insertIdx = findWpInsertPos(
        currentPlaces
          .filter((p) => p.trim() !== '')
          .map((p) => {
            const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(p.trim())
            if (m) return [parseFloat(m[1]), parseFloat(m[2])] as LatLon
            return null
          })
          .filter((c): c is LatLon => c !== null),
        coords,
      )
      const coordStr = `${charger.lat.toFixed(5)},${charger.lon.toFixed(5)}`
      wpState = insertWaypoint(wpState, coordStr, insertIdx)
      redrawWaypoints()
    })
  }
}

// ─── Plan button ─────────────────────────────────────────────────────────────

planBtn.addEventListener('click', () => void runPlan())

async function runPlan(): Promise<void> {
  const places = wpState.places.map((p) => p.trim()).filter(Boolean)
  if (places.length < 2) {
    status('Enter at least a From and To location', 'err')
    return
  }

  const detourKm = parseFloat(detourSlider.value)
  const foodRadiusM = parseFloat(foodSlider.value)
  const vehicle = selectedVehicle()
  const chargePercents = wpState.chargePercents
  const indieOnly = indieToggle.checked

  planBtn.disabled = true
  clearAll()
  resultsDiv.innerHTML = ''
  history.replaceState(
    null,
    '',
    buildUrlSearch(
      places[0],
      places[places.length - 1],
      detourKm,
      foodRadiusM,
      vehicle?.id,
      chargePercents[0],
      indieOnly,
      places.slice(1, -1),
      chargePercents,
    ),
  )

  try {
    step('geocode')
    status('Geocoding locations…')
    const coords = await Promise.all(places.map((p) => geocode(p)))

    step('route')
    status('Calculating route…')
    const { coords: routeCoords, legEndIndices } = await getRoute(coords)
    const routeSampled = downsampleRoute(routeCoords, 400)

    // Draw route — colored by charge level if a vehicle is selected, plain yellow otherwise
    if (vehicle) {
      const cumDist = cumulativeDistancesKm(routeCoords)
      const isMultiLeg = legEndIndices.length > 1
      const segments = isMultiLeg
        ? multiLegColoredSegments(routeCoords, cumDist, legEndIndices, vehicle, chargePercents)
        : coloredRouteSegments(routeCoords, cumDist, effectiveRangeKm(vehicle, chargePercents[0]))
      const terminator = isMultiLeg
        ? computeMultiLegTerminator(routeCoords, cumDist, legEndIndices, vehicle, chargePercents)
        : computeTerminator(routeCoords, cumDist, effectiveRangeKm(vehicle, chargePercents[0]))
      rangeLayer = buildRangeLayer(segments, terminator)
      rangeLayer.addTo(map)
      map.fitBounds(rangeLayer.getBounds(), { padding: [50, 50] })
    } else {
      routeLayer = L.polyline(routeCoords as LatLon[], {
        color: '#f0c040',
        weight: 3,
        opacity: 0.75,
      })
      routeLayer.addTo(map)
      map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] })
    }

    const chargerQuery = buildChargerQuery(
      routeBBox(routeCoords, detourKm),
      vehicle?.chargePortType,
    )
    step('chargers')
    status('Querying OSM for charging stations…')

    const renderChargers = (
      chargerData: import('./overpass.ts').OverpassResponse,
      cached: boolean,
    ): void => {
      let nearbyChargers = chargerData.elements.filter(
        (c) => minDistToRouteKm([c.lat, c.lon], routeSampled) <= detourKm,
      )
      if (vehicle) {
        nearbyChargers = nearbyChargers.filter((c) => matchesVehiclePort(c, vehicle.chargePortType))
      }
      const fastOnly = nearbyChargers.filter((c) => isFastCharger(c.tags))
      const candidateChargers = fastOnly.length > 0 ? fastOnly : nearbyChargers

      if (candidateChargers.length === 0) {
        status(`No chargers found within ${detourKm}km — try increasing detour`, 'err')
        resultsDiv.innerHTML = `<div class="empty-state"><div class="big">😞</div><div>No chargers found.<br>Try a wider detour.</div></div>`
        return
      }

      // When a vehicle is selected, compute the minimum required stops
      let plan: ChargingPlan | null = null
      let planError: string | null = null
      if (vehicle) {
        const cumDist = cumulativeDistancesKm(routeCoords)
        try {
          plan = planChargingStops(
            routeCoords,
            cumDist,
            candidateChargers,
            vehicle,
            chargePercents[0],
          )
        } catch (e) {
          planError = e instanceof Error ? e.message : String(e)
        }
      }

      // Determine which chargers to display
      const displayChargers = plan !== null ? plan.stops.map((s) => s.charger) : candidateChargers

      const routeTotalKm = cumulativeDistancesKm(routeCoords).at(-1)!

      const label = ((): string => {
        if (plan !== null) {
          const n = plan.stops.length
          return n === 0
            ? `No stops needed · ${routeTotalKm.toFixed(0)}km route`
            : `${n} stop${n !== 1 ? 's' : ''} needed · ${routeTotalKm.toFixed(0)}km route · starting at ${chargePercents[0]}%`
        }
        return fastOnly.length > 0
          ? `${candidateChargers.length} fast charger${candidateChargers.length !== 1 ? 's' : ''} found`
          : `${candidateChargers.length} charger${candidateChargers.length !== 1 ? 's' : ''} (slow) found`
      })()

      const vehicleLabel = vehicle
        ? ` · ${vehicle.make} ${vehicle.model} · ${effectiveRangeKm(vehicle, chargePercents[0]).toFixed(0)}km range`
        : ''
      const cacheLabel = cached ? ' ⚡' : ''

      if (planError) {
        status(`Route unreachable: ${planError}`, 'err')
      } else {
        status(
          label + (plan === null ? ' — click any to find food' : '') + cacheLabel,
          plan !== null ? 'ok' : 'ok',
        )
      }
      step('done')

      // Share bar — build from the current filled-in place names
      const filledPlaces = wpState.places.filter((p) => p.trim() !== '')
      renderShareBar(
        shareBarEl,
        filledPlaces,
        window.location.href,
        buildShareTitle(filledPlaces),
        filledPlaces.length > 2,
        {
          onCopy(url, btn) {
            if (navigator.clipboard?.writeText) {
              void navigator.clipboard.writeText(url).then(() => {
                btn.textContent = '✓ Copied!'
                btn.classList.add('copied')
                setTimeout(() => {
                  btn.textContent = '🔗 Copy link'
                  btn.classList.remove('copied')
                }, 2000)
              })
            } else {
              // Clipboard API unavailable — show a selectable input
              const fallback = document.createElement('input')
              fallback.className = 'share-fallback-input'
              fallback.value = url
              fallback.readOnly = true
              shareBarEl.appendChild(fallback)
              fallback.select()
            }
          },
          onShare: navigator.share
            ? (title: string, url: string): void => void navigator.share({ title, url })
            : undefined,
          onAppleToast() {
            status('Apple Maps only supports one destination — exporting From → To', 'ok')
          },
        },
      )

      // Clear previous markers if this is a background refresh
      if (cached) {
        chargerMarkers.forEach((m) => map.removeLayer(m))
        chargerMarkers = []
        resultsDiv.innerHTML = ''
      }

      if (planError) {
        resultsDiv.innerHTML = `<div class="empty-state"><div class="big">⚠️</div><div>${planError}<br><small>Try adding a waypoint near a charger, or selecting a different vehicle.</small></div></div>`
        return
      }

      // Required stop IDs for fast lookup
      const requiredIds = new Set(plan?.stops.map((s) => s.charger.id) ?? [])

      // Render the charger list; called again when the show-all toggle changes
      let showAll = false
      const renderList = (): void => {
        chargerMarkers.forEach((m) => map.removeLayer(m))
        chargerMarkers = []

        const chargersToShow = showAll ? candidateChargers : displayChargers
        const listEl = resultsDiv.querySelector<HTMLElement>('.charger-list')
        if (!listEl) return
        listEl.innerHTML = ''

        chargersToShow.forEach((c, i) => {
          const name = c.tags.name ?? c.tags.operator ?? 'Charging Station'
          const network = c.tags.network ?? c.tags.operator ?? ''
          const sockets = getChargerSockets(c.tags)
          const isRequired = requiredIds.has(c.id)

          const stopInfo = plan?.stops.find((s) => s.charger.id === c.id)
          const card = buildChargerCard(c, sockets, stopInfo)
          if (showAll && !isRequired) card.classList.add('charger-optional')

          const marker = makeChargerMarker(c.lat, c.lon)
          marker.bindPopup(
            `<b>${name}</b><br>${network ? network + '<br>' : ''}` +
              `${sockets.join(' · ') || 'AC'}<br>` +
              `<i style="color:#8b93a4;font-size:0.85em">Click sidebar card to find food</i>`,
          )
          setTimeout(() => {
            marker.addTo(map)
            chargerMarkers.push(marker)
          }, i * 40)

          attachFoodLoader(c, card, marker, foodRadiusM)
          listEl.appendChild(card)
        })
      }

      // Build the scaffold: summary label + optional toggle + charger list
      const showAllToggle =
        plan !== null && candidateChargers.length > displayChargers.length
          ? `<button class="show-all-btn" id="show-all-btn">Show all ${candidateChargers.length} chargers</button>`
          : ''

      resultsDiv.innerHTML = `
        <div class="section-label" style="margin-bottom:6px">${label}${vehicleLabel} · ${detourKm}km detour · food within ${foodRadiusM}m</div>
        ${showAllToggle}
        <div class="charger-list"></div>`

      const toggleBtn = resultsDiv.querySelector<HTMLButtonElement>('#show-all-btn')
      toggleBtn?.addEventListener('click', () => {
        showAll = !showAll
        toggleBtn.textContent = showAll
          ? `Show required stops only`
          : `Show all ${candidateChargers.length} chargers`
        toggleBtn.classList.toggle('active', showAll)
        renderList()
      })

      renderList()
    }

    const chargerData = await overpass(chargerQuery, undefined, {
      onRefresh: (fresh) => renderChargers(fresh, true),
    })
    renderChargers(chargerData, false)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    status(`Error: ${msg}`, 'err')
    step('idle')
    resultsDiv.innerHTML = `<div class="empty-state"><div class="big">⚠️</div><div>${msg}</div></div>`
  } finally {
    planBtn.disabled = false
  }
}

// ─── Mobile drawer ────────────────────────────────────────────────────────────

initDrawer(sidebar, drawerToggle, sidebarHeader, () => window.innerWidth <= 700)

planBtn.addEventListener('click', () => {
  if (window.innerWidth <= 700) setTimeout(() => sidebar.classList.add('open'), 300)
})

sidebar.addEventListener('transitionend', () => map.invalidateSize())

// ─── URL params + localStorage ────────────────────────────────────────────────

const urlParams = parseUrlParams(window.location.search)

// Build initial waypoint state from URL params
const fromPlace = urlParams.from ?? ''
const toPlace = urlParams.to ?? ''
const vias = urlParams.vias ?? []
wpState = makeWaypointList()
wpState = { ...wpState, places: [fromPlace, ...vias, toPlace] }
if (urlParams.chargePercents && urlParams.chargePercents.length > 0) {
  wpState = { ...wpState, chargePercents: urlParams.chargePercents }
} else if (urlParams.chargePercent !== undefined) {
  wpState = { ...wpState, chargePercents: [urlParams.chargePercent] }
}

if (urlParams.chargerDistance !== undefined) {
  detourSlider.value = String(urlParams.chargerDistance)
  detourVal.textContent = String(urlParams.chargerDistance)
}
if (urlParams.foodRadius !== undefined) {
  foodSlider.value = String(urlParams.foodRadius)
  foodVal.textContent = String(urlParams.foodRadius)
}

// Vehicle: URL param takes precedence over localStorage
const savedVehicleId = urlParams.vehicleId ?? localStorage.getItem('chargestop_vehicle') ?? ''
if (savedVehicleId) {
  vehicleSelect.value = savedVehicleId
}
if (urlParams.indieOnly === false) {
  indieToggle.checked = false
}

redrawWaypoints()

if (urlParams.from && urlParams.to) void runPlan()
