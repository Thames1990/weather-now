import { expect, test } from '@playwright/test'
import type { WeatherResponse } from '../../shared/weather/types'

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

const chartHourlyTimes = Array.from({ length: 13 }, (_, index) => `2026-10-02T${String(10 + index).padStart(2, '0')}:00`)
const chartWeatherResponse: WeatherResponse = {
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
    temperature_2m: Array.from({ length: 13 }, (_, index) => 18 + index % 3),
    apparent_temperature: Array.from({ length: 13 }, (_, index) => 18 + index % 3),
    wind_speed_10m: Array(13).fill(5),
    precipitation_probability: Array(13).fill(0),
    precipitation: Array(13).fill(0),
    weather_code: Array(13).fill(1)
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

test.describe('settled dashboard reveal', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('weather-now:language', JSON.stringify('en'))
    })
  })

  test('skips the loading icon and message on fast loads', async ({ page }) => {
    await page.addInitScript(() => {
      new MutationObserver(() => {
        if (document.querySelector('[role="status"]')) {
          document.documentElement.dataset.startupLoaderShown = 'true'
        }
      }).observe(document, { childList: true, subtree: true })
    })
    await page.route('**/api/weather**', route => route.fulfill({ json: chartWeatherResponse }))
    await page.goto('/')
    await expect(page.getByTestId('app-navbar')).toBeVisible()
    await expect(page.getByRole('status')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.dataset.startupLoaderShown)).toBeUndefined()
  })

  test('keeps setup hidden, then reveals all cards without independent animations or layout shifts', async ({ page }) => {
    let releaseForecast!: () => void
    const forecastReady = new Promise<void>((resolve) => { releaseForecast = resolve })
    await page.route('**/api/weather**', async (route) => {
      await forecastReady
      await route.fulfill({ json: chartWeatherResponse })
    })
    await page.goto('/')

    await expect(page.getByRole('status')).toHaveText('Preparing your forecast...')
    await expect(page.getByTestId('app-navbar')).toBeHidden()
    for (const testId of [...cardTestIds, ...chartCardTestIds]) {
      await expect(page.getByTestId(testId)).toBeHidden()
    }

    releaseForecast()
    await expect(page.getByRole('status')).toBeHidden()
    await expect(page.getByTestId('app-navbar')).toBeVisible()
    const cards = [...cardTestIds, ...chartCardTestIds].map(testId => page.getByTestId(testId))
    for (const card of cards) await expect(card).toBeVisible()
    await expect(page.getByTestId('daily-forecast-card').getByRole('row').filter({
      has: page.getByRole('cell', { name: '20° / 12°', exact: true })
    })).toHaveCount(7)
    await expect(page.getByTestId('temperature-trend-card').getByRole('img')).toBeVisible()
    expect(await page.evaluate(() => document.fonts.status)).toBe('loaded')

    const before = await Promise.all(cards.map(card => card.boundingBox()))
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }))
    const after = await Promise.all(cards.map(card => card.boundingBox()))
    expect(after).toEqual(before)
    for (const card of cards) {
      const animatedChildren = await card.evaluate(element =>
        [...element.querySelectorAll('*')].filter(child => getComputedStyle(child).animationName !== 'none').length)
      expect(animatedChildren).toBe(0)
    }
  })

  test('reveals a failed forecast and keeps the dashboard visible during retry', async ({ page }) => {
    let releaseRetry!: () => void
    const retryReady = new Promise<void>((resolve) => { releaseRetry = resolve })
    let requests = 0
    await page.route('**/api/weather**', async (route) => {
      if (++requests === 1) {
        await route.fulfill({ status: 400, json: { message: 'Forecast unavailable' } })
        return
      }
      await retryReady
      await route.fulfill({ json: chartWeatherResponse })
    })
    await page.goto('/')

    const current = page.getByTestId('current-weather-card')
    await expect(current.getByText('Forecast unavailable', { exact: true })).toBeVisible()
    await expect(page.getByRole('status')).toBeHidden()
    await current.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect.poll(() => requests).toBe(2)
    await expect(page.getByTestId('app-navbar')).toBeVisible()
    await expect(current).toBeVisible()
    await expect(page.getByRole('status')).toBeHidden()
    releaseRetry()
    await expect(current.getByText('18°', { exact: true })).toBeVisible()
  })

  test('uses no reveal transition with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.route('**/api/weather**', route => route.fulfill({ json: chartWeatherResponse }))
    await page.goto('/')
    await expect(page.getByTestId('app-navbar')).toBeVisible()
    const transition = await page.getByTestId('app-navbar').evaluate((navbar) => {
      const dashboard = navbar.closest('.wn-dashboard')
      if (!dashboard) throw new Error('Dashboard container not found')
      return getComputedStyle(dashboard).transitionDuration
    })
    expect(transition).toBe('0s')
  })
})

