import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, ref, watch } from 'vue'
import type { LocationResult, OpenMeteoWeatherResponse, WeatherResponse } from '~/types/weather'
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
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function installWeatherGlobals(fetch: ReturnType<typeof vi.fn>, apiMode = 'server') {
  vi.stubGlobal('$fetch', fetch)
  vi.stubGlobal('useI18n', () => ({ locale: ref('de') }))
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { apiMode } }))
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('watch', watch)
  vi.stubGlobal('onMounted', vi.fn())
  vi.stubGlobal('onBeforeUnmount', vi.fn())
}

async function createWeatherState(fetch: ReturnType<typeof vi.fn>, apiMode = 'server') {
  installWeatherGlobals(fetch, apiMode)
  const { useWeather } = await import('~/composables/useWeather')
  return useWeather()
}

async function flushPromises() {
  for (let turn = 0; turn < 5; turn++) await Promise.resolve()
}

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

  it('turns malformed static-provider forecast and search payloads into errors', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ results: [{}] })
    const state = await createWeatherState(fetch, 'external')

    await state.fetchWeather(location)
    expect(state.weather.value).toBeNull()
    expect(state.errorMessage.value).toBe('errorForecastUnavailable')

    state.query.value = 'Berlin'
    await state.searchLocations()
    expect(state.searchResults.value).toEqual([])
    expect(state.searchError.value).toBe('errorSearchUnavailable')
  })
})

