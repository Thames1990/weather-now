import { expect, test } from '@playwright/test'

const cardTestIds = [
  'current-weather-card',
  'clothing-card',
  'weather-details-card',
  'hourly-forecast-card',
  'daily-forecast-card'
]

const chartCardTestIds = [
  'temperature-trend-card',
  'precipitation-outlook-card',
  'sun-hours-card'
]

test.describe('responsive dashboard layout', () => {
  test('renders every dashboard card with real height and no horizontal overflow', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })

    const viewport = page.viewportSize()
    expect(viewport).not.toBeNull()

    for (const testId of cardTestIds) {
      const card = page.getByTestId(testId)
      await expect(card).toBeVisible()

      const box = await card.boundingBox()
      expect(box).not.toBeNull()
      // Regression guard: cards must not collapse to zero height inside auto-sized grid rows.
      expect(box!.height).toBeGreaterThan(80)
      expect(box!.width).toBeLessThanOrEqual((viewport?.width ?? 0) - 4)
      expect(box!.x).toBeGreaterThanOrEqual(0)
    }

    const bodyScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(bodyScrollWidth).toBeLessThanOrEqual((viewport?.width ?? 0) + 2)
  })

  test('does not clip the current conditions, clothing, or overview text content', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })

    await expect(page.getByTestId('current-weather-card').getByRole('heading', { level: 2 })).toBeVisible()
    await expect(page.getByTestId('clothing-card').getByRole('heading', { level: 2 })).toBeVisible()
    await expect(page.getByTestId('weather-details-card').getByRole('heading', { level: 2 })).toBeVisible()
  })

  test('never clips a card\'s own content vertically on mobile and tablet', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })

    const viewport = page.viewportSize()
    if ((viewport?.width ?? 0) >= 1024) return

    for (const testId of cardTestIds) {
      const card = page.getByTestId(testId)
      const { scrollHeight, clientHeight } = await card.evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight
      }))
      // Regression guard: a card's rendered box must be tall enough to show all of its own content.
      expect(scrollHeight).toBeLessThanOrEqual(clientHeight + 1)
    }
  })

  test('renders the temperature, precipitation, and sun-hours charts with real height', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })

    for (const testId of chartCardTestIds) {
      const card = page.getByTestId(testId)
      await expect(card).toBeVisible()

      const box = await card.boundingBox()
      expect(box).not.toBeNull()
      // Regression guard: chart cards rely on h-full internally and previously collapsed to 0 height.
      expect(box!.height).toBeGreaterThan(80)

      const chart = card.locator('[role="img"]').first()
      await expect(chart).toBeVisible()
    }
  })

  test('keeps every navbar control reachable and inside the viewport', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })

    const viewport = page.viewportSize()
    expect(viewport).not.toBeNull()

    const navbar = page.getByTestId('app-navbar')
    await expect(navbar).toBeVisible()

    const controls = [
      navbar.getByPlaceholder(/search/i),
      navbar.getByLabel(/current location/i),
      navbar.getByLabel(/favorite cities/i),
      navbar.getByLabel(/language/i),
      navbar.getByLabel(/toggle light and dark mode/i)
    ]

    for (const control of controls) {
      await expect(control).toBeVisible()
      const box = await control.boundingBox()
      expect(box).not.toBeNull()
      // Regression guard: controls must not sit off-screen to the right when the navbar wraps.
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual((viewport?.width ?? 0) + 2)
    }

    const navbarScrollWidth = await navbar.evaluate((el) => el.scrollWidth)
    expect(navbarScrollWidth).toBeLessThanOrEqual((viewport?.width ?? 0) + 2)
  })

  test('scrolls the dashboard on small viewports and fits without scrolling on desktop', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })

    const viewport = page.viewportSize()
    expect(viewport).not.toBeNull()

    const scrollRegion = page.locator('.js-dashboard-scroll')
    await expect(scrollRegion).toBeVisible()

    const { scrollHeight, clientHeight } = await scrollRegion.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight
    }))

    if ((viewport?.width ?? 0) < 1024) {
      // Mobile/tablet: the dashboard grid is taller than the viewport, so the panel body must scroll.
      expect(scrollHeight).toBeGreaterThan(clientHeight)
    } else {
      // Desktop: the dashboard is designed to fit the viewport without internal scrolling.
      expect(scrollHeight).toBeLessThanOrEqual(clientHeight + 1)
    }
  })
})