test.describe('responsive dashboard layout', () => {
  test('aligns chart labels with points and keeps hourly text separated at medium widths and zoom', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop-chrome')
    await page.route('**/api/weather**', route => route.fulfill({ json: chartWeatherResponse }))

    for (const language of ['en', 'de']) {
      await page.goto('/')
      await page.evaluate(language => localStorage.setItem('weather-now:language', JSON.stringify(language)), language)
      await page.reload()
      await expect(page.getByTestId('line-chart-label')).toHaveCount(13)

      for (const width of [390, 768, 1024, 1280, 1920]) {
        await page.setViewportSize({ width, height: 1000 })
        await page.evaluate(() => { document.documentElement.style.zoom = '1.5' })
        const alignment = await page.getByTestId('temperature-trend-card').evaluate((card) => {
          const markers = [...card.querySelectorAll('[data-testid="line-chart-marker"]')]
          const labels = [...card.querySelectorAll('[data-testid="line-chart-label"]')]
          return markers.map((marker, index) => {
            const dot = marker.getBoundingClientRect()
            const label = labels[index]!.getBoundingClientRect()
            return Math.abs(dot.x + dot.width / 2 - label.x - label.width / 2)
          })
        })
        expect(Math.max(...alignment)).toBeLessThan(1)

        for (const [cardId, labelId, scrollId] of [
          ['temperature-trend-card', 'line-chart-label', 'line-chart-scroll'],
          ['precipitation-outlook-card', 'bar-chart-label', 'bar-chart-scroll']
        ]) {
          const card = page.getByTestId(cardId!)
          const textBounds = await card.getByTestId(labelId!).evaluateAll(elements => elements.map((element) => {
            const range = document.createRange()
            range.selectNodeContents(element)
            const rect = range.getBoundingClientRect()
            return { left: rect.left, right: rect.right, height: rect.height }
          }))
          expect(textBounds).toHaveLength(13)
          for (let index = 1; index < textBounds.length; index++) {
            expect(textBounds[index]!.left - textBounds[index - 1]!.right).toBeGreaterThan(2)
          }
          const scroll = card.getByTestId(scrollId!)
          await scroll.evaluate(element => { element.scrollLeft = element.scrollWidth })
          const lastVisible = await scroll.evaluate((element) => {
            const label = element.querySelectorAll('[data-testid$="chart-label"]')
            const last = label[label.length - 1]!.getBoundingClientRect()
            const area = element.getBoundingClientRect()
            return last.right <= area.right + 1 && last.left >= area.left - 1 && last.bottom <= area.bottom
          })
          expect(lastVisible).toBe(true)
        }
      }
    }
  })

  test('keeps all hourly points reachable on narrow screens without page overflow', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) > 700)
    await page.route('**/api/weather**', route => route.fulfill({ json: chartWeatherResponse }))
    await page.goto('/', { waitUntil: 'networkidle' })

    const card = page.getByTestId('hourly-forecast-card')
    await expect(card.getByTestId('hourly-forecast-item')).toHaveCount(13)
    const scrollArea = card.locator('[data-slot="body"]')
    const initial = await scrollArea.evaluate(element => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth
    }))
    expect(initial.scrollWidth).toBeGreaterThan(initial.clientWidth)

    await scrollArea.evaluate(element => { element.scrollLeft = element.scrollWidth })
    const lastItemVisible = await scrollArea.evaluate((element) => {
      const lastItem = element.querySelector('[data-testid="hourly-forecast-item"]:last-child')
      if (!lastItem) return false
      const area = element.getBoundingClientRect()
      const item = lastItem.getBoundingClientRect()
      return item.right <= area.right + 1 && item.left >= area.left - 1
    })
    expect(lastItemVisible).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 2)
  })

  test('distributes content across the daily forecast, clothing, and conditions cards', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop-chrome')
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.route('**/api/weather**', route => route.fulfill({ json: chartWeatherResponse }))
    await page.goto('/', { waitUntil: 'networkidle' })

    const dailyRows = await page.getByTestId('daily-forecast-table').getByRole('row').filter({
      has: page.getByRole('cell')
    }).evaluateAll((elements) =>
      elements.map(element => element.getBoundingClientRect().height)
    )
    expect(dailyRows).toHaveLength(7)
    expect(Math.max(...dailyRows) - Math.min(...dailyRows)).toBeLessThan(2)

    const conditionRows = await page.getByTestId('weather-details-card').getByTestId('weather-detail-row').evaluateAll((elements) =>
      elements.map(element => element.getBoundingClientRect().height)
    )
    expect(conditionRows).toHaveLength(6)
    expect(Math.max(...conditionRows) - Math.min(...conditionRows)).toBeLessThan(2)

    const clothingSummary = await page.getByTestId('clothing-summary').boundingBox()
    const clothingPieces = await page.getByTestId('clothing-pieces').boundingBox()
    expect(clothingSummary).not.toBeNull()
    expect(clothingPieces).not.toBeNull()
    expect(clothingPieces!.y - (clothingSummary!.y + clothingSummary!.height)).toBeGreaterThan(24)
  })

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

  test('keeps the responsive navbar uncluttered and all controls reachable', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })

    const navbar = page.getByTestId('app-navbar')
    const picker = navbar.getByRole('button', { name: 'Search and saved cities', exact: true })
      .or(navbar.getByRole('combobox', { name: 'Search a city', exact: true }))
    const location = navbar.getByLabel(/current location/i)
    await expect(navbar.getByRole('heading', { level: 1, name: 'Weather Now' })).toBeVisible()

    for (const width of [360, 390, 768, 1024]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(navbar).toBeVisible()
      await expect(picker).toBeVisible()
      await expect(location).toBeVisible()

      const controls = [picker, location]
      if (width < 1024) {
        const settings = navbar.getByLabel('Settings')
        await expect(settings).toBeVisible()
        controls.push(settings)

        if (test.info().project.name === 'desktop-chrome') {
          await location.focus()
          await page.keyboard.press('Tab')
          await expect(settings).toBeFocused()
          await page.keyboard.press('Tab')
          await expect(picker).toBeFocused()
        }

        await settings.focus()
        await settings.press('Enter')
        const language = page.getByRole('combobox', { name: 'Language' }).filter({ visible: true })
        const theme = page.getByRole('group', { name: 'Theme' }).filter({ visible: true })
        await expect(language).toBeVisible()
        await expect(theme).toBeVisible()
        if (width === 360) {
          await expect(theme.getByRole('radio', { name: 'System' })).toBeChecked()
        }
        controls.push(language, theme)
      } else {
        await expect(navbar.getByLabel('Language')).toBeVisible()
        await expect(navbar.getByRole('group', { name: 'Theme' })).toBeVisible()
        await expect(navbar.getByLabel('Settings')).toBeHidden()
        const savedCities = navbar.getByRole('button', { name: 'Saved cities', exact: true })
        await expect(savedCities).toBeVisible()
        controls.push(savedCities, navbar.getByLabel('Language'), navbar.getByRole('group', { name: 'Theme' }))
      }

      for (const control of controls) {
        const box = await control.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width).toBeLessThanOrEqual(width + 2)
        if (width <= 1024) {
          expect(box!.width).toBeGreaterThanOrEqual(44)
          expect(box!.height, `${await control.getAttribute('aria-label')} at ${width}px`).toBeGreaterThanOrEqual(44)
        }
      }

      const iconControls = width < 1024
        ? [location, navbar.getByLabel('Settings')]
        : [location]
      for (const control of iconControls) {
        const offset = await control.evaluate((button) => {
          const icon = [...button.querySelectorAll('span')].find(element => element.getBoundingClientRect().width > 0)
          if (!icon) throw new Error('Visible button icon not found')
          const buttonBox = button.getBoundingClientRect()
          const iconBox = icon.getBoundingClientRect()
          return Math.abs(iconBox.x + iconBox.width / 2 - buttonBox.x - buttonBox.width / 2)
        })
        expect(offset).toBeLessThan(1)
      }

      if (width < 1024) {
        await expect(picker).toBeVisible()
        const brandBox = await navbar.getByText('Weather Now').boundingBox()
        const locationBox = await location.boundingBox()
        const searchBox = await picker.boundingBox()
        expect(brandBox).not.toBeNull()
        expect(locationBox).not.toBeNull()
        expect(searchBox).not.toBeNull()
        const brandCenterY = brandBox!.y + brandBox!.height / 2
        const actionsCenterY = locationBox!.y + locationBox!.height / 2
        expect(Math.abs(brandCenterY - actionsCenterY)).toBeLessThan(2)
        expect(searchBox!.y).toBeGreaterThan(locationBox!.y)
        await page.keyboard.press('Escape')
        if (test.info().project.name === 'desktop-chrome') {
          await expect(navbar.getByLabel('Settings')).toBeFocused()
        }
      } else {
        const brandBox = await navbar.getByText('Weather Now').boundingBox()
        const searchBox = await picker.boundingBox()
        const locationBox = await location.boundingBox()
        expect(brandBox).not.toBeNull()
        expect(searchBox).not.toBeNull()
        expect(locationBox).not.toBeNull()
        const brandCenterY = brandBox!.y + brandBox!.height / 2
        const searchCenterY = searchBox!.y + searchBox!.height / 2
        const actionsCenterY = locationBox!.y + locationBox!.height / 2
        expect(Math.abs(brandCenterY - searchCenterY)).toBeLessThan(2)
        expect(Math.abs(searchCenterY - actionsCenterY)).toBeLessThan(2)
      }

      const navbarScrollWidth = await navbar.evaluate((el) => el.scrollWidth)
      const navbarClientWidth = await navbar.evaluate((el) => el.clientWidth)
      expect(navbarScrollWidth).toBeLessThanOrEqual(navbarClientWidth + 1)
    }

    await page.setViewportSize({ width: 390, height: 844 })
    await navbar.getByLabel(/^(Settings|Einstellungen)$/).click()
    const language = page.getByRole('combobox', { name: 'Language' }).filter({ visible: true })
    await language.click()
    await page.getByRole('option', { name: 'DE' }).click()
    await expect(navbar.getByRole('button', { name: 'Suche und gespeicherte Orte' })).toBeVisible()

    const theme = page.getByRole('group', { name: 'Darstellung' }).filter({ visible: true })
    await page.emulateMedia({ colorScheme: 'dark' })
    await theme.getByText('Dunkel', { exact: true }).click()
    await expect(theme.getByRole('radio', { name: 'Dunkel', exact: true })).toBeChecked()
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true)
    await theme.getByText('System', { exact: true }).click()
    await expect(theme.getByRole('radio', { name: 'System', exact: true })).toBeChecked()
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true)
    await page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false)
    await page.reload({ waitUntil: 'networkidle' })
    await expect(navbar.getByRole('button', { name: 'Suche und gespeicherte Orte' })).toBeVisible()
    await navbar.getByLabel(/^(Settings|Einstellungen)$/).click()
    await expect(page.getByRole('group', { name: 'Darstellung' }).getByRole('radio', { name: 'System', exact: true })).toBeChecked()
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false)
  })

  test('uses page scrolling outside the dense dashboard and keeps all content reachable', async ({ page }) => {
    await page.route('**/api/weather**', route => route.fulfill({ json: chartWeatherResponse }))
    await page.goto('/', { waitUntil: 'networkidle' })

    const viewport = page.viewportSize()
    expect(viewport).not.toBeNull()

    const scrollRegion = page.locator('.js-dashboard-scroll')
    await expect(scrollRegion).toBeVisible()

    const geometry = await scrollRegion.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      pageHeight: document.documentElement.scrollHeight,
      position: getComputedStyle(el.closest('.wn-dashboard')!).position
    }))

    if (viewport!.width < 1280 || viewport!.height < 896) {
      expect(geometry.position).toBe('relative')
      expect(geometry.pageHeight).toBeGreaterThan(viewport!.height)
    } else {
      expect(geometry.position).toBe('fixed')
      expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight + 1)
    }

    const lastCard = page.getByTestId('sun-hours-card')
    await lastCard.scrollIntoViewIfNeeded()
    await expect(lastCard).toBeInViewport()
  })
})

