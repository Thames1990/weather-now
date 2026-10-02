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

const chartHourlyTimes = Array.from({ length: 8 }, (_, index) => `2026-10-02T${String(10 + index).padStart(2, '0')}:00`)
const chartWeatherResponse = {
  timezone: 'UTC',
  current: {
    time: chartHourlyTimes[0],
    temperature_2m: 18,
    relative_humidity_2m: 68,
    apparent_temperature: 18,
    is_day: 1,
    precipitation: 0,
    weather_code: 1,
    wind_speed_10m: 5,
    wind_direction_10m: 0
  },
  hourly: {
    time: chartHourlyTimes,
    temperature_2m: [18, 19, 19, 20, 20, 20, 19, 18],
    precipitation_probability: Array(8).fill(0),
    precipitation: Array(8).fill(0),
    weather_code: Array(8).fill(1)
  },
  daily: {
    time: ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'],
    weather_code: Array(7).fill(1),
    temperature_2m_max: Array(7).fill(20),
    temperature_2m_min: Array(7).fill(12),
    precipitation_probability_max: Array(7).fill(0),
    precipitation_sum: Array(7).fill(0),
    sunshine_duration: Array(7).fill(28800),
    sunrise: Array(7).fill('2026-10-02T07:00'),
    sunset: Array(7).fill('2026-10-02T19:00')
  }
}

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
    await page.route('**/api/weather**', (route) => route.fulfill({ json: chartWeatherResponse }))
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

    const temperatureChart = page.getByTestId('temperature-trend-card').getByRole('img')
    const temperatureChartBox = await temperatureChart.boundingBox()
    expect(temperatureChartBox).not.toBeNull()

    const markers = page.getByTestId('line-chart-marker')
    const markerGeometry = await markers.evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect()
      const style = (element as HTMLElement).style
      return {
        left: Number.parseFloat(style.left),
        top: Number.parseFloat(style.top),
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height
      }
    }))

    expect(markerGeometry.length).toBeGreaterThan(0)
    for (const marker of markerGeometry) {
      expect(Math.abs(marker.width - marker.height)).toBeLessThan(0.1)
      expect(Math.abs(marker.centerX - (temperatureChartBox!.x + temperatureChartBox!.width * marker.left / 100))).toBeLessThan(1)
      expect(Math.abs(marker.centerY - (temperatureChartBox!.y + temperatureChartBox!.height * marker.top / 100))).toBeLessThan(1)
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
