import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'
import type { LocationResult, OpenMeteoWeatherResponse } from '../../shared/weather/types'
import { normalizeWeather } from '../../shared/weather/normalize'

const cologne: LocationResult = {
  id: 2886242, name: 'Cologne', country: 'Germany', admin1: 'North Rhine-Westphalia',
  latitude: 50.93333, longitude: 6.95, timezone: 'Europe/Berlin'
}
const koeln: LocationResult = { ...cologne, name: 'Köln', country: 'Deutschland', admin1: 'Nordrhein-Westfalen' }
const time = Date.parse('2026-10-02T12:00:00Z') / 1000
const forecast: OpenMeteoWeatherResponse = {
  timezone: 'Europe/Berlin', utc_offset_seconds: 7200,
  current: {
    time, temperature_2m: 20, relative_humidity_2m: 50, apparent_temperature: 19,
    is_day: 1, precipitation: 0, weather_code: 0, wind_speed_10m: 10, wind_direction_10m: 90
  },
  hourly: {
    time: [time], temperature_2m: [20], apparent_temperature: [19], wind_speed_10m: [10],
    precipitation_probability: [0], precipitation: [0], weather_code: [0]
  },
  daily: {
    time: [time], weather_code: [0], temperature_2m_max: [22], temperature_2m_min: [12],
    precipitation_probability_max: [0], precipitation_sum: [0], sunshine_duration: [36000],
    sunrise: [time - 18000], sunset: [time + 18000]
  }
}

function locationPicker(page: Page) {
  return page.getByRole('button', { name: /^(Search and saved cities|Suche und gespeicherte Orte)$/ })
    .or(page.getByTestId('app-navbar').getByRole('button', { name: /^(Saved cities|Gespeicherte Orte)$/ }))
}

function citySearch(page: Page) {
  return page.getByRole('textbox', { name: 'Search a city' })
    .or(page.getByRole('combobox', { name: 'Search a city' }))
}

function cityResult(page: Page) {
  return page.getByRole('button', { name: /Cologne.*Germany/ })
    .or(page.getByRole('option', { name: /Cologne/ }))
}

async function setLanguage(page: Page, language: 'EN' | 'DE') {
  await expect(page.getByRole('region', { name: /^(Favorite cities|Favoriten)$/ })).toBeHidden()
  const settings = page.getByRole('button', { name: /^(Settings|Einstellungen)$/ })
  if (await settings.isVisible()) await settings.click()
  await page.getByRole('combobox', { name: /^(Language|Sprache)$/ }).click()
  await page.getByRole('option', { name: language, exact: true }).click()
  await expect(page.getByRole('option', { name: language, exact: true })).toBeHidden()
  if (await settings.isVisible()) {
    await page.getByRole('combobox', { name: /^(Language|Sprache)$/ }).focus()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('combobox', { name: /^(Language|Sprache)$/ })).toBeHidden()
  }
}

test.beforeEach(async ({ page }) => {
  // The dev server's Nuxt DevTools button overlays the bottom of small viewports and intercepts pointer input.
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style')
    style.textContent = '#nuxt-devtools-container { display: none !important; }'
    document.head.append(style)
  }))
  await page.route('**/api/weather?**', route => route.fulfill({ json: normalizeWeather(forecast) }))
  await page.route('https://api.open-meteo.com/v1/forecast?**', route => route.fulfill({ json: forecast }))
})

test('searches for and selects a city @smoke', async ({ page }) => {
  await page.route('**/api/geocode?**', route => route.fulfill({ json: { results: [cologne] } }))
  await page.route('https://geocoding-api.open-meteo.com/v1/search?**', route => route.fulfill({ json: { results: [cologne] } }))
  await page.goto('/')
  await expect(locationPicker(page)).toBeEnabled({ timeout: 15000 })

  const search = citySearch(page)
  if (!(await search.isVisible())) await locationPicker(page).click()
  await expect(search).toBeVisible()
  await search.fill('Cologne')
  const result = cityResult(page)
  await expect(result).toBeVisible()
  await result.click()
  await expect(page.getByTestId('current-weather-card').getByRole('heading', { level: 2 })).toHaveText('Cologne')
})

