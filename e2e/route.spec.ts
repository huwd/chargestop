import { test, expect } from '@playwright/test'

test('home page renders the map and sidebar', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#sidebar')).toBeVisible()
  await expect(page.locator('#map')).toBeVisible()
})

test('waypoints list renders From and To inputs on load', async ({ page }) => {
  await page.goto('/')
  const inputs = page.locator('#waypoints-list .wp-input')
  await expect(inputs).toHaveCount(2)
  await expect(inputs.nth(0)).toHaveAttribute('placeholder', 'e.g. London')
  await expect(inputs.nth(1)).toHaveAttribute('placeholder', 'e.g. Edinburgh')
})

test('URL params pre-fill from/to inputs', async ({ page }) => {
  await page.goto('/?from=London&to=Edinburgh')
  const inputs = page.locator('#waypoints-list .wp-input')
  await expect(inputs.nth(0)).toHaveValue('London')
  await expect(inputs.nth(1)).toHaveValue('Edinburgh')
})

test('add stop button inserts a via row', async ({ page }) => {
  await page.goto('/')
  await page.locator('#add-stop-btn').click()
  const inputs = page.locator('#waypoints-list .wp-input')
  await expect(inputs).toHaveCount(3)
})

test('remove button on via row collapses back to two inputs', async ({ page }) => {
  await page.goto('/')
  await page.locator('#add-stop-btn').click()
  await page.locator('.wp-remove-btn').first().click()
  const inputs = page.locator('#waypoints-list .wp-input')
  await expect(inputs).toHaveCount(2)
})

test('reverse button swaps From and To values', async ({ page }) => {
  await page.goto('/?from=London&to=Edinburgh')
  await page.locator('#reverse-btn').click()
  const inputs = page.locator('#waypoints-list .wp-input')
  await expect(inputs.nth(0)).toHaveValue('Edinburgh')
  await expect(inputs.nth(1)).toHaveValue('London')
})

test('plan button is enabled on load', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#plan-btn')).toBeEnabled()
})

test('status bar shows initial idle message', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#status-msg')).toHaveText('Enter a route and click Plan')
})

test('mobile: drawer toggle button is visible on small viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await expect(page.locator('#drawer-toggle')).toBeVisible()
})
