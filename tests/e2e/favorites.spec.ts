import { expect, test } from '@playwright/test'
import type { LocationResult, OpenMeteoWeatherResponse } from '../../app/types/weather'
import { normalizeWeather } from '../../app/utils/weather'

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

test.beforeEach(async ({ page }) => {
  await page.route('**/api/weather?**', route => route.fulfill({ json: normalizeWeather(forecast) }))
  await page.route('https://api.open-meteo.com/v1/forecast?**', route => route.fulfill({ json: forecast }))
})

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
    await expect(page.getByLabel('Language', { exact: true })).toBeVisible()
    await page.getByRole('combobox', { name: 'Search a city' }).fill(search)
    await page.getByRole('option', { name: /Cologne/ }).click()
    await page.getByRole('button', { name: 'Add Cologne to favorites', exact: true }).click()
    await expect.poll(() => page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('weather-now:favorites') || '[]')
      return saved[0]?.labels?.de?.name
    })).toBe('Köln')
    expect(lookupCount).toBe(2)

    await page.getByLabel('Language', { exact: true }).click()
    await page.getByRole('option', { name: 'DE', exact: true }).click()
    await page.getByRole('button', { name: 'Favoriten', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Köln Nordrhein-Westfalen, Deutschland', exact: true })).toBeVisible()
    const remove = page.getByRole('button', { name: 'Köln aus Favoriten entfernen', exact: true }).last()
    await remove.focus()
    await expect(remove).toBeFocused()
    await page.keyboard.press('Escape')

    await page.getByLabel('Sprache', { exact: true }).click()
    await page.getByRole('option', { name: 'EN', exact: true }).click()
    await page.getByRole('button', { name: 'Favorite cities', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Cologne North Rhine-Westphalia, Germany', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.reload()
    await expect(page.getByLabel('Language', { exact: true })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await page.context().setOffline(true)
    await page.getByLabel('Language', { exact: true }).click()
    await page.getByRole('option', { name: 'DE', exact: true }).click()
    await page.getByRole('button', { name: 'Favoriten', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Köln Nordrhein-Westfalen, Deutschland', exact: true })).toBeVisible()
    expect(lookupCount).toBe(2)
    await page.getByRole('button', { name: 'Köln aus Favoriten entfernen', exact: true }).last().click()
    await expect(page.getByText('Noch keine Favoriten.', { exact: false })).toBeVisible()
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
  await expect(page.getByLabel('Language', { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('weather-now:favorites') || '[]')
    return saved[0]?.labels?.de?.name
  })).toBe('Köln')
  await page.getByLabel('Language', { exact: true }).click()
  await page.getByRole('option', { name: 'DE', exact: true }).click()
  await page.getByRole('button', { name: 'Favoriten', exact: true }).click()
  await page.getByRole('button', { name: 'Köln Nordrhein-Westfalen, Deutschland', exact: true }).click()
  await expect(page.getByTestId('current-weather-card').getByRole('heading', { level: 2 })).toHaveText('Köln')
  await page.keyboard.press('Escape')
  await page.getByLabel('Sprache', { exact: true }).click()
  await page.getByRole('option', { name: 'EN', exact: true }).click()
  await expect(page.getByTestId('current-weather-card').getByRole('heading', { level: 2 })).toHaveText('Cologne')
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
  await page.getByRole('button', { name: 'Add Cologne to favorites', exact: true }).click()
  await page.getByRole('button', { name: 'Favorite cities', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Your favorites are saved.')
  await expect(page.getByRole('button', { name: 'Cologne North Rhine-Westphalia, Germany', exact: true })).toBeVisible()
  unavailable = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('weather-now:favorites') || '[]')
    return saved[0]?.labels?.de?.name
  })).toBe('Köln')
})