test('keeps desktop search and saved cities in separate panels', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop-chrome', 'Desktop-specific search interaction')
  await page.route('**/api/geocode?**', route => route.fulfill({ json: { results: [cologne] } }))
  await page.route('https://geocoding-api.open-meteo.com/v1/search?**', route => route.fulfill({ json: { results: [cologne] } }))
  await page.goto('/')
  const search = citySearch(page)
  const manager = page.getByRole('region', { name: 'Favorite cities' })
  await expect(locationPicker(page)).toBeEnabled({ timeout: 15000 })
  await expect(search).toBeVisible()
  await expect(manager).toBeHidden()
  const savedCities = page.getByRole('button', { name: 'Saved cities', exact: true })
  await expect(savedCities).toBeVisible()
  await expect(savedCities).toContainText('0')
  await savedCities.click()
  await expect(manager).toBeFocused()
  await expect.poll(async () => {
    const buttonBox = await savedCities.boundingBox()
    const panelBox = await manager.boundingBox()
    if (!buttonBox || !panelBox) return Number.POSITIVE_INFINITY
    return Math.abs(buttonBox.x + buttonBox.width - panelBox.x - panelBox.width)
  }).toBeLessThan(2)
  await expect(page.getByRole('region', { name: 'Search results' })).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(manager).toBeHidden()
  await expect(savedCities).toBeFocused()
  await search.focus()
  await expect(manager).toBeHidden()
  await expect(search).toBeFocused()
  await expect(search).toHaveCount(1)
  await search.fill('Cologne')
  const result = cityResult(page)
  await expect(result).toBeVisible()
  const resultsSection = page.getByRole('listbox')
  await expect(resultsSection).toBeVisible()
  await expect(manager.getByRole('list', { name: 'Search results' })).toHaveCount(0)
  await expect(manager).toBeHidden()
  await savedCities.click()
  await expect(manager).toBeFocused()
  await expect(resultsSection).toBeHidden()
  await search.click()
  await search.fill('Cologne')
  await expect(result).toBeVisible()
  await expect(manager).toBeHidden()
  await search.press('ArrowDown')
  await expect(search).toHaveAttribute('aria-activedescendant', /.+/)
  await search.press('Enter')
  await expect(manager).toBeHidden()
  await expect(search).toBeFocused()
  await expect(search).toHaveValue('')
  await expect(page.getByTestId('current-weather-card').getByRole('heading', { level: 2 })).toHaveText('Cologne')

  await search.click()
  await expect(resultsSection).toBeHidden()
  await search.fill('Cancelled')
  await expect(resultsSection).toBeVisible()
  await search.press('Escape')
  await expect(manager).toBeHidden()
  await expect(search).toBeFocused()
  await expect(search).toHaveValue('')
  await search.click()
  await search.fill('Cologne')
  await expect(resultsSection).toBeVisible()
  await page.getByLabel('Language', { exact: true }).focus()
  await expect(resultsSection).toBeHidden()
  await expect(page.getByLabel('Language', { exact: true })).toBeFocused()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(search).toBeHidden()
  await page.getByRole('button', { name: 'Search and saved cities', exact: true }).click()
  await expect(search).toBeVisible()
})

