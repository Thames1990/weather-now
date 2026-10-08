import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, ref, watch } from 'vue'
import type { LocationResult, OpenMeteoWeatherResponse, WeatherResponse } from '../../shared/weather/types'
import { normalizeWeather } from '../../shared/weather/normalize'

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
const workerBaseUrl = 'https://api.example.test'
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
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { apiMode, apiBaseUrl: workerBaseUrl } }))
  vi.stubGlobal('useState', (_key: string, initial: () => unknown) => ref(initial()))
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

  it.each(['server', 'external', 'worker'])('enriches current-location identity with Open-Meteo in %s mode', async (mode) => {
    type GeoPosition = { coords: { latitude: number; longitude: number } }
    type GeoSuccess = (position: GeoPosition) => void
    const coordinates = { latitude: 50.94, longitude: 6.96 }
    const cologne: LocationResult = {
      id: 2886242,
      name: 'Cologne',
      country: 'Germany',
      admin1: 'North Rhine-Westphalia',
      latitude: 50.93333,
      longitude: 6.95,
      timezone: 'Europe/Berlin'
    }
    let onGeoSuccess: GeoSuccess | undefined
    const fetch = vi.fn(async (url: string) => {
      if (url === '/api/ip-location') throw new Error('IP location unavailable')
      if (url === '/api/reverse-geocode' || url.includes('reverse-geocode-client')) {
        return { name: 'Cologne', country: 'Germany', admin1: 'North Rhine-Westphalia' }
      }
      if (url === '/api/geocode' || url === `${workerBaseUrl}/locations` || url.includes('geocoding-api.open-meteo.com/v1/search')) {
        return { results: [cologne] }
      }
      if (url === '/api/weather' || url === `${workerBaseUrl}/weather`) return normalizeWeather(upstream)
      if (url.includes('api.open-meteo.com/v1/forecast')) return upstream
      throw new Error(`Unexpected request: ${url}`)
    })
    const state = await createWeatherState(fetch, mode)
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition(success: GeoSuccess) {
          onGeoSuccess = success
        }
      }
    })

    state.useCurrentLocation()
    await onGeoSuccess?.({ coords: coordinates })

    expect(state.selectedLocation.value).toMatchObject({
      id: cologne.id,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude
    })
    if (mode === 'worker') {
      expect(fetch).toHaveBeenCalledWith(`${workerBaseUrl}/locations`, {
        query: { q: 'Cologne', language: 'en', count: '100' }, retry: false, timeout: 15_000
      })
      expect(fetch).toHaveBeenCalledWith('https://api.bigdatacloud.net/data/reverse-geocode-client', expect.anything())
      return
    }
    expect(fetch).toHaveBeenCalledWith(
      mode === 'external' ? 'https://geocoding-api.open-meteo.com/v1/search' : '/api/geocode',
      expect.objectContaining({
        query: expect.objectContaining({ name: 'Cologne', count: 100, language: 'en' })
      })
    )
  })
})

