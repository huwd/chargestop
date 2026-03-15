/** Sidebar, status bar, and mobile drawer. */

import type { OsmElement, SocketType } from './filters.ts'
import { formatCuisine, isIndieFood } from './filters.ts'
import { haversineM, type LatLon } from './geo.ts'
import { vehiclesByMake } from './data/vehicles.ts'
import { waypointLabels, type WaypointList } from './waypoints.ts'
import { buildGoogleMapsUrl, buildAppleMapsUrl } from './share.ts'

export function populateVehiclePicker(selectEl: HTMLSelectElement): void {
  const makes = vehiclesByMake()
  for (const [make, vehicles] of makes) {
    const group = document.createElement('optgroup')
    group.label = make
    for (const v of vehicles) {
      const opt = document.createElement('option')
      opt.value = v.id
      opt.textContent = `${v.model} ${v.variant} (${v.year}) · ${v.wltpRangeKm}km · ${v.maxChargeKw}kW`
      group.appendChild(opt)
    }
    selectEl.appendChild(group)
  }
}

// ─── Plan step indicator ─────────────────────────────────────────────────────

export type PlanStep = 'geocode' | 'route' | 'chargers'

/**
 * Marks a step as active, done, or cached (instant from cache).
 * All earlier steps are automatically set to done.
 */
export function setPlanStep(
  stepsEl: HTMLElement,
  step: PlanStep | 'done' | 'idle',
  fromCache = false,
): void {
  const order: PlanStep[] = ['geocode', 'route', 'chargers']
  stepsEl.classList.toggle('visible', step !== 'idle')
  if (step === 'idle' || step === 'done') {
    order.forEach((s) => {
      const el = stepsEl.querySelector(`#step-${s}`)
      if (!el) return
      el.className = step === 'done' ? 'plan-step done' : 'plan-step'
    })
    return
  }
  const idx = order.indexOf(step)
  order.forEach((s, i) => {
    const el = stepsEl.querySelector(`#step-${s}`)
    if (!el) return
    if (i < idx) el.className = 'plan-step done'
    else if (i === idx) el.className = fromCache ? 'plan-step cached' : 'plan-step active'
    else el.className = 'plan-step'
  })
}

// ─── Status bar ──────────────────────────────────────────────────────────────

export type StatusState = 'idle' | 'active' | 'ok' | 'err'

export function setStatus(
  msgEl: HTMLElement,
  dotEl: HTMLElement,
  msg: string,
  state: StatusState = 'active',
): void {
  msgEl.textContent = msg
  dotEl.className = 'dot ' + state
}

// ─── Results cards ───────────────────────────────────────────────────────────

function socketTag(s: SocketType): string {
  const cls = s === 'CCS' ? 'ccs' : s === 'CHAdeMO' ? 'chademo' : 'tesla'
  return `<span class="tag ${cls}">${s}</span>`
}

export interface StopSocInfo {
  arrivalSocPercent: number
  departureSocPercent: number
  distanceAlongRouteKm: number
}

export function buildChargerCard(
  charger: OsmElement,
  sockets: SocketType[],
  socInfo?: StopSocInfo,
): HTMLElement {
  const name = charger.tags.name ?? charger.tags.operator ?? 'Charging Station'
  const network = charger.tags.network ?? charger.tags.operator ?? ''
  const card = document.createElement('div')
  card.className = 'charger-card'
  card.id = `card-${charger.id}`

  const socketTags = sockets.length
    ? sockets.map(socketTag).join('')
    : '<span class="tag">AC/Unknown</span>'

  const socRow = socInfo
    ? `<div class="charger-soc">
        <span class="soc-label">Arrive <b>${socInfo.arrivalSocPercent.toFixed(0)}%</b></span>
        <span class="soc-sep">→</span>
        <span class="soc-label">Depart <b>${socInfo.departureSocPercent.toFixed(0)}%</b></span>
        <span class="soc-dist">${socInfo.distanceAlongRouteKm.toFixed(0)}km along route</span>
      </div>`
    : ''

  card.innerHTML = `
    <div class="charger-name">⚡ ${name}</div>
    <div class="charger-meta">
      ${network && network !== name ? `<span>${network}</span>` : ''}
      ${socketTags}
      <button class="add-to-route-btn" data-charger-id="${charger.id}" title="Add as waypoint">+ route</button>
    </div>
    ${socRow}
    <div class="food-list" id="food-${charger.id}">
      <div class="food-searching">Click to search nearby food…</div>
    </div>`
  return card
}

