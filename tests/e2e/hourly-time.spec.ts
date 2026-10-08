import { expect, test } from '@playwright/test'
import type { OpenMeteoWeatherResponse } from '../../shared/weather/types'
import { normalizeWeather } from '../../shared/weather/normalize'

function response(currentTime: string, hourlyTimes: string[]): OpenMeteoWeatherResponse {
  const unix = (time: string) => Date.parse(time) / 1000
  return {
    timezone: 'Europe/Berlin',
    utc_offset_seconds: 7200,
    current: {
      time: unix(currentTime), temperature_2m: 20, relative_humidity_2m: 50, apparent_temperature: 19,
      is_day: 1, precipitation: 0, weather_code: 0, wind_speed_10m: 10, wind_direction_10m: 90
    },
    hourly: {
      time: hourlyTimes.map(unix), temperature_2m: hourlyTimes.map((_, index) => 20 + index),
      apparent_temperature: hourlyTimes.map((_, index) => 19 + index),
      wind_speed_10m: hourlyTimes.map(() => 10),
      precipitation_probability: hourlyTimes.map(() => 0), precipitation: hourlyTimes.map(() => 0),
      weather_code: hourlyTimes.map(() => 0)
    },
    daily: {
      time: [unix('2026-09-08T22:00:00Z')], weather_code: [0], temperature_2m_max: [22], temperature_2m_min: [12],
      precipitation_probability_max: [0], precipitation_sum: [0], sunshine_duration: [36000],
      sunrise: [unix('2026-09-09T04:35:00Z')], sunset: [unix('2026-09-09T17:42:00Z')]
    }
  }
}

test.describe('selected-location hourly labels', () => {
  test.use({ timezoneId: 'America/Los_Angeles', locale: 'de-DE' })

  const cases = [
    {
      name: 'quarter-hour current reading', current: '2026-09-09T10:15:00Z',
      times: Array.from({ length: 24 }, (_, hour) => new Date(Date.UTC(2026, 8, 9, hour)).toISOString()),
      labels: ['Jetzt', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00'],
      english: ['Now', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM', '7 PM', '8 PM', '9 PM', '10 PM', '11 PM', '12 AM']
    },
    {
      name: 'future-only midnight', current: '2026-09-09T21:45:00Z',
      times: Array.from({ length: 8 }, (_, hour) => new Date(Date.UTC(2026, 8, 9, 22 + hour)).toISOString()),
      labels: ['00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00']
    },
    {
      name: 'future-only noon', current: '2026-09-09T09:45:00Z',
      times: Array.from({ length: 8 }, (_, hour) => new Date(Date.UTC(2026, 8, 9, 10 + hour)).toISOString()),
      labels: ['12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00']
    },
    {
      name: 'fall DST repeated hours', current: '2026-10-24T23:45:00Z',
      times: Array.from({ length: 8 }, (_, hour) => new Date(Date.UTC(2026, 9, 25, hour)).toISOString()),
      labels: ['02:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00', '08:00']
    },
    {
      name: 'spring DST skipped hour', current: '2026-03-28T23:45:00Z',
      times: Array.from({ length: 8 }, (_, hour) => new Date(Date.UTC(2026, 2, 29, hour)).toISOString()),
      labels: ['01:00', '03:00', '04:00', '05:00', '06:00', '07:00', '08:00', '09:00']
    }
  ]

  for (const scenario of cases) {
    test(`${scenario.name}: all three views agree after reload`, async ({ page }) => {
      const upstream = response(scenario.current, scenario.times)
      await page.context().addCookies([{ name: 'i18n_redirected', value: 'de', domain: 'localhost', path: '/' }])
      await page.addInitScript(() => {
        localStorage.setItem('weather-now:language', JSON.stringify('de'))
        // Deliberately disagree with the response timezone: the response must win.
        localStorage.setItem('weather-now:last-location', JSON.stringify({
          name: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.41, timezone: 'Asia/Tokyo'
        }))
      })
      // Covers server mode and the existing static GitHub Pages external mode.
      await page.route('**/api/weather?**', route => route.fulfill({ json: normalizeWeather(upstream) }))
      await page.route('https://api.open-meteo.com/v1/forecast?**', (route) => {
        expect(new URL(route.request().url()).searchParams.get('timeformat')).toBe('unixtime')
        return route.fulfill({ json: upstream })
      })
      await page.goto('/')

      const hourly = page.getByTestId('hourly-forecast-card')
      const temperature = page.getByTestId('temperature-trend-card')
      const precipitation = page.getByTestId('precipitation-outlook-card')
      for (let load = 0; load < 2; load++) {
        await expect(hourly.getByText('Ortszeit · Europe/Berlin', { exact: true })).toBeVisible({ timeout: 20000 })
        await expect(hourly.getByRole('heading')).toHaveText('Stündliche Vorhersage')
        for (const [index, card] of [hourly, temperature, precipitation].entries()) {
          for (const label of new Set(scenario.labels)) {
            await expect(card.getByText(label, { exact: true }).first()).toBeVisible()
          }
          const renderedLabels = (await card.locator('span').allTextContents())
            .map(text => text.trim())
            .filter(text => /^(Jetzt|\d{2}:\d{2})$/.test(text))
          expect(renderedLabels).toEqual(scenario.labels)
          if (index === 0) {
            await expect(card.getByTestId('hourly-forecast-item')).toHaveCount(scenario.labels.length)
          } else {
            await expect(card.getByRole('img')).toHaveAttribute('aria-label', new RegExp(`across ${scenario.labels.length} readings`))
          }
          if (scenario.labels.includes('Jetzt')) {
            await expect(card.getByText('Jetzt', { exact: true })).toHaveCount(1)
          } else {
            await expect(card.getByText('Jetzt', { exact: true })).toHaveCount(0)
          }
          if (scenario.name.startsWith('fall')) {
            await expect(card.getByText('02:00', { exact: true })).toHaveCount(2)
          }
          if (scenario.name.startsWith('spring')) {
            await expect(card.getByText('02:00', { exact: true })).toHaveCount(0)
          }
        }
        await expect(page.getByTestId('weather-details-card').getByText('06:35', { exact: true })).toBeVisible()
        await expect(page.getByTestId('weather-details-card').getByText('19:42', { exact: true })).toBeVisible()
        if (load === 0) await page.reload()
      }
      if (scenario.english) {
        await page.getByLabel('Sprache', { exact: true }).click()
        await page.getByRole('option', { name: 'EN', exact: true }).click()
        for (const card of [hourly, temperature, precipitation]) {
          for (const label of scenario.english) {
            await expect(card.getByText(label, { exact: true }).first()).toBeVisible()
          }
        }
      }
    })
  }
})
