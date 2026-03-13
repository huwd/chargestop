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