const FOOD_EMOJIS: Record<string, string> = {
  cafe: '☕',
  pub: '🍺',
  bar: '🍺',
  restaurant: '🍽️',
}

export function renderFoodList(
  foods: OsmElement[],
  chargerCoord: LatLon,
  foodRadiusM: number,
  indieOnly: boolean,
): string {
  if (foods.length === 0) {
    const msg = indieOnly
      ? `No indie places found within ${foodRadiusM}m — try increasing the radius`
      : `No food found within ${foodRadiusM}m — try increasing the radius`
    return `<div class="food-none">${msg}</div>`
  }
  return foods
    .map((f) => {
      const name = f.tags.name ?? 'Unknown'
      const amenity = f.tags.amenity ?? ''
      const cuisine = formatCuisine(f.tags)
      const dist = Math.round(haversineM(chargerCoord, [f.lat, f.lon]))
      const emoji = FOOD_EMOJIS[amenity] ?? '🍴'
      const detail = [amenity, cuisine].filter(Boolean).join(' · ')
      const chainBadge =
        !indieOnly && !isIndieFood(f) ? ' <span class="tag chain">chain</span>' : ''
      return `<div class="food-item">
        <div class="food-icon">${emoji}</div>
        <div class="food-info">
          <div class="food-name">${name}${chainBadge}</div>
          <div class="food-detail">${detail}</div>
        </div>
        <div class="dist-badge">${dist}m</div>
      </div>`
    })
    .join('')
}

// ─── Waypoint list UI ────────────────────────────────────────────────────────

/**
 * Renders the waypoint list into `container`, wiring all interactive events.
 *
 * Callbacks:
 *   onInputChange(idx, value) — user typed in an input
 *   onRemove(idx)             — user clicked ×
 *   onChargeChange(legIdx, value) — user moved a per-leg charge slider
 *   onDrop(fromIdx, toIdx)    — drag-drop reorder
 */
export function renderWaypointList(
  container: HTMLElement,
  wl: WaypointList,
  showCharge: boolean,
  callbacks: {
    onInputChange: (idx: number, value: string) => void
    onRemove: (idx: number) => void
    onChargeChange: (legIdx: number, value: number) => void
    onDrop: (fromIdx: number, toIdx: number) => void
  },
): void {
  container.innerHTML = ''
  const labels = waypointLabels(wl)
  let dragFrom = -1

  wl.places.forEach((place, i) => {
    const isVia = i > 0 && i < wl.places.length - 1

    const row = document.createElement('div')
    row.className = 'waypoint-row'
    row.draggable = true
    row.dataset.idx = String(i)

    const handle = document.createElement('span')
    handle.className = 'wp-drag-handle'
    handle.textContent = '⠿'
    handle.title = 'Drag to reorder'

    const label = document.createElement('span')
    label.className = 'wp-label'
    label.textContent = labels[i]

    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'wp-input'
    input.value = place
    input.placeholder =
      i === 0 ? 'e.g. London' : i === wl.places.length - 1 ? 'e.g. Edinburgh' : 'via…'
    input.addEventListener('input', () => callbacks.onInputChange(i, input.value))

    row.appendChild(handle)
    row.appendChild(label)
    row.appendChild(input)

    if (isVia) {
      const removeBtn = document.createElement('button')
      removeBtn.className = 'wp-remove-btn'
      removeBtn.textContent = '×'
      removeBtn.title = 'Remove stop'
      removeBtn.addEventListener('click', () => callbacks.onRemove(i))
      row.appendChild(removeBtn)
    } else {
      // Spacer to keep alignment consistent
      const spacer = document.createElement('span')
      spacer.style.width = '22px'
      spacer.style.flexShrink = '0'
      row.appendChild(spacer)
    }

    // Drag-drop handlers
    row.addEventListener('dragstart', () => {
      dragFrom = i
      setTimeout(() => row.classList.add('dragging'), 0)
    })
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging')
      container.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))
    })
    row.addEventListener('dragover', (e) => {
      e.preventDefault()
      container.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))
      row.classList.add('drag-over')
    })
    row.addEventListener('drop', (e) => {
      e.preventDefault()
      row.classList.remove('drag-over')
      if (dragFrom !== -1 && dragFrom !== i) {
        callbacks.onDrop(dragFrom, i)
        dragFrom = -1
      }
    })

    container.appendChild(row)

    // Per-leg charge slider for each leg origin (all places except the last)
    if (showCharge && i < wl.places.length - 1) {
      const chargeRow = document.createElement('div')
      chargeRow.className = 'wp-charge-row'
      const pct = wl.chargePercents[i] ?? 100
      chargeRow.innerHTML = `
        <label>Charge: <span id="wp-charge-val-${i}">${pct}</span>%</label>
        <input type="range" min="10" max="100" step="5" value="${pct}"
               class="wp-charge-slider" data-leg="${i}">
      `
      const slider = chargeRow.querySelector('input') as HTMLInputElement
      const valSpan = chargeRow.querySelector(`#wp-charge-val-${i}`) as HTMLElement
      slider.addEventListener('input', () => {
        valSpan.textContent = slider.value
        callbacks.onChargeChange(i, parseInt(slider.value, 10))
      })
      container.appendChild(chargeRow)
    }
  })
}

