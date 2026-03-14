/** Sidebar, status bar, and mobile drawer. */

import type { OsmElement, SocketType } from './filters.ts'
import { formatCuisine, isIndieFood } from './filters.ts'
import { haversineM, type LatLon } from './geo.ts'
import { vehiclesByMake } from './data/vehicles.ts'

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

export function buildChargerCard(charger: OsmElement, sockets: SocketType[]): HTMLElement {
  const name = charger.tags.name ?? charger.tags.operator ?? 'Charging Station'
  const network = charger.tags.network ?? charger.tags.operator ?? ''
  const card = document.createElement('div')
  card.className = 'charger-card'
  card.id = `card-${charger.id}`

  const socketTags = sockets.length
    ? sockets.map(socketTag).join('')
    : '<span class="tag">AC/Unknown</span>'

  card.innerHTML = `
    <div class="charger-name">⚡ ${name}</div>
    <div class="charger-meta">
      ${network && network !== name ? `<span>${network}</span>` : ''}
      ${socketTags}
    </div>
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
