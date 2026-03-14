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
} from './ui.ts'
import { parseUrlParams, buildUrlSearch } from './params.ts'
import { findVehicle, type Vehicle } from './data/vehicles.ts'
import {
  effectiveRangeKm,
  cumulativeDistancesKm,
  coloredRouteSegments,
  computeTerminator,
} from './range.ts'

// ─── DOM refs ────────────────────────────────────────────────────────────────

const fromInput = document.getElementById('from-input') as HTMLInputElement
const toInput = document.getElementById('to-input') as HTMLInputElement
const detourSlider = document.getElementById('detour-slider') as HTMLInputElement
const detourVal = document.getElementById('detour-val') as HTMLElement
const foodSlider = document.getElementById('food-slider') as HTMLInputElement
const foodVal = document.getElementById('food-val') as HTMLElement
const chargeSlider = document.getElementById('charge-slider') as HTMLInputElement
const chargeVal = document.getElementById('charge-val') as HTMLElement
const chargeRow = document.getElementById('charge-row') as HTMLElement
const indieToggle = document.getElementById('indie-toggle') as HTMLInputElement
const vehicleSelect = document.getElementById('vehicle-select') as HTMLSelectElement
const planBtn = document.getElementById('plan-btn') as HTMLButtonElement
const statusMsg = document.getElementById('status-msg') as HTMLElement
const statusDot = document.getElementById('status-dot') as HTMLElement
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
  chargeRow.classList.toggle('visible', v !== null)
  if (v) localStorage.setItem('chargestop_vehicle', v.id)
  else localStorage.removeItem('chargestop_vehicle')
})

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
chargeSlider.addEventListener('input', () => {
  chargeVal.textContent = chargeSlider.value
})

// ─── Food loader (per charger) ────────────────────────────────────────────────

function attachFoodLoader(
  charger: OsmElement,
  card: HTMLElement,
  marker: L.Marker,
  foodRadiusM: number,
  indieOnly: boolean,
): void {
  let foodLoaded = false

  const loadFood = async (): Promise<void> => {
    if (card.classList.contains('active') && foodLoaded) {
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

    const chargerName = charger.tags.name ?? charger.tags.operator ?? 'Charging Station'
    const searchingMsg = indieOnly ? 'Searching for indie food…' : 'Searching for food…'
    foodDiv.innerHTML = `<div class="food-searching">${searchingMsg}</div>`
    status(`Searching for food near ${chargerName}…`, 'active')

    map.setView([charger.lat, charger.lon], 15, { animate: true })
    marker.openPopup()

    const renderFood = (data: import('./overpass.ts').OverpassResponse): void => {
      const foods = indieOnly ? data.elements.filter(isIndieFood) : data.elements
      foodLoaded = true

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
          ? '<br><i style="color:#6b7280;font-size:0.85em">✓ No brand tag — likely indie</i>'
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

  card.addEventListener('click', () => void loadFood())
  marker.on('click', () => {
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    void loadFood()
  })
}

// ─── Plan button ─────────────────────────────────────────────────────────────

planBtn.addEventListener('click', () => void runPlan())

async function runPlan(): Promise<void> {
  const fromStr = fromInput.value.trim()
  const toStr = toInput.value.trim()
  const detourKm = parseFloat(detourSlider.value)
  const foodRadiusM = parseFloat(foodSlider.value)
  const vehicle = selectedVehicle()
  const chargePercent = parseInt(chargeSlider.value, 10)
  const indieOnly = indieToggle.checked

  planBtn.disabled = true
  clearAll()
  resultsDiv.innerHTML = ''
  history.replaceState(
    null,
    '',
    buildUrlSearch(fromStr, toStr, detourKm, foodRadiusM, vehicle?.id, chargePercent, indieOnly),
  )

  try {
    step('geocode')
    status('Geocoding locations…')
    const [fromCoord, toCoord] = await Promise.all([geocode(fromStr), geocode(toStr)])

    step('route')
    status('Calculating route…')
    const routeCoords = await getRoute(fromCoord, toCoord)
    const routeSampled = downsampleRoute(routeCoords, 400)

    // Draw route — colored by charge level if a vehicle is selected, plain yellow otherwise
    if (vehicle) {
      const rangeKm = effectiveRangeKm(vehicle, chargePercent)
      const cumDist = cumulativeDistancesKm(routeCoords)
      const segments = coloredRouteSegments(routeCoords, cumDist, rangeKm)
      const terminator = computeTerminator(routeCoords, cumDist, rangeKm)
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
      const displayChargers = fastOnly.length > 0 ? fastOnly : nearbyChargers

      if (displayChargers.length === 0) {
        status(`No chargers found within ${detourKm}km — try increasing detour`, 'err')
        resultsDiv.innerHTML = `<div class="empty-state"><div class="big">😞</div><div>No chargers found.<br>Try a wider detour.</div></div>`
        return
      }

      const label =
        fastOnly.length > 0
          ? `${displayChargers.length} fast charger${displayChargers.length !== 1 ? 's' : ''} found`
          : `${displayChargers.length} charger${displayChargers.length !== 1 ? 's' : ''} (slow) found`

      const vehicleLabel = vehicle
        ? ` · ${vehicle.make} ${vehicle.model} · ${effectiveRangeKm(vehicle, chargePercent).toFixed(0)}km range`
        : ''
      const cacheLabel = cached ? ' ⚡' : ''
      status(label + ' — click any to find food' + cacheLabel, 'ok')
      step('done')

      // Clear previous markers if this is a background refresh
      if (cached) {
        chargerMarkers.forEach((m) => map.removeLayer(m))
        chargerMarkers = []
        resultsDiv.innerHTML = ''
      }

      resultsDiv.innerHTML = `<div class="section-label" style="margin-bottom:10px">${label}${vehicleLabel} · ${detourKm}km detour · food within ${foodRadiusM}m</div>`

      displayChargers.forEach((c, i) => {
        const name = c.tags.name ?? c.tags.operator ?? 'Charging Station'
        const network = c.tags.network ?? c.tags.operator ?? ''
        const sockets = getChargerSockets(c.tags)

        const card = buildChargerCard(c, sockets)
        const marker = makeChargerMarker(c.lat, c.lon)
        marker.bindPopup(
          `<b>${name}</b><br>${network ? network + '<br>' : ''}` +
            `${sockets.join(' · ') || 'AC'}<br>` +
            `<i style="color:#6b7280;font-size:0.85em">Click sidebar card to find food</i>`,
        )
        setTimeout(() => {
          marker.addTo(map)
          chargerMarkers.push(marker)
        }, i * 40)

        attachFoodLoader(c, card, marker, foodRadiusM, indieOnly)
        resultsDiv.appendChild(card)
      })
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
if (urlParams.from) fromInput.value = urlParams.from
if (urlParams.to) toInput.value = urlParams.to
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
  vehicleSelect.dispatchEvent(new Event('change'))
}
if (urlParams.chargePercent !== undefined) {
  chargeSlider.value = String(urlParams.chargePercent)
  chargeVal.textContent = String(urlParams.chargePercent)
}
if (urlParams.indieOnly === false) {
  indieToggle.checked = false
}

if (urlParams.from && urlParams.to) void runPlan()
