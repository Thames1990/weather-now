import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '../../i18n/locales/en.json'
import de from '../../i18n/locales/de.json'
import type { OpenMeteoWeatherResponse, WeatherResponse } from '~/types/weather'
import { formatDay, formatHour, hourlyLabels, normalizeWeather, selectHourlyForecast, weatherEffect, weatherIcon, weatherLabel, windDirection } from '~/utils/weather'

function forecast(currentTime: string, times: string[]): WeatherResponse {
  return {
    timezone: 'Europe/Berlin',
    current: {
      time: currentTime, temperature_2m: 20, relative_humidity_2m: 50, apparent_temperature: 19,
      is_day: 1, precipitation: 0, weather_code: 0, wind_speed_10m: 10, wind_direction_10m: 90
    },
    hourly: {
      time: times,
      temperature_2m: times.map((_, index) => 10 + index),
      precipitation_probability: times.map((_, index) => index),
      precipitation: times.map((_, index) => index / 10),
      weather_code: times.map(() => 0)
    },
    daily: {
      time: [], sunrise: [], sunset: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [],
      precipitation_probability_max: [], precipitation_sum: [], sunshine_duration: []
    }
  }
}

afterEach(() => vi.unstubAllEnvs())

describe('hourly selection and shared labels', () => {
  const times = Array.from({ length: 24 }, (_, hour) => new Date(Date.UTC(2026, 8, 9, hour)).toISOString())

  it('selects the containing hour for a quarter-hour current reading, keeping values aligned', () => {
    const selected = selectHourlyForecast(forecast('2026-09-09T11:15:00Z', times))
    expect(selected).toHaveLength(12)
    expect(selected[0]).toMatchObject({ time: times[11], isNow: true, temperature: 21, precipitation: 11, precipitationAmount: 1.1 })
    expect(selected.slice(1).every(hour => !hour.isNow)).toBe(true)
  })

  it('uses the next interval at an exact boundary and handles the final interval', () => {
    expect(selectHourlyForecast(forecast(times[12]!, times))[0]?.time).toBe(times[12])
    expect(selectHourlyForecast(forecast('2026-09-09T23:45:00Z', times))[0]?.isNow).toBe(true)
  })

  it('does not mark future-only forecasts Now or fall back to midnight for expired forecasts', () => {
    const selected = selectHourlyForecast(forecast('2026-09-08T23:45:00Z', times))
    expect(selected[0]?.isNow).toBe(false)
    expect(hourlyLabels(selected, 'de', 'Europe/Berlin', de.now)[0]).toBe('02:00')
    expect(selectHourlyForecast(forecast('2026-09-10T00:00:00Z', times))).toEqual([])
    expect(selectHourlyForecast(forecast('2026-09-09T11:15:00Z', []))).toEqual([])
  })

  it.each(['en', 'de'] as const)('uses the translated Now label in %s', (locale) => {
    const selected = selectHourlyForecast(forecast('2026-09-09T11:15:00Z', times))
    const labels = hourlyLabels(selected, locale, 'Europe/Berlin', { en, de }[locale].now)
    expect(labels[0]).toBe(locale === 'de' ? 'Jetzt' : 'Now')
    expect(labels[1]).toBe(locale === 'de' ? '14:00' : '2 PM')
  })

  it.each(['America/Los_Angeles', 'Asia/Tokyo', 'UTC'])('is independent of viewer timezone %s and repeatable after reload', (viewerZone) => {
    vi.stubEnv('TZ', viewerZone)
    const weather = forecast('2026-09-09T11:15:00Z', times)
    const labels = hourlyLabels(selectHourlyForecast(weather), 'de', weather.timezone, de.now)
    expect(labels.slice(0, 3)).toEqual(['Jetzt', '14:00', '15:00'])
    expect(hourlyLabels(selectHourlyForecast(JSON.parse(JSON.stringify(weather))), 'de', weather.timezone, de.now)).toEqual(labels)
  })

  it('keeps Berlin spring DST instants chronological and skips the nonexistent 02:00', () => {
    const spring = ['2026-03-29T00:00:00Z', '2026-03-29T01:00:00Z', '2026-03-29T02:00:00Z']
    const selected = selectHourlyForecast(forecast('2026-03-28T23:45:00Z', spring))
    expect(selected.map(hour => hour.time)).toEqual(spring)
    expect(hourlyLabels(selected, 'de', 'Europe/Berlin', de.now)).toEqual(['01:00', '03:00', '04:00'])
    expect(selectHourlyForecast(forecast('2026-03-29T00:15:00Z', spring))[0]?.isNow).toBe(true)
  })

  it('preserves both Berlin fall DST 02:00 hours and selects the correct repeated interval', () => {
    const fall = ['2026-10-25T00:00:00Z', '2026-10-25T01:00:00Z', '2026-10-25T02:00:00Z']
    const selected = selectHourlyForecast(forecast('2026-10-24T23:45:00Z', fall))
    expect(selected.map(hour => hour.time)).toEqual(fall)
    expect(new Set(selected.map(hour => hour.time)).size).toBe(3)
    expect(hourlyLabels(selected, 'de', 'Europe/Berlin', de.now)).toEqual(['02:00', '02:00', '03:00'])
    expect(selectHourlyForecast(forecast('2026-10-25T01:15:00Z', fall))[0]).toMatchObject({ time: fall[1], isNow: true, temperature: 11 })
  })
})