test('clears search results and errors without changing the displayed location', async ({ page }) => {
  let searchAvailable = false
  const geocode = async (route: Route) => {
    const name = new URL(route.request().url()).searchParams.get('name')
    if (name === 'RequestError' && !searchAvailable) {
      await route.abort()
      return
    }
    await route.fulfill({ json: { results: [] } })
  }
  await page.route('**/api/geocode?**', geocode)
  await page.route('https://geocoding-api.open-meteo.com/v1/search?**', geocode)
  await page.goto('/')
  await locationPicker(page).click()

  const search = citySearch(page)
  const clear = page.getByRole('button', { name: 'Clear search', exact: true })
  const weatherLocation = page.getByTestId('current-weather-card').getByRole('heading', { level: 2, includeHidden: true })
  await expect(weatherLocation).toHaveText('London')
  await expect(clear).toHaveCount(0)

  await search.fill('NoSuchPlace')
  await expect(page.getByText('No matching locations found.', { exact: true })).toBeVisible()
  await expect(clear).toBeVisible()
  await clear.click()
  await expect(search).toHaveValue('')
  await expect(search).toBeFocused()
  await expect(clear).toHaveCount(0)
  await expect(page.getByText('No matching locations found.', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('listbox')).toBeHidden()
  await expect(weatherLocation).toHaveText('London')

  await search.fill('RequestError')
  await expect(page.getByRole('alert')).toContainText('Location search is temporarily unavailable.')
  if (test.info().project.name === 'desktop-chrome') {
    await search.focus()
    await expect(search).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(clear).toBeFocused()
    await page.keyboard.press('Enter')
  } else {
    await clear.click()
  }
  await expect(search).toHaveValue('')
  await expect(search).toBeFocused()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('listbox')).toBeHidden()
  await expect(weatherLocation).toHaveText('London')

  await search.fill('RequestError')
  await expect(page.getByRole('alert')).toContainText('Location search is temporarily unavailable.')
  searchAvailable = true
  await page.getByRole('button', { name: 'Retry search', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText('No matching locations found.', { exact: true })).toBeVisible()
  await expect(search).toHaveValue('RequestError')
})

for (const action of ['current location', 'favorite']) {
  test(`clears the city search when choosing a ${action}`, async ({ page }) => {
    const oslo: LocationResult = {
      name: 'Oslo', country: 'Norway', latitude: 59.91, longitude: 10.75, timezone: 'Europe/Oslo'
    }
    await page.addInitScript((location) => {
      localStorage.setItem('weather-now:favorites', JSON.stringify([{
        ...location,
        labels: { en: { name: location.name, country: location.country }, de: { name: location.name, country: location.country } }
      }]))
      Object.defineProperty(navigator, 'geolocation', {
        value: { getCurrentPosition: () => {} }
      })
    }, oslo)
    await page.route('**/api/ip-location', route => route.fulfill({ json: oslo }))
    await page.route('https://ipinfo.io/json', route => route.fulfill({
      json: { city: oslo.name, country: 'NO', loc: `${oslo.latitude},${oslo.longitude}` }
    }))
    await page.route('**/api/geocode?**', route => route.fulfill({ json: { results: [cologne] } }))
    await page.route('https://geocoding-api.open-meteo.com/v1/search?**', route => route.fulfill({ json: { results: [cologne] } }))
    await page.goto('/')
    await locationPicker(page).click()
    const search = citySearch(page)
    const heading = page.getByTestId('current-weather-card').getByRole('heading', { level: 2 })
    await search.fill('Cologne')
    await cityResult(page).click()
    await expect(heading).toHaveText('Cologne')
    await expect(page.getByRole('list', { name: 'Search results' })).toBeHidden()

    if (action === 'current location') {
      await page.getByRole('button', { name: 'Use my current location', exact: true }).click()
    } else {
      await locationPicker(page).click()
      await page.getByRole('button', { name: /Select Oslo, Norway/ }).click()
    }
    await expect(heading).toHaveText('Oslo')
    await locationPicker(page).click()
    await expect(search).toHaveValue('')
    await expect(search).toHaveAttribute('placeholder', 'Search a city')
    await search.focus()
    await expect(page.getByRole('list', { name: 'Search results' })).toHaveCount(0)
    await expect(page.getByRole('status')).toHaveCount(0)
    await search.fill('Cologne')
    const result = cityResult(page)
    await expect(result).toBeVisible()
    if (test.info().project.name === 'desktop-chrome') {
      await search.press('ArrowDown')
      await search.press('Enter')
    } else {
      await result.focus()
      await result.press('Enter')
    }
    await expect(heading).toHaveText('Cologne')
    await expect(page.getByRole('list', { name: 'Search results' })).toBeHidden()
  })
}

for (const search of ['Köln', 'Cologne']) {
  test(`saving ${search} in English stores both languages and survives an offline reload`, async ({ page }) => {
    const runtimeErrors: string[] = []
    page.on('pageerror', error => runtimeErrors.push(error.message))
    let lookupCount = 0
    const geocode = async (url: string) => {
      const query = new URL(url).searchParams
      const place = query.get('language') === 'de' ? koeln : cologne
      if (query.has('id')) lookupCount++
      return { place, query }
    }
    await page.route('**/api/geocode?**', async (route) => {
      const { place } = await geocode(route.request().url())
      await route.fulfill({ json: { results: [place] } })
    })
    await page.route('https://geocoding-api.open-meteo.com/v1/**', async (route) => {
      const { place, query } = await geocode(route.request().url())
      await route.fulfill({ json: query.has('id') ? place : { results: [place] } })
    })
    await page.goto('/')
    await locationPicker(page).click()
    await citySearch(page).fill(search)
    await cityResult(page).click()
    await locationPicker(page).click()
    await page.getByRole('button', { name: 'Add Cologne to favorites', exact: true }).click()
    await expect.poll(() => page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('weather-now:favorites') || '[]')
      return saved[0]?.labels?.de?.name
    })).toBe('Köln')
    expect(lookupCount).toBe(2)
    await page.keyboard.press('Escape')

    await setLanguage(page, 'DE')
    await locationPicker(page).click()
    await expect(page.getByRole('button', { name: /Köln auswählen/ })).toBeVisible()
    await page.getByRole('button', { name: 'Liste bearbeiten', exact: true }).click()
    const remove = page.getByRole('button', { name: 'Köln aus Favoriten entfernen', exact: true })
    await remove.focus()
    await expect(remove).toBeFocused()
    await page.keyboard.press('Escape')

    await setLanguage(page, 'EN')
    await locationPicker(page).click()
    await expect(page.getByRole('button', { name: /Select Cologne/ })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.reload()
    await expect(locationPicker(page)).toBeVisible()
    await page.waitForLoadState('networkidle')
    await page.context().setOffline(true)
    await setLanguage(page, 'DE')
    await locationPicker(page).click()
    await expect(page.getByRole('button', { name: /Köln auswählen/ })).toBeVisible()
    expect(lookupCount).toBe(2)
    await page.getByRole('button', { name: 'Liste bearbeiten', exact: true }).click()
    await page.getByRole('button', { name: 'Köln aus Favoriten entfernen', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Köln aus Favoriten entfernt.')
    await page.getByRole('button', { name: 'Rückgängig', exact: true }).click()
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('weather-now:favorites') || '[]').length)).toBe(1)
    await page.getByRole('button', { name: 'Köln aus Favoriten entfernen', exact: true }).click()
    await expect(page.getByText('Noch keine gespeicherten Städte.', { exact: false })).toBeVisible()
    expect(runtimeErrors).toEqual([])
  })
}

