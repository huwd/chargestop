/** Sidebar, status bar, and mobile drawer. */

import type { OsmElement, SocketType } from './filters.ts'
import { formatCuisine } from './filters.ts'
import { haversineM, type LatLon } from './geo.ts'

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
): string {
  if (foods.length === 0) {
    return `<div class="food-none">No indie places found within ${foodRadiusM}m — try increasing the radius</div>`
  }
  return foods
    .map((f) => {
      const name = f.tags.name ?? 'Unknown'
      const amenity = f.tags.amenity ?? ''
      const cuisine = formatCuisine(f.tags)
      const dist = Math.round(haversineM(chargerCoord, [f.lat, f.lon]))
      const emoji = FOOD_EMOJIS[amenity] ?? '🍴'
      const detail = [amenity, cuisine].filter(Boolean).join(' · ')
      return `<div class="food-item">
        <div class="food-icon">${emoji}</div>
        <div class="food-info">
          <div class="food-name">${name}</div>
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