describe('formatHour', () => {
  it('uses explicit German h23 at midnight, noon and 13:00 in the response timezone', () => {
    expect(formatHour('2026-09-08T22:00:00Z', 'de', 'Europe/Berlin')).toBe('00:00')
    expect(formatHour('2026-09-09T10:00:00Z', 'de', 'Europe/Berlin')).toBe('12:00')
    expect(formatHour('2026-09-09T11:00:00Z', 'de', 'Europe/Berlin')).toBe('13:00')
    expect(formatHour('2026-09-09T11:00:00Z', 'en', 'Europe/Berlin')).toBe('1 PM')
  })

  it('formats sunrise/sunset instants with minutes and has a deterministic UTC default', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles')
    expect(formatHour('2026-09-09T04:35:00Z', 'de', 'Europe/Berlin')).toBe('06:35')
    expect(formatHour('2026-09-09T17:42:00Z', 'de', 'Europe/Berlin')).toBe('19:42')
    expect(formatHour('2026-09-09T00:00:00Z', 'de')).toBe('00:00')
  })
})

describe('normalizeWeather', () => {
  it.each([
    ['Europe/Berlin', 3600, ['2026-03-28T23:00:00Z', '2026-03-29T23:00:00Z'], ['2026-03-29', '2026-03-30']],
    ['Europe/Berlin', 7200, ['2026-10-24T22:00:00Z', '2026-10-25T22:00:00Z'], ['2026-10-25', '2026-10-26']],
    ['Asia/Kolkata', 19800, ['2026-09-08T18:30:00Z'], ['2026-09-09']],
    ['America/Los_Angeles', -25200, ['2026-09-09T07:00:00Z'], ['2026-09-09']]
  ])('normalizes instants and provider daily calendar dates in %s', (timezone, utcOffset, dailyTimes, dates) => {
    const base = forecast('2026-10-25T01:15:00Z', ['2026-10-25T00:00:00Z', '2026-10-25T01:00:00Z'])
    const unix = (value: string) => Date.parse(value) / 1000
    const upstream: OpenMeteoWeatherResponse = {
      ...base, timezone, utc_offset_seconds: utcOffset,
      current: { ...base.current, time: unix(base.current.time) },
      hourly: { ...base.hourly, time: base.hourly.time.map(unix) },
      daily: { ...base.daily, time: dailyTimes.map(unix), sunrise: [unix('2026-10-25T06:00:00Z')], sunset: [unix('2026-10-25T17:00:00Z')] }
    }
    vi.stubEnv('TZ', 'Pacific/Honolulu')
    const normalized = normalizeWeather(upstream)
    expect(normalized.current.time).toBe('2026-10-25T01:15:00.000Z')
    expect(normalized.hourly.time).toEqual(['2026-10-25T00:00:00.000Z', '2026-10-25T01:00:00.000Z'])
    expect(normalized.daily.time).toEqual(dates)
    expect(normalized.daily.sunrise).toEqual(['2026-10-25T06:00:00.000Z'])
    expect(normalized.daily.sunset).toEqual(['2026-10-25T17:00:00.000Z'])
    expect(normalized.hourly.temperature_2m).toEqual(base.hourly.temperature_2m)
    expect(upstream.current.time).toBeTypeOf('number')
  })
})

describe('weatherLabel', () => {
  it('labels clear skies', () => {
    expect(weatherLabel(0)).toBe('Clear skies')
    expect(weatherLabel(0, 'de')).toBe('Klarer Himmel')
  })

  it('labels rain codes', () => {
    for (const code of [61, 63, 65, 80, 81, 82]) expect(weatherLabel(code)).toBe('Rain')
  })

  it('falls back to changeable for unknown codes', () => {
    expect(weatherLabel(-1)).toBe('Changeable')
  })
})

describe('weatherIcon', () => {
  it('differentiates day and night for clear skies', () => {
    expect(weatherIcon(0, true)).toBe('☀️')
    expect(weatherIcon(0, false)).toBe('🌙')
  })

  it('returns a storm icon for thunderstorm codes', () => {
    expect(weatherIcon(95)).toBe('⛈️')
  })
})

describe('weatherEffect', () => {
  it('prioritizes storms over other conditions', () => {
    expect(weatherEffect(95, 5)).toBe('storm')
  })

  it('treats strong wind as its own effect when skies are otherwise calm', () => {
    expect(weatherEffect(1, 30)).toBe('wind')
  })

  it('defaults to clouds for an overcast day with light wind', () => {
    expect(weatherEffect(3, 5)).toBe('clouds')
  })
})

describe('windDirection', () => {
  it('maps degrees to compass points', () => {
    expect(windDirection(0)).toBe('N')
    expect(windDirection(90)).toBe('E')
    expect(windDirection(359)).toBe('N')
  })
})

describe('formatDay', () => {
  it('always labels the first index as Today', () => {
    expect(formatDay('2026-09-09', 0)).toBe('Today')
  })
})