test('migrates a favorite saved before multilingual labels existed', async ({ page }) => {
  await page.addInitScript((location) => {
    if (!localStorage.getItem('weather-now:favorites')) {
      localStorage.setItem('weather-now:favorites', JSON.stringify([{ ...location, id: undefined }]))
    }
  }, cologne)
  await page.route('**/api/geocode?**', route => route.fulfill({
    json: { results: [new URL(route.request().url()).searchParams.get('language') === 'de' ? koeln : cologne] }
  }))
  await page.route('https://geocoding-api.open-meteo.com/v1/**', (route) => {
    const query = new URL(route.request().url()).searchParams
    const place = query.get('language') === 'de' ? koeln : cologne
    return route.fulfill({ json: query.has('id') ? place : { results: [place] } })
  })
  await page.goto('/')
  await expect(locationPicker(page)).toBeVisible()
  await expect(locationPicker(page)).toBeEnabled({ timeout: 15000 })
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('weather-now:favorites') || '[]')
    return saved[0]?.labels?.de?.name
  })).toBe('Köln')
  await setLanguage(page, 'DE')
  await locationPicker(page).click()
  await page.getByRole('button', { name: /Köln auswählen/ }).click()
  await expect(page.getByTestId('current-weather-card').getByRole('heading', { level: 2 })).toHaveText('Köln')
  await page.keyboard.press('Escape')
  await setLanguage(page, 'EN')
  await expect(page.getByTestId('current-weather-card').getByRole('heading', { level: 2 })).toHaveText('Cologne')
})

