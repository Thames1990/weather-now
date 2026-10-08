import { expect, test } from '@playwright/test'
import type { LocationResult, OpenMeteoWeatherResponse } from '../../shared/weather/types'
import { normalizeWeather } from '../../shared/weather/normalize'

const bonn: LocationResult = {
  name: 'Bonn', country: 'Germany', latitude: 50.74, longitude: 7.1, timezone: 'Europe/Berlin'
}
const frankfurt: LocationResult = {
  name: 'Frankfurt am Main', country: 'Germany', latitude: 50.11, longitude: 8.68, timezone: 'Europe/Berlin'
}
const time = Date.parse('2026-10-06T12:00:00Z') / 1000

function forecast(wide: boolean): OpenMeteoWeatherResponse {
  return {
    timezone: 'Europe/Berlin', utc_offset_seconds: 7200,
    current: {
      time, temperature_2m: 15, relative_humidity_2m: 74, apparent_temperature: 14,
      is_day: 1, precipitation: 0, weather_code: 0, wind_speed_10m: 6, wind_direction_10m: 90
    },
    hourly: {
      time: [time], temperature_2m: [15], apparent_temperature: [14], wind_speed_10m: [6],
      precipitation_probability: [0], precipitation: [0], weather_code: [0]
    },
    daily: {
      time: Array.from({ length: 7 }, (_, index) => time + index * 86400),
      weather_code: Array(7).fill(wide ? 1 : 61),
      temperature_2m_max: Array(7).fill(wide ? -12 : 9),
      temperature_2m_min: Array(7).fill(wide ? -25 : 1),
      precipitation_probability_max: Array(7).fill(wide ? 100 : 0),
      precipitation_sum: Array(7).fill(0), sunshine_duration: Array(7).fill(36000),
      sunrise: Array(7).fill(time - 18000), sunset: Array(7).fill(time + 18000)
    }
  }
}

for (const language of ['en', 'de']) {
  test(`keeps daily columns fixed across city changes in ${language}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(({ language, location }) => {
      localStorage.setItem('weather-now:language', JSON.stringify(language))
      localStorage.setItem('weather-now:last-location', JSON.stringify(location))
    }, { language, location: frankfurt })
    await page.route('**/api/weather?**', (route) => {
      const wide = new URL(route.request().url()).searchParams.get('latitude') === String(bonn.latitude)
      return route.fulfill({ json: normalizeWeather(forecast(wide)) })
    })
    await page.route('https://api.open-meteo.com/v1/forecast?**', (route) => {
      const wide = new URL(route.request().url()).searchParams.get('latitude') === String(bonn.latitude)
      return route.fulfill({ json: forecast(wide) })
    })
    await page.route('**/api/geocode?**', route => route.fulfill({ json: { results: [bonn] } }))
    await page.route('https://geocoding-api.open-meteo.com/v1/search?**', route => route.fulfill({ json: { results: [bonn] } }))
    await page.goto('/')

    const card = page.getByTestId('daily-forecast-card')
    const table = card.getByRole('table')
    await expect(table.getByRole('columnheader')).toHaveCount(5)
    await expect(table.getByRole('cell', { name: '9° / 1°', exact: true })).toHaveCount(7)
    const geometry = () => table.getByRole('columnheader').evaluateAll(headers =>
      headers.map((header) => {
        const rect = header.getBoundingClientRect()
        return { x: rect.x, width: rect.width }
      }))
    const before = await geometry()

    const mobileSearch = page.getByRole('button', { name: /^(Search and saved cities|Suche und gespeicherte Orte)$/ })
    if (await mobileSearch.isVisible()) await mobileSearch.click()
    const search = page.getByRole('textbox', { name: /^(Search a city|Stadt suchen)$/ })
      .or(page.getByRole('combobox', { name: /^(Search a city|Stadt suchen)$/ }))
    await search.fill('Bonn')
    const result = page.getByRole('option', { name: /Bonn/ })
      .or(page.getByRole('button', { name: /Bonn.*Germany/ }))
    await result.click()
    await expect(page.getByTestId('current-weather-card').getByRole('heading', { level: 2 })).toHaveText('Bonn')
    await expect(table.getByRole('cell', { name: '-12° / -25°', exact: true })).toHaveCount(7)
    const after = await geometry()
    expect(after).toHaveLength(5)
    for (const [index, column] of after.entries()) {
      expect(Math.abs(column.x - before[index]!.x)).toBeLessThan(1)
      expect(Math.abs(column.width - before[index]!.width)).toBeLessThan(1)
    }
    const overflow = await table.evaluate(element =>
      [...element.querySelectorAll('th, td')].map(cell => cell.scrollWidth - cell.clientWidth))
    expect(Math.max(...overflow)).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}