test.describe('device orientation regressions', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const labels = {
        en: { name: 'Frankfurt am Main', country: 'Germany', admin1: 'Hesse' },
        de: { name: 'Frankfurt am Main', country: 'Deutschland', admin1: 'Hessen' }
      }
      const location = { id: 2925533, ...labels.en, latitude: 50.1155, longitude: 8.6842, timezone: 'Europe/Berlin', labels }
      localStorage.setItem('weather-now:last-location', JSON.stringify(location))
      const favorites = Array.from({ length: 12 }, (_, index) => ({
        ...location,
        id: location.id + index,
        latitude: location.latitude + index,
        labels: Object.fromEntries(Object.entries(labels).map(([language, label]) => [
          language, { ...label, name: index ? `${label.name} ${index + 1}` : label.name }
        ]))
      }))
      localStorage.setItem('weather-now:favorites', JSON.stringify(favorites))
      // Nuxt DevTools is not part of the production layout.
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style')
        style.textContent = '#nuxt-devtools-container { display: none !important; }'
        document.head.append(style)
      })
    })
    await page.route('**/api/weather**', route => route.fulfill({
      json: {
        ...chartWeatherResponse,
        hourly: {
          ...chartWeatherResponse.hourly,
          temperature_2m: [-20, 0, 8, 30, 25, -8, 20, 12, -10, 0, 30, 20, -20]
        }
      }
    }))
  })

  for (const language of ['en', 'de']) {
    test(`fits cards, labels, and controls through phone/tablet rotation (${language})`, async ({ page }) => {
      test.skip(!['desktop-chrome', 'iphone-15-pro'].includes(test.info().project.name), 'Chromium and WebKit viewport matrix')
      await page.addInitScript(language => localStorage.setItem('weather-now:language', JSON.stringify(language)), language)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('/')
      await expect(page.getByTestId('line-chart-value')).toHaveCount(13)

      for (const viewport of [
        { width: 412, height: 915 }, // Pixel 7 portrait
        { width: 915, height: 412 },
        { width: 412, height: 915 },
        { width: 834, height: 1194 }, // 11-inch iPad portrait
        { width: 1194, height: 834 },
        { width: 834, height: 1194 },
        { width: 1024, height: 1366 }, // larger portrait tablet still uses the drawer
        { width: 1180, height: 820 }, // landscape iPad Air
        { width: 1024, height: 400 }, // short, wide viewport
        { width: 1280, height: 720 },
        { width: 1280, height: 896 }, // dense layout boundary
        { width: 1440, height: 1000 },
        { width: 320, height: 568 }
      ]) {
        await page.setViewportSize(viewport)
        const cards = [...cardTestIds, ...chartCardTestIds]
        const geometry = await page.locator('.js-dashboard-scroll').evaluate((grid, ids) => {
          const boxes = ids.map((id) => {
            const card = grid.querySelector<HTMLElement>(`[data-testid="${id}"]`)!
            const rect = card.getBoundingClientRect()
            return { id, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height, clipped: card.scrollHeight - card.clientHeight }
          })
          return {
            boxes,
            position: getComputedStyle(grid.closest('.wn-dashboard')!).position,
            columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
            pageWidth: document.documentElement.scrollWidth
          }
        }, cards)
        expect(geometry.pageWidth, JSON.stringify(viewport)).toBeLessThanOrEqual(viewport.width + 1)
        const dense = viewport.width >= 1280 && viewport.height >= 896
        expect(geometry.position).toBe(dense ? 'fixed' : 'relative')
        expect(geometry.columns).toBe(dense ? 12 : viewport.width >= 768 ? 2 : 1)
        for (const [index, box] of geometry.boxes.entries()) {
          expect(box.height, box.id).toBeGreaterThan(80)
          expect(box.clipped, `${box.id} at ${JSON.stringify(viewport)}`).toBeLessThanOrEqual(1)
          expect(box.left).toBeGreaterThanOrEqual(0)
          expect(box.right).toBeLessThanOrEqual(viewport.width)
          for (const other of geometry.boxes.slice(index + 1)) {
            const overlap = Math.min(box.right, other.right) - Math.max(box.left, other.left) > 1
              && Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) > 1
            expect(overlap, `${box.id} overlaps ${other.id}`).toBe(false)
          }
        }

        const chart = page.getByTestId('line-chart-scroll')
        await chart.scrollIntoViewIfNeeded()
        const labelBounds = await chart.evaluate((element) => {
          const bounds = element.getBoundingClientRect()
          return [...element.querySelectorAll('[data-testid="line-chart-value"]')].map((label) => {
            const range = document.createRange()
            range.selectNodeContents(label)
            const text = range.getBoundingClientRect()
            return { top: text.top - bounds.top, bottom: bounds.bottom - text.bottom }
          })
        })
        for (const bounds of labelBounds) {
          expect(bounds.top, `Value clipped above chart at ${JSON.stringify(viewport)}`).toBeGreaterThanOrEqual(0)
          expect(bounds.bottom).toBeGreaterThanOrEqual(0)
        }
        await chart.evaluate(element => { element.scrollLeft = element.scrollWidth })
        const lastLabel = await chart.evaluate((element) => {
          const bounds = element.getBoundingClientRect()
          const last = [...element.querySelectorAll('[data-testid="line-chart-value"]')].at(-1)!.getBoundingClientRect()
          return last.left >= bounds.left && last.right <= bounds.right
        })
        expect(lastLabel).toBe(true)
        await page.getByTestId('sun-hours-card').scrollIntoViewIfNeeded()
        await expect(page.getByTestId('sun-hours-card')).toBeInViewport()

        await page.evaluate(() => window.scrollTo(0, 0))
        const navbar = page.getByTestId('app-navbar')
        await expect(navbar).toBeInViewport()
        const toolbar = viewport.width >= 1024 && viewport.height >= 496 && viewport.width > viewport.height
        const picker = navbar.getByRole(toolbar ? 'combobox' : 'button', {
          name: language === 'en'
            ? toolbar ? 'Search a city' : 'Search and saved cities'
            : toolbar ? 'Stadt suchen' : 'Suche und gespeicherte Orte',
          exact: true
        })
        await expect(picker).toBeVisible()
        const navbarBox = await navbar.boundingBox()
        if (viewport.width > viewport.height && viewport.height <= 480) {
          expect(navbarBox!.height).toBeLessThanOrEqual(64)
        }
        const controls = [
          picker,
          navbar.getByRole('button', { name: language === 'en' ? 'Use my current location' : 'Meinen Standort verwenden', exact: true })
        ]
        if (!toolbar) controls.push(navbar.getByRole('button', { name: language === 'en' ? 'Settings' : 'Einstellungen', exact: true }))
        for (const control of controls) {
          const box = await control.boundingBox()
          expect(box).not.toBeNull()
          expect(box!.width).toBeGreaterThanOrEqual(44)
          expect(box!.height).toBeGreaterThanOrEqual(44)
          expect(box!.x).toBeGreaterThanOrEqual(0)
          expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
        }
      }
      expect(errors).toEqual([])
    })
  }

  test('fills portrait drawer width, scrolls in landscape, and restores focus after closing', async ({ page }) => {
    test.skip(!['desktop-chrome', 'iphone-15-pro'].includes(test.info().project.name), 'Chromium and WebKit drawer checks')
    await page.addInitScript(() => localStorage.setItem('weather-now:language', JSON.stringify('en')))
    await page.goto('/')
    const picker = page.getByRole('button', { name: 'Search and saved cities', exact: true })
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 834, height: 1194 },
      { width: 1024, height: 1366 },
      { width: 915, height: 412 }
    ]) {
      await page.setViewportSize(viewport)
      await picker.click()
      const dialog = page.getByRole('dialog', { name: 'Search and saved cities' })
      const manager = page.getByRole('region', { name: 'Favorite cities' })
      await expect(manager).toBeVisible()
      await expect.poll(async () => {
        return manager.evaluate(element =>
          Math.abs(element.getBoundingClientRect().width - element.parentElement!.clientWidth))
      }).toBeLessThanOrEqual(2)
      // WebKit reserves space for scrollbars and landscape safe-area insets.
      expect((await manager.boundingBox())!.width).toBeGreaterThanOrEqual(viewport.width * 0.95)
      const bounds = await dialog.boundingBox()
      expect(bounds!.height).toBeLessThanOrEqual(viewport.height - 16 + 1)
      expect(bounds!.y).toBeGreaterThanOrEqual(0)
      await expect(dialog.getByRole('textbox', { name: 'Search a city' })).toBeVisible()
      await dialog.getByRole('button', { name: 'Edit list', exact: true }).click()
      const remove = dialog.getByRole('button', { name: 'Remove Frankfurt am Main 12 from favorites', exact: true })
      await remove.scrollIntoViewIfNeeded()
      await expect(remove).toBeInViewport()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(picker).toBeFocused()
    }
  })

  test('reserves headroom for the active temperature tooltip', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop-chrome', 'Pointer hover regression')
    await page.setViewportSize({ width: 412, height: 915 })
    await page.addInitScript(() => localStorage.setItem('weather-now:language', JSON.stringify('en')))
    await page.goto('/')
    const chart = page.getByTestId('line-chart-scroll')
    await chart.scrollIntoViewIfNeeded()
    const svg = chart.getByRole('img')
    const width = await svg.evaluate(element => element.getBoundingClientRect().width)
    await svg.hover({ position: { x: width * 3.5 / 13, y: 10 } })
    await expect(chart.getByTestId('line-chart-tooltip')).toContainText('30°')
    const clipped = await chart.evaluate((element) => {
      const tooltip = element.querySelector('[data-testid="line-chart-tooltip"]')!
      return tooltip.getBoundingClientRect().top < element.getBoundingClientRect().top
    })
    expect(clipped).toBe(false)
  })
})