test('manages favorites with keyboard reordering, exact-position undo, and opener focus return', async ({ page }) => {
  const bergamo: LocationResult = {
    id: 3182164,
    name: 'Bergamo',
    country: 'Italy',
    latitude: 45.69,
    longitude: 9.67,
    timezone: 'Europe/Rome'
  }
  await page.addInitScript(({ first, second }) => {
    if (!localStorage.getItem('weather-now:favorites')) {
      localStorage.setItem('weather-now:favorites', JSON.stringify([
        { ...first, labels: { en: { name: 'Cologne', country: 'Germany', admin1: 'North Rhine-Westphalia' }, de: { name: 'Köln', country: 'Deutschland', admin1: 'Nordrhein-Westfalen' } } },
        { ...second, labels: { en: { name: 'Bergamo', country: 'Italy' }, de: { name: 'Bergamo', country: 'Italien' } } }
      ]))
    }
  }, { first: cologne, second: bergamo })
  await page.goto('/')

  const trigger = locationPicker(page)
  const savedNames = () => page.evaluate(() => JSON.parse(localStorage.getItem('weather-now:favorites') || '[]').map((favorite: LocationResult) => favorite.name))
  const visibleNames = () => page.getByRole('listitem').evaluateAll(rows => rows.map(row => row.querySelector('[data-favorite-name]')?.textContent?.trim()))
  await expect(trigger).toBeVisible()
  await trigger.click()
  await expect(page.getByRole('button', { name: 'Edit list', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close favorites', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Remove Cologne from favorites', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Edit list', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Select Cologne, North Rhine-Westphalia, Germany', exact: true })).toHaveCount(0)

  // Escape discards unsaved edits.
  await page.getByRole('button', { name: 'Move Cologne down', exact: true }).click()
  await expect.poll(visibleNames).toEqual(['Bergamo', 'Cologne'])
  await expect.poll(savedNames).toEqual(['Cologne', 'Bergamo'])
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await trigger.click()
  await expect.poll(visibleNames).toEqual(['Cologne', 'Bergamo'])
  await page.getByRole('button', { name: 'Edit list', exact: true }).click()

  const moveDown = page.getByRole('button', { name: 'Move Cologne down', exact: true })
  await moveDown.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('[aria-live="polite"]')).toContainText('Cologne moved to position 2.')
  await expect(page.getByRole('button', { name: 'Move Cologne up', exact: true })).toBeFocused()

  await page.getByRole('button', { name: 'Remove Bergamo from favorites', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Bergamo removed from favorites.')
  await expect.poll(visibleNames).toEqual(['Cologne'])
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(visibleNames).toEqual(['Bergamo', 'Cologne'])
  await expect.poll(savedNames).toEqual(['Cologne', 'Bergamo'])

  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.locator('[aria-live="polite"]')).toContainText('Favorites saved.')
  await expect.poll(savedNames).toEqual(['Bergamo', 'Cologne'])
  await page.getByRole('button', { name: 'Edit list', exact: true }).click()

  const cologneRow = page.getByRole('listitem').filter({ hasText: 'Cologne' })
  const bergamoRow = page.getByRole('listitem').filter({ hasText: 'Bergamo' })
  const handle = cologneRow.getByTestId('favorite-drag-handle')
  const start = await handle.boundingBox()
  const target = await bergamoRow.boundingBox()
  if (!start || !target) throw new Error('Favorite rows are not visible for pointer reordering')

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width / 2, target.y + 2, { steps: 6 })
  const dragPreview = page.getByTestId('favorite-drag-preview')
  await expect(dragPreview).toHaveText('Cologne')
  await expect(dragPreview).toBeVisible()
  const previewBox = await dragPreview.boundingBox()
  expect(previewBox).not.toBeNull()
  expect(Math.abs(previewBox!.x - (target.x + target.width / 2 + 14))).toBeLessThan(2)
  await expect(page.getByTestId('favorite-drop-indicator')).toBeVisible()
  await expect.poll(visibleNames).toEqual(['Bergamo', 'Cologne'])
  await page.mouse.up()
  await expect.poll(visibleNames).toEqual(['Cologne', 'Bergamo'])
  await expect.poll(savedNames).toEqual(['Bergamo', 'Cologne'])
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect.poll(savedNames).toEqual(['Cologne', 'Bergamo'])

  await page.reload()
  await expect(trigger).toBeVisible()
  await trigger.click()
  const reloadedFavorites = page.getByRole('listitem')
  await expect(reloadedFavorites.nth(0).getByRole('button', { name: 'Select Cologne, North Rhine-Westphalia, Germany', exact: true })).toBeVisible()
  await expect(reloadedFavorites.nth(1).getByRole('button', { name: 'Select Bergamo, Italy', exact: true })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await trigger.click()
  await page.getByRole('button', { name: 'Select Cologne, North Rhine-Westphalia, Germany', exact: true }).click()
  await expect(page.getByTestId('current-weather-card').getByRole('heading', { level: 2 })).toHaveText('Cologne')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('weather-now:favorites') || '[]').map((favorite: LocationResult) => favorite.name)))
    .toEqual(['Cologne', 'Bergamo'])
  await trigger.click()
  await expect(page.getByRole('button', { name: 'Select Cologne, North Rhine-Westphalia, Germany', exact: true }))
    .toHaveAttribute('aria-current', 'true')
})

