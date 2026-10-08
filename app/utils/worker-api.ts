import type { LocationResult, WeatherResponse } from '~/types/weather'
import { parseGeocodingResults, parseIpLocationResult } from '#shared/weather/provider-validation'

export type WorkerFetchOptions = {
  query: Record<string, string>
  retry: false
  timeout: number
}
export type WorkerFetcher = (url: string, options: WorkerFetchOptions) => Promise<unknown>

export type ApiUnavailableReason = 'rate-limited' | 'unavailable'
export type WorkerLanguage = 'en' | 'de'
export type WorkerApiCooldown = {
  blockedUntil: number
  blockedReason: ApiUnavailableReason
}

/** Raised when the Worker reports 429/503, or while a previous Retry-After window is still active. */
export class ApiUnavailableError extends Error {
  constructor(readonly reason: ApiUnavailableReason, readonly retryAt?: number) {
    super(reason === 'rate-limited' ? 'Weather API rate limit reached' : 'Weather API temporarily unavailable')
    this.name = 'ApiUnavailableError'
  }
}

/** Raised when a saved Open-Meteo location ID no longer resolves. */
export class LocationNotFoundError extends Error {
  constructor() {
    super('Saved location not found')
    this.name = 'LocationNotFoundError'
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

function isWorkerLanguage(value: string): value is WorkerLanguage {
  return value === 'en' || value === 'de'
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

export function createWorkerApi(
  baseUrl: string,
  fetcher: WorkerFetcher,
  now: () => number = Date.now,
  cooldown: WorkerApiCooldown = { blockedUntil: 0, blockedReason: 'rate-limited' }
) {
  async function get(path: string, query: Record<string, string>): Promise<unknown> {
    if (now() < cooldown.blockedUntil) throw new ApiUnavailableError(cooldown.blockedReason, cooldown.blockedUntil)
    try {
      // retry: false disables ofetch's automatic GET retry, which would otherwise repeat 429/503 responses immediately.
      return await fetcher(`${baseUrl}${path}`, { query, retry: false, timeout: requestTimeoutMs })
    } catch (error) {
      const status = errorStatus(error)
      if (status === 404 && path.startsWith('/locations/')) throw new LocationNotFoundError()
      if (status !== 429 && status !== 503) throw error
      const reason: ApiUnavailableReason = status === 429 ? 'rate-limited' : 'unavailable'
      const delay = parseRetryAfter(retryAfterHeader(error), now()) ?? (status === 429 ? defaultRateLimitDelayMs : 0)
      if (delay > 0) {
        cooldown.blockedUntil = now() + delay
        cooldown.blockedReason = reason
      }
      throw new ApiUnavailableError(reason, delay > 0 ? cooldown.blockedUntil : undefined)
    }
  }

  return {
    async weather(latitude: number, longitude: number): Promise<WeatherResponse> {
      return parseWeatherResponse(await get('/weather', {
        latitude: formatCoordinate(latitude),
        longitude: formatCoordinate(longitude)
      }))
    },
    async locations(
      name: string,
      options: { language?: string; count?: number } = {}
    ): Promise<LocationResult[]> {
      const query = name.trim()
      const language = options.language ?? 'en'
      const count = options.count ?? 5
      if (query.length < 2 || query.length > 100 || [...query].some(character => {
        const code = character.charCodeAt(0)
        return code < 32 || code === 127
      })) throw new Error('Invalid Worker location query')
      if (!isWorkerLanguage(language)) throw new Error('Invalid Worker location language')
      if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('Invalid Worker location count')
      const results = parseGeocodingResults(await get('/locations', {
        q: query,
        language,
        count: String(count)
      }))
      if (results.length > count) throw new Error('Invalid Worker geocoding response')
      return results
    },
    async location(id: number, language = 'en'): Promise<LocationResult> {
      if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid Worker location ID')
      if (!isWorkerLanguage(language)) throw new Error('Invalid Worker location language')
      const results = parseGeocodingResults(await get(`/locations/${id}`, { language }))
      if (results.length !== 1 || results[0]?.id !== id) throw new Error('Invalid Worker location response')
      return results[0]
    },
    async ipLocation() {
      return parseIpLocationResult(await get('/ip-location', {}))
    }
  }
}

export type WorkerApi = ReturnType<typeof createWorkerApi>

/** Maps API failures to translated message keys, keeping the caller's generic message for other errors. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof LocationNotFoundError) return 'errorFavoriteLocationNotFound'
  if (!(error instanceof ApiUnavailableError)) return fallback
  return error.reason === 'rate-limited' ? 'errorRateLimited' : 'errorServiceUnavailable'
}
