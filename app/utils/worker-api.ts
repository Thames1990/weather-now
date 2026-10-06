import type { LocationResult, WeatherResponse } from '~/types/weather'
import { parseGeocodingResults } from '~/utils/provider-validation'

export type WorkerFetchOptions = {
  query: Record<string, string>
  retry: false
  timeout: number
}
export type WorkerFetcher = (url: string, options: WorkerFetchOptions) => Promise<unknown>

export type ApiUnavailableReason = 'rate-limited' | 'unavailable'

/** Raised when the Worker reports 429/503, or while a previous Retry-After window is still active. */
export class ApiUnavailableError extends Error {
  constructor(readonly reason: ApiUnavailableReason, readonly retryAt?: number) {
    super(reason === 'rate-limited' ? 'Weather API rate limit reached' : 'Weather API temporarily unavailable')
    this.name = 'ApiUnavailableError'
  }
}

const requestTimeoutMs = 15_000
const defaultRateLimitDelayMs = 60_000
const maxRetryAfterMs = 10 * 60_000

type FetchErrorLike = {
  status?: unknown
  statusCode?: unknown
  response?: { status?: unknown; headers?: { get?: (name: string) => string | null } }
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const { status, statusCode, response } = error as FetchErrorLike
  const value = status ?? statusCode ?? response?.status
  return typeof value === 'number' ? value : undefined
}

function retryAfterHeader(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const headers = (error as FetchErrorLike).response?.headers
  return typeof headers?.get === 'function' ? headers.get('retry-after') : null
}

/** Parses Retry-After (delay-seconds or HTTP-date) into a bounded delay in milliseconds. */
export function parseRetryAfter(value: string | null, now: number): number | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  const delay = /^\d+$/.test(trimmed) ? Number(trimmed) * 1000 : Date.parse(trimmed) - now
  if (!Number.isFinite(delay)) return undefined
  return Math.min(Math.max(delay, 0), maxRetryAfterMs)
}

/** The Worker accepts plain decimal strings only, so avoid exponent notation for tiny values. */
export function formatCoordinate(value: number): string {
  const text = String(value)
  return /e/i.test(text) ? value.toFixed(6) : text
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(entry => typeof entry === 'string')
}

function parseWeatherResponse(value: unknown): WeatherResponse {
  const record = value as Partial<WeatherResponse> | null
  if (typeof record !== 'object' || record === null || Array.isArray(record)
    || typeof record.timezone !== 'string'
    || typeof record.current !== 'object' || record.current === null || typeof record.current.time !== 'string'
    || typeof record.hourly !== 'object' || record.hourly === null || !isStringArray(record.hourly.time)
    || typeof record.daily !== 'object' || record.daily === null || !isStringArray(record.daily.time)) {
    throw new Error('Invalid weather API response')
  }
  return record as WeatherResponse
}

export function createWorkerApi(baseUrl: string, fetcher: WorkerFetcher, now: () => number = Date.now) {
  let blockedUntil = 0
  let blockedReason: ApiUnavailableReason = 'rate-limited'

  async function get(path: string, query: Record<string, string>): Promise<unknown> {
    if (now() < blockedUntil) throw new ApiUnavailableError(blockedReason, blockedUntil)
    try {
      // retry: false disables ofetch's automatic GET retry, which would otherwise repeat 429/503 responses immediately.
      return await fetcher(`${baseUrl}${path}`, { query, retry: false, timeout: requestTimeoutMs })
    } catch (error) {
      const status = errorStatus(error)
      if (status !== 429 && status !== 503) throw error
      const reason: ApiUnavailableReason = status === 429 ? 'rate-limited' : 'unavailable'
      const delay = parseRetryAfter(retryAfterHeader(error), now()) ?? (status === 429 ? defaultRateLimitDelayMs : 0)
      if (delay > 0) {
        blockedUntil = now() + delay
        blockedReason = reason
      }
      throw new ApiUnavailableError(reason, delay > 0 ? blockedUntil : undefined)
    }
  }

  return {
    async weather(latitude: number, longitude: number): Promise<WeatherResponse> {
      return parseWeatherResponse(await get('/weather', {
        latitude: formatCoordinate(latitude),
        longitude: formatCoordinate(longitude)
      }))
    },
    async locations(query: string): Promise<LocationResult[]> {
      return parseGeocodingResults(await get('/locations', { q: query.trim() }))
    }
  }
}

export type WorkerApi = ReturnType<typeof createWorkerApi>

/** Maps API failures to translated message keys, keeping the caller's generic message for other errors. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiUnavailableError)) return fallback
  return error.reason === 'rate-limited' ? 'errorRateLimited' : 'errorServiceUnavailable'
}