describe('weather and location request sequencing', () => {
  it.each([true, false])('clears search state on a current-location request (geolocation supported: %s)', async (supported) => {
    vi.useFakeTimers()
    const pendingSearch = deferred<{ results: LocationResult[] }>()
    const fetch = vi.fn((url: string) => url === '/api/geocode'
      ? pendingSearch.promise
      : Promise.resolve({ name: 'Oslo', country: 'Norway', latitude: 59.91, longitude: 10.75 }))
    const state = await createWeatherState(fetch)
    vi.stubGlobal('navigator', supported ? { geolocation: { getCurrentPosition: vi.fn() } } : {})
    state.query.value = 'Berlin'
    const request = state.searchLocations()
    state.searchResults.value = [location]
    state.hasSearched.value = true
    state.searchError.value = 'errorSearchUnavailable'

    state.useCurrentLocation()
    expect(state.query.value).toBe('')
    expect(state.searchResults.value).toEqual([])
    expect(state.hasSearched.value).toBe(false)
    expect(state.searchError.value).toBe('')
    expect(state.isSearching.value).toBe(false)

    pendingSearch.resolve({ results: [location] })
    await request
    await vi.advanceTimersByTimeAsync(300)
    expect(state.searchResults.value).toEqual([])
    expect(state.hasSearched.value).toBe(false)
    expect(fetch.mock.calls.filter(([url]) => url === '/api/geocode')).toHaveLength(1)
  })

  it('keeps the latest forecast and loading state when requests resolve out of order', async () => {
    const olderForecast = deferred<WeatherResponse>()
    const newerForecast = deferred<WeatherResponse>()
    let requestCount = 0
    const fetch = vi.fn(() => requestCount++ === 0 ? olderForecast.promise : newerForecast.promise)
    const state = await createWeatherState(fetch)
    const newerLocation: LocationResult = { ...location, name: 'Oslo', latitude: 59.91, longitude: 10.75 }

    const oldRequest = state.fetchWeather(location)
    const newRequest = state.fetchWeather(newerLocation)
    expect(state.isLoading.value).toBe(true)

    newerForecast.resolve(normalizeWeather(upstream))
    await newRequest
    expect(state.selectedLocation.value).toEqual(newerLocation)
    expect(state.isLoading.value).toBe(false)

    olderForecast.reject(new Error('stale provider failure'))
    await oldRequest
    expect(state.selectedLocation.value).toEqual(newerLocation)
    expect(state.errorMessage.value).toBe('')
    expect(state.isLoading.value).toBe(false)
  })

  it('settles loading and ignores an in-flight forecast when geolocation is unsupported', async () => {
    const pendingForecast = deferred<WeatherResponse>()
    const fetch = vi.fn().mockReturnValue(pendingForecast.promise)
    const state = await createWeatherState(fetch)
    vi.stubGlobal('navigator', {})
    const request = state.fetchWeather(location)

    state.useCurrentLocation()
    expect(state.errorMessage.value).toBe('errorLocationUnsupported')
    expect(state.isLoading.value).toBe(false)

    pendingForecast.resolve(normalizeWeather(upstream))
    await request
    expect(state.weather.value).toBeNull()
    expect(state.isLoading.value).toBe(false)
    expect(state.errorMessage.value).toBe('errorLocationUnsupported')
  })

  it('does not let pending IP or browser geolocation replace a newer selected location', async () => {
    type GeoPosition = { coords: { latitude: number; longitude: number } }
    type GeoSuccess = (position: GeoPosition) => void
    const ipLocation = deferred<{ name: string; country: string; latitude: number; longitude: number }>()
    const previousForecast = deferred<WeatherResponse>()
    let onGeoSuccess: GeoSuccess | undefined
    const fetch = vi.fn((url: string, options?: { query?: { latitude?: number } }) => {
      if (url === '/api/ip-location') return ipLocation.promise
      if (url === '/api/weather' && options?.query?.latitude === location.latitude) return previousForecast.promise
      return Promise.resolve(normalizeWeather(upstream))
    })
    const state = await createWeatherState(fetch)
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition(success: GeoSuccess) {
          onGeoSuccess = success
        }
      }
    })
    const selected: LocationResult = { ...location, name: 'Paris', latitude: 48.86, longitude: 2.35 }

    const previousRequest = state.fetchWeather(location)
    state.useCurrentLocation()
    previousForecast.resolve(normalizeWeather(upstream))
    await previousRequest
    expect(state.isLoading.value).toBe(true)

    await state.fetchWeather(selected)
    ipLocation.resolve({ name: 'Oslo', country: 'Norway', latitude: 59.91, longitude: 10.75 })
    await flushPromises()
    await onGeoSuccess?.({ coords: { latitude: 40.71, longitude: -74.01 } })

    expect(state.selectedLocation.value).toEqual(selected)
    expect(state.isLoading.value).toBe(false)
    expect(state.errorMessage.value).toBe('')
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('discards stale search results and only clears loading for the active search', async () => {
    vi.useFakeTimers()
    const firstSearch = deferred<{ results: LocationResult[] }>()
    const secondSearch = deferred<{ results: LocationResult[] }>()
    const fetch = vi.fn((_url: string, options: { query: { name: string } }) => (
      options.query.name === 'Berlin' ? firstSearch.promise : secondSearch.promise
    ))
    const state = await createWeatherState(fetch)
    state.query.value = 'Berlin'

    const staleRequest = state.searchLocations()
    state.query.value = 'Oslo'
    const currentRequest = state.searchLocations()
    const oslo: LocationResult = { ...location, name: 'Oslo', latitude: 59.91, longitude: 10.75 }
    secondSearch.resolve({ results: [oslo] })
    await currentRequest
    expect(state.searchResults.value).toEqual([oslo])
    expect(state.isSearching.value).toBe(false)

    firstSearch.reject(new Error('stale geocoding failure'))
    await staleRequest
    expect(state.searchResults.value).toEqual([oslo])
    expect(state.searchError.value).toBe('')
    expect(state.hasSearched.value).toBe(true)
    expect(state.isSearching.value).toBe(false)
  })

  it('distinguishes a successful empty search from a provider failure', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn()
      .mockResolvedValueOnce({ results: [] })
      .mockRejectedValueOnce(new Error('geocoding provider unavailable'))
    const state = await createWeatherState(fetch)
    state.query.value = 'Atlantis'

    await state.searchLocations()
    expect(state.searchResults.value).toEqual([])
    expect(state.hasSearched.value).toBe(true)
    expect(state.searchError.value).toBe('')

    await state.searchLocations()
    expect(state.searchResults.value).toEqual([])
    expect(state.hasSearched.value).toBe(true)
    expect(state.searchError.value).toBe('errorSearchUnavailable')
    expect(state.isSearching.value).toBe(false)
  })
})
