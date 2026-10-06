import { describe, expect, it, vi } from 'vitest'
import type { LocationResult, OpenMeteoWeatherResponse } from '~/types/weather'
import { resolveApiConfig } from '~/utils/api-config'
import { normalizeWeather } from '~/utils/weather'
import { ApiUnavailableError, apiErrorMessage, createWorkerApi, formatCoordinate, parseRetryAfter } from '~/utils/worker-api'

const baseUrl = 'https://api.example.test'
const berlin: LocationResult = { id: 2950159, name: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.41, timezone: 'Europe/Berlin', admin1: 'Berlin' }
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

function httpError(status: number, retryAfter?: string) {
  return Object.assign(new Error(`HTTP ${status}`), {
    status,
    response: { status, headers: new Headers(retryAfter === undefined ? {} : { 'Retry-After': retryAfter }) }
  })
}

describe('API configuration', () => {
  it('defaults to server routes and keeps existing modes working', () => {
    expect(resolveApiConfig({})).toEqual({ apiMode: 'server', apiBaseUrl: '' })
    expect(resolveApiConfig({ NUXT_PUBLIC_API_MODE: 'external' })).toEqual({ apiMode: 'external', apiBaseUrl: '' })
  })

  it('requires an absolute base URL in worker mode and drops trailing slashes', () => {
    expect(resolveApiConfig({ NUXT_PUBLIC_API_MODE: 'worker', NUXT_PUBLIC_API_BASE_URL: 'https://api.mohrworks.com/' }))
      .toEqual({ apiMode: 'worker', apiBaseUrl: 'https://api.mohrworks.com' })
    expect(() => resolveApiConfig({ NUXT_PUBLIC_API_MODE: 'worker' })).toThrow(/NUXT_PUBLIC_API_BASE_URL/)
    expect(() => resolveApiConfig({ NUXT_PUBLIC_API_MODE: 'worker', NUXT_PUBLIC_API_BASE_URL: 'api.mohrworks.com' })).toThrow(/absolute URL/)
    expect(() => resolveApiConfig({ NUXT_PUBLIC_API_MODE: 'worker', NUXT_PUBLIC_API_BASE_URL: 'ftp://api.mohrworks.com' })).toThrow(/http or https/)
    expect(() => resolveApiConfig({ NUXT_PUBLIC_API_MODE: 'worker', NUXT_PUBLIC_API_BASE_URL: 'https://api.mohrworks.com/?key=1' })).toThrow(/query string/)
  })

  it('rejects unknown API modes instead of silently falling back', () => {
    expect(() => resolveApiConfig({ NUXT_PUBLIC_API_MODE: 'cloudflare' })).toThrow(/server, external, worker/)
  })
})