test('recognizes the same saved city from current-location coordinates', async ({ page }) => {
  const currentCoordinates = { latitude: 50.94, longitude: 6.96 }
  await page.addInitScript(({ favorite, coordinates }) => {
    const localizedFavorite = {
      ...favorite,
      labels: {
        en: { name: favorite.name, country: favorite.country, admin1: favorite.admin1 },
        de: { name: 'Köln', country: 'Deutschland', admin1: 'Nordrhein-Westfalen' }
      }
    }
    localStorage.setItem('weather-now:favorites', JSON.stringify([localizedFavorite]))
    localStorage.setItem('weather-now:last-location', JSON.stringify(favorite))
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition(success: (position: { coords: typeof coordinates }) => void) {
          success({ coords: coordinates })
        }
      }
    })
  }, { favorite: cologne, coordinates: currentCoordinates })
  await page.route('**/api/ip-location', route => route.abort())
  await page.route('**/api/reverse-geocode?**', route => route.fulfill({
    json: { name: 'Cologne', country: 'Germany', admin1: 'North Rhine-Westphalia' }
  }))
  await page.route('**/api/geocode?**', route => route.fulfill({ json: { results: [cologne] } }))
  await page.goto('/')

  await expect(locationPicker(page)).toBeEnabled({ timeout: 15000 })
  await expect(page.getByTestId('current-weather-card').getByRole('heading', { level: 2 })).toHaveText('Cologne')
  await page.getByRole('button', { name: 'Use my current location', exact: true }).click()
  await expect(page.getByTestId('current-weather-card').getByRole('heading', { level: 2 })).toHaveText('Cologne')
  await locationPicker(page).click()
  await expect(page.getByRole('button', { name: 'Select Cologne, North Rhine-Westphalia, Germany', exact: true }))
    .toHaveAttribute('aria-current', 'true')
  await expect(page.getByRole('button', { name: 'Add Cologne to favorites', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Edit list', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove Cologne from favorites', exact: true })).toHaveCount(1)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('weather-now:favorites') || '[]').length))
    .toBe(1)
})

