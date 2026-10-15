/** CARTO basemap tile URL. The API key is injected at build time (VITE_CARTO_API_KEY). */

export function tileUrl(apiKey: string): string {
  return `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${encodeURIComponent(apiKey)}`
}