describe('Worker API mode', () => {
  function rateLimited(retryAfter: string) {
    return Object.assign(new Error('HTTP 429'), {
      status: 429,
      response: { status: 429, headers: new Headers({ 'Retry-After': retryAfter }) }
    })
  }

  it('loads forecasts and searches through the configured Worker', async () => {
    vi.useFakeTimers()
    const berlin: LocationResult = { id: 2950159, name: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.41, timezone: 'Europe/Berlin' }
    const fetch = vi.fn(async (url: string) => url.endsWith('/weather') ? normalizeWeather(upstream) : { results: [berlin] })
    const state = await createWeatherState(fetch, 'worker')

    await state.fetchWeather(location)
    expect(state.weather.value).toEqual(normalizeWeather(upstream))
    state.query.value = 'Berlin'
    await state.searchLocations()
    expect(state.searchResults.value).toEqual([berlin])
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([`${workerBaseUrl}/weather`, `${workerBaseUrl}/locations`])
    expect(fetch).toHaveBeenCalledWith(`${workerBaseUrl}/weather`, {
      query: { latitude: '52.52', longitude: '13.41' }, retry: false, timeout: 15_000
    })
    expect(fetch).toHaveBeenCalledWith(`${workerBaseUrl}/locations`, {
      query: { q: 'Berlin', language: 'de', count: '5' }, retry: false, timeout: 15_000
    })
  })

  it('uses the Worker IP-location route and never calls ipinfo in worker mode', async () => {
    const berlin: LocationResult = { id: 2950159, name: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.41, timezone: 'Europe/Berlin', admin1: 'Berlin' }
    const fetch = vi.fn(async (url: string) => {
      if (url === `${workerBaseUrl}/ip-location`) {
        return { name: 'Berlin', country: 'DE', latitude: 52.52, longitude: 13.41 }
      }
      if (url === `${workerBaseUrl}/locations`) return { results: [berlin] }
      if (url === `${workerBaseUrl}/weather`) return normalizeWeather(upstream)
      throw new Error(`Unexpected request: ${url}`)
    })
    const state = await createWeatherState(fetch, 'worker')
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition(_success: unknown, failure: (error: unknown) => void) { failure(new Error('denied')) } }
    })

    state.useCurrentLocation()
    await vi.waitFor(() => expect(state.selectedLocation.value).toMatchObject({ id: berlin.id, name: berlin.name }))

    expect(state.selectedLocation.value).toMatchObject({ id: berlin.id, name: berlin.name })
    expect(state.errorMessage.value).toBe('')
    expect(fetch).toHaveBeenCalledWith(`${workerBaseUrl}/ip-location`, {
      query: {}, retry: false, timeout: 15_000
    })
    expect(fetch).toHaveBeenCalledWith(`${workerBaseUrl}/locations`, {
      query: { q: 'Berlin', language: 'en', count: '100' }, retry: false, timeout: 15_000
    })
    expect(fetch.mock.calls.map(([url]) => url)).not.toContain('https://ipinfo.io/json')
  })

  it('surfaces Worker IP-location 503 when browser geolocation also fails', async () => {
    const unavailable = Object.assign(new Error('HTTP 503'), { status: 503 })
    const fetch = vi.fn().mockRejectedValue(unavailable)
    const state = await createWeatherState(fetch, 'worker')
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition(_success: unknown, failure: (error: unknown) => void) { failure(new Error('denied')) } }
    })

    state.useCurrentLocation()
    await flushPromises()

    expect(state.errorMessage.value).toBe('errorServiceUnavailable')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(`${workerBaseUrl}/ip-location`, {
      query: {}, retry: false, timeout: 15_000
    })
  })

  it('shows a rate-limit message and waits for Retry-After before calling the Worker again', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn()
      .mockRejectedValueOnce(rateLimited('60'))
      .mockResolvedValue(normalizeWeather(upstream))
    const state = await createWeatherState(fetch, 'worker')

    await state.fetchWeather(location)
    expect(state.errorMessage.value).toBe('errorRateLimited')
    expect(state.isLoading.value).toBe(false)

    state.query.value = 'Berlin'
    await state.searchLocations()
    expect(state.searchError.value).toBe('errorRateLimited')
    await state.fetchWeather(location)
    expect(state.errorMessage.value).toBe('errorRateLimited')
    expect(fetch).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000)
    await state.fetchWeather(location)
    expect(state.errorMessage.value).toBe('')
    expect(state.weather.value).toEqual(normalizeWeather(upstream))
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('shows a service-unavailable message for 503 and the generic message for network errors', async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('HTTP 503'), { status: 503 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const state = await createWeatherState(fetch, 'worker')

    await state.fetchWeather(location)
    expect(state.errorMessage.value).toBe('errorServiceUnavailable')
    await state.fetchWeather(location)
    expect(state.errorMessage.value).toBe('errorForecastUnavailable')
  })
})

describe('weather and location request sequencing', () => {
  it.each([true, false])('clears search state on a current-location request (geolocation supported: %s)', async (supported) => {
    vi.useFakeTimers()
    const pendingSearch = deferred<{ results: LocationResult[] }>()
    const fetch = vi.fn((url: string, _options?: { query?: { name?: string } }) => url === '/api/geocode'
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
    const geocodeCalls = fetch.mock.calls.filter(([url]) => url === '/api/geocode')
    expect(geocodeCalls).toHaveLength(supported ? 2 : 1)
    expect(geocodeCalls.map(([, options]) => options?.query?.name)).toEqual(supported ? ['Berlin', 'Oslo'] : ['Berlin'])
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
    expect(fetch).toHaveBeenCalledTimes(4)
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
