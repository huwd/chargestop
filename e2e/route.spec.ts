import { test, expect } from '@playwright/test'

test('home page renders the map and sidebar', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#sidebar')).toBeVisible()
  await expect(page.locator('#map')).toBeVisible()
  await expect(page.locator('#from-input')).toHaveValue('Luton, UK')
  await expect(page.locator('#to-input')).toHaveValue('Newquay, UK')
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
