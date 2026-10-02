import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, ref, watch } from 'vue'
import type { OpenMeteoWeatherResponse, WeatherResponse } from '~/types/weather'
import { normalizeWeather } from '~/utils/weather'

const upstream: OpenMeteoWeatherResponse = {
  timezone: 'Europe/Berlin',
  utc_offset_seconds: 7200,
  current: {
    time: Date.parse('2026-09-09T11:15:00Z') / 1000,
    temperature_2m: 20, relative_humidity_2m: 50, apparent_temperature: 19,
    is_day: 1, precipitation: 0, weather_code: 0, wind_speed_10m: 10, wind_direction_10m: 90
  },
  hourly: {
    time: [Date.parse('2026-09-09T11:00:00Z') / 1000],
    temperature_2m: [20], apparent_temperature: [19], wind_speed_10m: [10],
    precipitation_probability: [0], precipitation: [0], weather_code: [0]
  },
  daily: {
    time: [Date.parse('2026-09-08T22:00:00Z') / 1000],
    sunrise: [Date.parse('2026-09-09T04:35:00Z') / 1000],
    sunset: [Date.parse('2026-09-09T17:42:00Z') / 1000],
    weather_code: [0], temperature_2m_max: [22], temperature_2m_min: [12],
    precipitation_probability_max: [0], precipitation_sum: [0], sunshine_duration: [36000]
  }
}
const location = { name: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.41, timezone: 'auto' }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('weather fetch timestamp contract', () => {
  it('requests Unix timestamps, normalizes the server response and versions the cache key', async () => {
    const fetch = vi.fn().mockResolvedValue(upstream)
    const cachedHandler = vi.fn((handler, options) => ({ handler, options }))
    vi.stubGlobal('$fetch', fetch)
    vi.stubGlobal('getQuery', () => ({ latitude: location.latitude, longitude: location.longitude }))
    vi.stubGlobal('defineCachedEventHandler', cachedHandler)
    vi.stubGlobal('createError', (error: unknown) => error)

    const route = (await import('../../server/api/weather.get')).default as unknown as {
      handler: (event: unknown) => Promise<WeatherResponse>
      options: { getKey: (event: unknown) => string }
    }
    expect(await route.handler({})).toEqual(normalizeWeather(upstream))
    expect(fetch).toHaveBeenCalledWith('https://api.open-meteo.com/v1/forecast', expect.objectContaining({
      query: expect.objectContaining({ timeformat: 'unixtime', timezone: 'auto' })
    }))
    expect(route.options.getKey({})).toMatch(/^unix-iso-v1:/)
  })

  it.each(['server', 'external'])('preserves the ISO app model in %s mode', async (mode) => {
    const normalized = normalizeWeather(upstream)
    const fetch = vi.fn().mockResolvedValue(mode === 'external' ? upstream : normalized)
    vi.stubGlobal('$fetch', fetch)
    vi.stubGlobal('useI18n', () => ({ locale: ref('de') }))
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { apiMode: mode } }))
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('computed', computed)
    vi.stubGlobal('watch', watch)
    vi.stubGlobal('onMounted', vi.fn())
    vi.stubGlobal('onBeforeUnmount', vi.fn())
    const { useWeather } = await import('~/composables/useWeather')
    const state = useWeather()
    await state.fetchWeather(location)
    expect(state.weather.value).toEqual(normalized)
    expect(state.hourlyForecast.value[0]).toMatchObject({ time: '2026-09-09T11:00:00.000Z', isNow: true })
    expect(state.errorMessage.value).toBe('')
    if (mode === 'external') {
      expect(fetch).toHaveBeenCalledWith('https://api.open-meteo.com/v1/forecast', expect.objectContaining({
        query: expect.objectContaining({ timeformat: 'unixtime', timezone: 'auto' })
      }))
    } else {
      expect(fetch).toHaveBeenCalledWith('/api/weather', { query: { latitude: 52.52, longitude: 13.41 } })
    }
  })
})
