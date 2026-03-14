/** Leaflet map setup and marker factories. */

import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export function initMap(elementId: string): L.Map {
  const map = L.map(elementId, { zoomControl: false }).setView([52.5, -2.5], 7)
  L.control.zoom({ position: 'bottomright' }).addTo(map)

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO',
    maxZoom: 19,
    subdomains: 'abcd',
  }).addTo(map)

  return map
}

export function makeChargerMarker(lat: number, lon: number, hasFoodNearby = false): L.Marker {
  const icon = L.divIcon({
    html: `<div class="marker-charger${hasFoodNearby ? ' has-food' : ''}">⚡</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
  return L.marker([lat, lon], { icon })
}

type FoodAmenity = 'cafe' | 'pub' | 'bar' | 'restaurant'

const FOOD_EMOJIS: Record<FoodAmenity, string> = {
  cafe: '☕',
  pub: '🍺',
  bar: '🍺',
  restaurant: '🍽️',
}

const FOOD_CLASSES: Record<FoodAmenity, string> = {
  cafe: 'marker-food-cafe',
  pub: 'marker-food-pub',
  bar: 'marker-food-pub',
  restaurant: 'marker-food-restaurant',
}

/** Animates a polyline drawing itself using SVG stroke-dashoffset. */
function animatePolyline(line: L.Polyline): void {
  line.once('add', () => {
    // Access the underlying SVG path Leaflet creates
    const el = (line as unknown as { _path?: SVGPathElement })._path
    if (!el || typeof el.getTotalLength !== 'function') return
    const len = el.getTotalLength()
    el.style.strokeDasharray = String(len)
    el.style.strokeDashoffset = String(len)
    el.classList.add('route-animate')
  })
}

export function buildRangeLayer(
  segments: import('./range.ts').RouteSegment[],
  terminator: import('./range.ts').TerminatorLine | null,
): L.FeatureGroup {
  const layers: L.Layer[] = segments.map((seg) => {
    const line = L.polyline(seg.coords as L.LatLngExpression[], {
      color: seg.color,
      weight: 4,
      opacity: 0.9,
    })
    animatePolyline(line)
    return line
  })
  if (terminator) {
    layers.push(
      L.polyline(terminator.ends as L.LatLngExpression[], {
        color: '#ef4444',
        weight: 4,
        opacity: 1,
      }),
    )
    layers.push(
      L.marker(terminator.point as L.LatLngExpression, {
        icon: L.divIcon({
          html: '<div class="range-limit-label">⚡ range limit</div>',
          className: '',
          iconSize: [110, 22],
          iconAnchor: [55, 28],
        }),
      }),
    )
  }
  return L.featureGroup(layers)
}

export function makeFoodMarker(lat: number, lon: number, amenity: string): L.Marker {
  const a = amenity as FoodAmenity
  const emoji = FOOD_EMOJIS[a] ?? '🍴'
  const cls = FOOD_CLASSES[a] ?? 'marker-food-restaurant'
  const icon = L.divIcon({
    html: `<div class="marker-food ${cls}">${emoji}</div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
  return L.marker([lat, lon], { icon })
}