describe('Worker API client', () => {
  it('requests the Worker contract without automatic retries', async () => {
    const weather = normalizeWeather(upstream)
    const fetch = vi.fn()
      .mockResolvedValueOnce(weather)
      .mockResolvedValueOnce({ results: [berlin] })
    const api = createWorkerApi(baseUrl, fetch)

    expect(await api.weather(52.52, 13.41)).toEqual(weather)
    expect(await api.locations('  Berlin ')).toEqual([berlin])
    expect(fetch).toHaveBeenNthCalledWith(1, `${baseUrl}/weather`, {
      query: { latitude: '52.52', longitude: '13.41' }, retry: false, timeout: 15_000
    })
    expect(fetch).toHaveBeenNthCalledWith(2, `${baseUrl}/locations`, {
      query: { q: 'Berlin' }, retry: false, timeout: 15_000
    })
  })

  it('formats coordinates as plain decimals accepted by the Worker', () => {
    expect(formatCoordinate(-0.1276)).toBe('-0.1276')
    expect(formatCoordinate(1e-7)).toBe('0.000000')
  })

  it('rejects malformed Worker payloads', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ timezone: 'UTC' })
      .mockResolvedValueOnce({ results: [{ name: 'Nowhere' }] })
    const api = createWorkerApi(baseUrl, fetch)
    await expect(api.weather(0, 0)).rejects.toThrow('Invalid weather API response')
    await expect(api.locations('Nowhere')).rejects.toThrow(/geocoding result/)
  })

  it('honors Retry-After after a 429 without contacting the Worker again', async () => {
    let now = 1_000_000
    const fetch = vi.fn()
      .mockRejectedValueOnce(httpError(429, '30'))
      .mockResolvedValueOnce({ results: [berlin] })
    const api = createWorkerApi(baseUrl, fetch, () => now)

    const first = await api.locations('Berlin').catch((error: unknown) => error)
    expect(first).toBeInstanceOf(ApiUnavailableError)
    expect(first).toMatchObject({ reason: 'rate-limited', retryAt: now + 30_000 })

    now += 29_999
    await expect(api.weather(52.52, 13.41)).rejects.toMatchObject({ reason: 'rate-limited' })
    expect(fetch).toHaveBeenCalledTimes(1)

    now += 1
    expect(await api.locations('Berlin')).toEqual([berlin])
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('backs off for a minute when a 429 omits Retry-After', async () => {
    let now = 0
    const fetch = vi.fn().mockRejectedValue(httpError(429))
    const api = createWorkerApi(baseUrl, fetch, () => now)
    await expect(api.locations('Berlin')).rejects.toMatchObject({ reason: 'rate-limited', retryAt: 60_000 })
    now = 59_999
    await expect(api.locations('Berlin')).rejects.toBeInstanceOf(ApiUnavailableError)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('reports 503 as unavailable and only waits when the Worker asks for it', async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(httpError(503))
      .mockRejectedValueOnce(httpError(503, '5'))
    const api = createWorkerApi(baseUrl, fetch, () => 0)
    await expect(api.weather(1, 2)).rejects.toMatchObject({ reason: 'unavailable', retryAt: undefined })
    await expect(api.weather(1, 2)).rejects.toMatchObject({ reason: 'unavailable', retryAt: 5_000 })
    await expect(api.weather(1, 2)).rejects.toMatchObject({ reason: 'unavailable' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('passes network and other HTTP failures through to the generic error path', async () => {
    const network = new TypeError('Failed to fetch')
    const fetch = vi.fn()
      .mockRejectedValueOnce(network)
      .mockRejectedValueOnce(httpError(502))
      .mockResolvedValueOnce({ results: [] })
    const api = createWorkerApi(baseUrl, fetch, () => 0)
    await expect(api.locations('Berlin')).rejects.toBe(network)
    await expect(api.locations('Berlin')).rejects.toMatchObject({ status: 502 })
    expect(await api.locations('Atlantis')).toEqual([])
  })

  it('parses Retry-After seconds and HTTP dates within bounds', () => {
    const now = Date.parse('2026-10-06T12:00:00Z')
    expect(parseRetryAfter('60', now)).toBe(60_000)
    expect(parseRetryAfter('Tue, 06 Oct 2026 12:00:10 GMT', now)).toBe(10_000)
    expect(parseRetryAfter('Tue, 06 Oct 2026 11:00:00 GMT', now)).toBe(0)
    expect(parseRetryAfter('86400', now)).toBe(600_000)
    expect(parseRetryAfter('soon', now)).toBeUndefined()
    expect(parseRetryAfter(null, now)).toBeUndefined()
  })

  it('maps API failures to translated messages', () => {
    expect(apiErrorMessage(new ApiUnavailableError('rate-limited'), 'errorForecastUnavailable')).toBe('errorRateLimited')
    expect(apiErrorMessage(new ApiUnavailableError('unavailable'), 'errorForecastUnavailable')).toBe('errorServiceUnavailable')
    expect(apiErrorMessage(new Error('offline'), 'errorSearchUnavailable')).toBe('errorSearchUnavailable')
  })
})
