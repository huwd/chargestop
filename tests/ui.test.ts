import { describe, it, expect } from 'vitest'
import { renderFoodList } from '../src/ui.ts'
import type { OsmElement } from '../src/filters.ts'

const indieCafe: OsmElement = {
  id: 1,
  lat: 51.5,
  lon: -0.1,
  tags: { name: 'The Little Bean', amenity: 'cafe' },
}

const chainCafe: OsmElement = {
  id: 2,
  lat: 51.501,
  lon: -0.101,
  tags: { name: 'Starbucks', amenity: 'cafe', brand: 'Starbucks', 'brand:wikidata': 'Q37158' },
}

describe('renderFoodList', () => {
  it('renders a food item with name and distance', () => {
    const html = renderFoodList([indieCafe], [51.5, -0.1], 150, true)
    expect(html).toContain('The Little Bean')
    expect(html).toContain('0m')
  })

  it('shows no-results message in indie mode', () => {
    const html = renderFoodList([], [51.5, -0.1], 150, true)
    expect(html).toContain('No indie places')
  })

  it('shows no-results message in all-food mode', () => {
    const html = renderFoodList([], [51.5, -0.1], 150, false)
    expect(html).toContain('No food found')
    expect(html).not.toContain('indie')
  })

  it('does not show chain badge for indie items in either mode', () => {
    const htmlIndie = renderFoodList([indieCafe], [51.5, -0.1], 150, true)
    const htmlAll = renderFoodList([indieCafe], [51.5, -0.1], 150, false)
    expect(htmlIndie).not.toContain('chain')
    expect(htmlAll).not.toContain('chain')
  })

  it('shows chain badge for chain items in all-food mode', () => {
    const html = renderFoodList([chainCafe], [51.5, -0.1], 150, false)
    expect(html).toContain('chain')
    expect(html).toContain('Starbucks')
  })

  it('does not show chain badge in indie-only mode (chains are pre-filtered)', () => {
    // In indie mode the caller already filtered chains out; no badge needed
    const html = renderFoodList([chainCafe], [51.5, -0.1], 150, true)
    expect(html).not.toContain('chain')
  })
})
