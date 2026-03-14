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

describe('renderFoodList — toggle between indie and all-food', () => {
  it('re-rendering with indieOnly=false shows the chain badge', () => {
    // First render: indie mode — chain was filtered out upstream, only indie shown
    const htmlIndie = renderFoodList([indieCafe], [51.5, -0.1], 150, true)
    expect(htmlIndie).not.toContain('chain')

    // After toggle: all-food mode — chain now appears with badge
    const htmlAll = renderFoodList([indieCafe, chainCafe], [51.5, -0.1], 150, false)
    expect(htmlAll).toContain('Starbucks')
    expect(htmlAll).toContain('chain')
  })

  it('switching to indie mode with no indie results shows the indie empty message', () => {
    // Only chains available in the raw Overpass data
    const htmlIndie = renderFoodList([], [51.5, -0.1], 150, true)
    expect(htmlIndie).toContain('No indie places found')
    expect(htmlIndie).toContain('150m')
  })

  it('switching to all-food mode with chains shows results not empty state', () => {
    const htmlAll = renderFoodList([chainCafe], [51.5, -0.1], 150, false)
    expect(htmlAll).toContain('Starbucks')
    // No empty state message
    expect(htmlAll).not.toContain('No food found')
  })

  it('status label uses "indie place" in indie mode', () => {
    // The status bar label is built in main.ts; renderFoodList itself just renders items.
    // Verify the placeLabel logic via the empty message wording as a proxy.
    const html = renderFoodList([], [51.5, -0.1], 300, true)
    expect(html).toContain('indie')
  })

  it('status label does not mention indie in all-food mode', () => {
    const html = renderFoodList([], [51.5, -0.1], 300, false)
    expect(html).not.toContain('indie')
  })
})