// ─── Share bar ───────────────────────────────────────────────────────────────

/**
 * Populates the share bar with copy-link, optional native share, Google Maps,
 * and Apple Maps buttons. All browser-API calls (clipboard, share, open) are
 * passed in as callbacks so this remains unit-testable.
 */
export function renderShareBar(
  container: HTMLElement,
  places: string[],
  url: string,
  title: string,
  isMultiLeg: boolean,
  callbacks: {
    onCopy: (url: string, btn: HTMLButtonElement) => void
    onShare?: (title: string, url: string) => void
    onAppleToast?: () => void
  },
): void {
  container.innerHTML = ''
  container.removeAttribute('hidden')

  const copyBtn = document.createElement('button')
  copyBtn.className = 'share-btn'
  copyBtn.textContent = '🔗 Copy link'
  copyBtn.addEventListener('click', () => callbacks.onCopy(url, copyBtn))
  container.appendChild(copyBtn)

  if (callbacks.onShare) {
    const shareBtn = document.createElement('button')
    shareBtn.className = 'share-btn'
    shareBtn.textContent = '↗ Share'
    shareBtn.addEventListener('click', () => callbacks.onShare!(title, url))
    container.appendChild(shareBtn)
  }

  const from = places[0] ?? ''
  const to = places[places.length - 1] ?? ''
  const vias = places.slice(1, -1)

  const gBtn = document.createElement('button')
  gBtn.className = 'share-btn'
  gBtn.textContent = '↗ Google Maps'
  gBtn.addEventListener('click', () => {
    window.open(buildGoogleMapsUrl(from, to, vias), '_blank', 'noopener')
  })
  container.appendChild(gBtn)

  const aBtn = document.createElement('button')
  aBtn.className = 'share-btn'
  aBtn.textContent = '↗ Apple Maps'
  aBtn.addEventListener('click', () => {
    if (isMultiLeg && callbacks.onAppleToast) callbacks.onAppleToast()
    window.open(buildAppleMapsUrl(from, to), '_blank', 'noopener')
  })
  container.appendChild(aBtn)
}

// ─── Mobile drawer ───────────────────────────────────────────────────────────

export function initDrawer(
  sidebar: HTMLElement,
  toggleBtn: HTMLElement,
  header: HTMLElement,
  isMobile: () => boolean,
): void {
  function open(): void {
    sidebar.classList.add('open')
    toggleBtn.classList.add('open')
    toggleBtn.textContent = '✕ Close'
  }

  function close(): void {
    sidebar.classList.remove('open')
    toggleBtn.classList.remove('open')
    toggleBtn.innerHTML = '⚡ ChargeStop'
  }

  function toggle(): void {
    if (sidebar.classList.contains('open')) close()
    else open()
  }

  toggleBtn.addEventListener('click', toggle)
  header.addEventListener('click', () => {
    if (isMobile()) toggle()
  })

  // Swipe-to-close
  let touchStartY = 0
  sidebar.addEventListener(
    'touchstart',
    (e) => {
      touchStartY = e.touches[0].clientY
    },
    { passive: true },
  )
  sidebar.addEventListener(
    'touchend',
    (e) => {
      if (e.changedTouches[0].clientY - touchStartY > 60 && isMobile()) close()
    },
    { passive: true },
  )
}