test('reorders favorites with touch pointer input', async ({ page }) => {
  const bergamo: LocationResult = {
    id: 3182164,
    name: 'Bergamo',
    country: 'Italy',
    latitude: 45.69,
    longitude: 9.67,
    timezone: 'Europe/Rome'
  }
  await page.addInitScript(({ first, second }) => {
    localStorage.setItem('weather-now:favorites', JSON.stringify([
      { ...first, labels: { en: { name: first.name, country: first.country, admin1: first.admin1 }, de: { name: 'Köln', country: 'Deutschland' } } },
      { ...second, labels: { en: { name: second.name, country: second.country }, de: { name: second.name, country: 'Italien' } } }
    ]))
  }, { first: cologne, second: bergamo })
  await page.goto('/')
  await locationPicker(page).click()
  await page.getByRole('button', { name: 'Edit list', exact: true }).click()

  const cologneRow = page.getByRole('listitem').filter({ hasText: 'Cologne' })
  const bergamoRow = page.getByRole('listitem').filter({ hasText: 'Bergamo' })
  const handle = cologneRow.getByTestId('favorite-drag-handle')
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible()
  // The drawer resizes when edit mode hides "Save city"; measure only after the rows stop moving.
  let previousY: number | undefined
  await expect.poll(async () => {
    const y = (await bergamoRow.boundingBox())?.y
    const stable = y !== undefined && y === previousY
    previousY = y
    return stable
  }).toBe(true)
  const start = await handle.boundingBox()
  const end = await bergamoRow.boundingBox()
  if (!start || !end) throw new Error('Favorite rows are not visible for touch reordering')

  await handle.dispatchEvent('pointerdown', {
    bubbles: true,
    pointerId: 42,
    pointerType: 'touch',
    button: 0,
    isPrimary: true,
    clientX: start.x + start.width / 2,
    clientY: start.y + start.height / 2
  })
  await handle.dispatchEvent('pointermove', {
    bubbles: true,
    pointerId: 42,
    pointerType: 'touch',
    button: 0,
    isPrimary: true,
    clientX: end.x + end.width / 2,
    clientY: end.y + end.height / 2
  })
  await expect(page.getByTestId('favorite-drag-preview')).toHaveText('Cologne')
  await expect(page.getByTestId('favorite-drop-indicator')).toBeVisible()
  await bergamoRow.dispatchEvent('pointerup', {
    bubbles: true,
    pointerId: 42,
    pointerType: 'touch',
    button: 0,
    isPrimary: true,
    clientX: end.x + end.width / 2,
    clientY: end.y + end.height / 2
  })
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('weather-now:favorites') || '[]').map((favorite: LocationResult) => favorite.name)))
    .toEqual(['Cologne', 'Bergamo'])
  await expect(page.locator('[aria-live="polite"]')).toContainText('Cologne moved to position 2.')
  await expect(page.getByRole('button', { name: 'Move Cologne up', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('weather-now:favorites') || '[]').map((favorite: LocationResult) => favorite.name)))
    .toEqual(['Bergamo', 'Cologne'])
})

test('keeps the favorites manager within common phone, tablet, and desktop widths', async ({ page }) => {
  await page.goto('/')
  await expect(locationPicker(page)).toBeVisible()

  for (const width of [360, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 })
    const trigger = locationPicker(page)
    await expect(trigger).toBeVisible()
    // The trigger remounts when the popover/drawer breakpoint changes, so wait for the settled element.
    let triggerBox: Awaited<ReturnType<typeof trigger.boundingBox>> = null
    await expect.poll(async () => (triggerBox = await trigger.boundingBox())).not.toBeNull()
    expect(triggerBox!.x + triggerBox!.width).toBeLessThanOrEqual(width + 2)
    await trigger.click()

    const manager = page.getByRole('region', { name: 'Favorite cities' })
    await expect(manager).toBeVisible()
    const managerBox = await manager.boundingBox()
    expect(managerBox).not.toBeNull()
    expect(managerBox!.x).toBeGreaterThanOrEqual(0)
    expect(managerBox!.x + managerBox!.width).toBeLessThanOrEqual(width + 2)
    await page.keyboard.press('Escape')
    await expect(manager).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 2)
  }
})

test('keeps favorites saved when translations fail and lets the user retry', async ({ page }) => {
  await page.addInitScript(location => localStorage.setItem('weather-now:last-location', JSON.stringify(location)), cologne)
  let unavailable = true
  await page.route('**/api/geocode?**', route => unavailable
    ? route.fulfill({ status: 503, json: { message: 'Unavailable' } })
    : route.fulfill({ json: { results: [new URL(route.request().url()).searchParams.get('language') === 'de' ? koeln : cologne] } }))
  await page.route('https://geocoding-api.open-meteo.com/v1/**', route => unavailable
    ? route.fulfill({ status: 503, json: { message: 'Unavailable' } })
    : route.fulfill({ json: new URL(route.request().url()).searchParams.get('language') === 'de' ? koeln : cologne }))
  await page.goto('/')
  await expect(locationPicker(page)).toBeVisible()
  await expect(locationPicker(page)).toBeEnabled({ timeout: 15000 })
  await expect(page.getByTestId('current-weather-card').getByRole('heading', { level: 2 })).toHaveText('Cologne')
  await locationPicker(page).click()
  await page.getByRole('button', { name: 'Add Cologne to favorites', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Your favorites are safe')
  await expect(page.getByRole('button', { name: /Select Cologne/ })).toBeVisible()
  unavailable = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('weather-now:favorites') || '[]')
    return saved[0]?.labels?.de?.name
  })).toBe('Köln')
})
