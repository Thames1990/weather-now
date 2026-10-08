import { isValidCoordinates, parseGeocodingResults, parseOpenMeteoWeatherResponse } from '../../../shared/weather/provider-validation'
import { normalizeWeather } from '../../../shared/weather/normalize'
import { ApiError, fetchJson } from './upstream'

export interface Env {
  CLIENT_RATE_LIMITER: RateLimit
  UPSTREAM_RATE_LIMITER: RateLimit
  CF_VERSION_METADATA?: { id: string }
}

const BROWSER_ORIGIN = 'https://weather.mohrworks.com'
const current = 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m'
const hourly = 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m'
const daily = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunshine_duration,sunrise,sunset'

function validateQuery(params: URLSearchParams, allowed: string[]): void {
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) {
      throw new ApiError(400, 'invalid_request', 'Unknown or repeated query parameter')
    }
  }
}

function coordinate(params: URLSearchParams, key: string): number {
  const value = params.get(key)
  if (!value || value.length > 24 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) {
    throw new ApiError(400, 'invalid_request', 'latitude and longitude must be finite decimal coordinates')
  }
  return Number(value)
}

export const SUPPORTED_LANGUAGES = ['en', 'de'] as const
const DEFAULT_SEARCH_COUNT = 5
const MAX_SEARCH_COUNT = 100
const LOCATION_ID_PATH = /^\/locations\/([^/]+)$/

type Route =
  | { kind: 'weather'; upstream: URL }
  | { kind: 'search'; upstream: URL; maxResults: number }
  | { kind: 'location'; upstream: URL; id: number }

type RouteTemplate = '/weather' | '/locations' | '/locations/:id' | '/ip-location' | '/health' | 'other'

function language(params: URLSearchParams): string {
  const value = params.get('language')
  if (value === null) return 'en'
  if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(value)) {
    throw new ApiError(400, 'invalid_request', `language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`)
  }
  return value
}

function searchCount(params: URLSearchParams): number {
  const value = params.get('count')
  if (value === null) return DEFAULT_SEARCH_COUNT
  const count = /^[1-9]\d{0,2}$/.test(value) ? Number(value) : Number.NaN
  if (!(count <= MAX_SEARCH_COUNT)) {
    throw new ApiError(400, 'invalid_request', `count must be an integer from 1 to ${MAX_SEARCH_COUNT}`)
  }
  return count
}

function locationId(segment: string): number {
  const id = /^[1-9]\d{0,15}$/.test(segment) ? Number(segment) : Number.NaN
  if (!Number.isSafeInteger(id)) {
    throw new ApiError(400, 'invalid_request', 'Location ID must be a positive integer')
  }
  return id
}

function route(url: URL): Route {
  if (url.pathname === '/weather') {
    validateQuery(url.searchParams, ['latitude', 'longitude'])
    const latitude = coordinate(url.searchParams, 'latitude')
    const longitude = coordinate(url.searchParams, 'longitude')
    if (!isValidCoordinates(latitude, longitude)) {
      throw new ApiError(400, 'invalid_request', 'Coordinates are outside supported bounds')
    }
    const upstream = new URL('https://api.open-meteo.com/v1/forecast')
    upstream.search = new URLSearchParams({
      latitude: String(latitude), longitude: String(longitude),
      current, hourly, daily, timezone: 'auto', timeformat: 'unixtime', forecast_days: '7'
    }).toString()
    return { kind: 'weather', upstream }
  }

  const idSegment = LOCATION_ID_PATH.exec(url.pathname)?.[1]
  if (idSegment !== undefined) {
    const id = locationId(idSegment)
    validateQuery(url.searchParams, ['language'])
    const upstream = new URL('https://geocoding-api.open-meteo.com/v1/get')
    upstream.search = new URLSearchParams({
      id: String(id), language: language(url.searchParams), format: 'json'
    }).toString()
    return { kind: 'location', upstream, id }
  }

  validateQuery(url.searchParams, ['q', 'language', 'count'])
  const query = url.searchParams.get('q')?.trim()
  if (!query || query.length < 2 || query.length > 100
    || [...query].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new ApiError(400, 'invalid_request', 'q must contain 2 to 100 characters without control characters')
  }
  const count = searchCount(url.searchParams)
  const upstream = new URL('https://geocoding-api.open-meteo.com/v1/search')
  upstream.search = new URLSearchParams({
    name: query, count: String(count), language: language(url.searchParams), format: 'json'
  }).toString()
  return { kind: 'search', upstream, maxResults: count }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLocationNotFound(payload: unknown): boolean {
  return isObject(payload) && payload.error === true && payload.reason === 'Location ID not found.'
}

function parseSearch(payload: unknown, maxResults: number): unknown {
  if (!isObject(payload)
    || (!('results' in payload) && Object.keys(payload).some(key => key !== 'generationtime_ms'))
    || ('generationtime_ms' in payload
      && (typeof payload.generationtime_ms !== 'number'
        || !Number.isFinite(payload.generationtime_ms) || payload.generationtime_ms < 0))
    || (Array.isArray(payload.results) && payload.results.length > maxResults)) {
    throw new Error('Invalid geocoding envelope')
  }
  return { results: parseGeocodingResults(payload) }
}

function parseLocation(payload: unknown, id: number): unknown {
  // Open-Meteo /v1/get returns one bare location; wrap it in the search contract the app already parses.
  if (!isObject(payload) || payload.id !== id) throw new Error('Invalid location payload')
  return { results: parseGeocodingResults({ results: [payload] }) }
}

function decimal(value: unknown): number | undefined {
  return typeof value === 'string' && value.length <= 24 && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)
    ? Number(value)
    : undefined
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function ipLocation(request: Request): Record<string, string | number> {
  // Cloudflare derives these fields from the connecting IP at the edge; no third party is contacted.
  const cf: unknown = request.cf
  const properties = isObject(cf) ? cf : {}
  const latitude = decimal(properties.latitude)
  const longitude = decimal(properties.longitude)
  if (latitude === undefined || longitude === undefined || !isValidCoordinates(latitude, longitude)) {
    throw new ApiError(503, 'ip_location_unavailable', 'Approximate location unavailable')
  }
  const result: Record<string, string | number> = {
    name: optionalText(properties.city) ?? '',
    country: optionalText(properties.country) ?? '',
    latitude,
    longitude
  }
  const region = optionalText(properties.region)
  if (region) result.region = region
  return result
}

async function enforceRateLimit(request: Request, env: Env, upstream: boolean): Promise<void> {
  try {
    // Cloudflare supplies this header at the edge; never use caller-supplied X-Forwarded-For.
    const key = request.headers.get('CF-Connecting-IP') || 'anonymous'
    if (!(await env.CLIENT_RATE_LIMITER.limit({ key })).success
      || (upstream && !(await env.UPSTREAM_RATE_LIMITER.limit({ key: 'all-provider-requests' })).success)) {
      throw new ApiError(429, 'rate_limited', 'Request limit reached')
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(503, 'rate_limit_unavailable', 'Abuse protection unavailable')
  }
}

type UpstreamOutcome = 'ok' | 'timeout' | 'status' | 'invalid' | 'rate_limited' | 'none'

interface RequestTelemetry {
  upstreamOutcome: UpstreamOutcome
  upstreamMs: number | null
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt))
}

function routeTemplate(pathname: string): RouteTemplate {
  if (pathname === '/weather' || pathname === '/locations' || pathname === '/ip-location' || pathname === '/health') {
    return pathname
  }
  return LOCATION_ID_PATH.test(pathname) ? '/locations/:id' : 'other'
}

function outcomeForUpstreamError(error: unknown): Exclude<UpstreamOutcome, 'ok' | 'none'> {
  if (error instanceof ApiError) {
    if (error.code === 'upstream_timeout') return 'timeout'
    if (error.code === 'upstream_rate_limited') return 'rate_limited'
    if (error.code === 'upstream_invalid') return 'invalid'
  }
  return 'status'
}

async function fetchWithTelemetry(url: URL, telemetry: RequestTelemetry, options: Parameters<typeof fetchJson>[1]): Promise<unknown> {
  const startedAt = performance.now()
  try {
    const payload = await fetchJson(url, options)
    telemetry.upstreamOutcome = 'ok'
    return payload
  } catch (error) {
    telemetry.upstreamOutcome = outcomeForUpstreamError(error)
    throw error
  } finally {
    telemetry.upstreamMs = elapsedMs(startedAt)
  }
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const startedAt = performance.now()
  const telemetry: RequestTelemetry = { upstreamOutcome: 'none', upstreamMs: null }
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin'
  })
  let routeName: RouteTemplate = 'other'
  let method = 'unknown'
  let code: string | null = null
  let response: Response
  try {
    const url = new URL(request.url)
    routeName = routeTemplate(url.pathname)
    method = request.method
    const origin = request.headers.get('Origin')
    if (origin === BROWSER_ORIGIN) {
      headers.set('Access-Control-Allow-Origin', BROWSER_ORIGIN)
      headers.set('Access-Control-Expose-Headers', 'Retry-After')
    }
    if (origin !== null && origin !== BROWSER_ORIGIN) {
      throw new ApiError(403, 'origin_not_allowed', 'Browser origin not allowed')
    }
    if (routeName === 'other') {
      throw new ApiError(404, 'not_found', 'Endpoint not found')
    }
    if (request.method === 'OPTIONS') {
      if (origin !== BROWSER_ORIGIN || request.headers.get('Access-Control-Request-Method') !== 'GET'
        || request.headers.get('Access-Control-Request-Headers')) {
        throw new ApiError(403, 'preflight_not_allowed', 'Preflight request not allowed')
      }
      headers.set('Access-Control-Allow-Methods', 'GET')
      response = new Response(null, { status: 204, headers })
    } else if (request.method !== 'GET') {
      headers.set('Allow', 'GET, OPTIONS')
      throw new ApiError(405, 'method_not_allowed', 'Only GET is supported')
    } else if (url.pathname === '/health') {
      validateQuery(url.searchParams, [])
      response = Response.json({ status: 'ok' }, { headers })
    } else if (url.pathname === '/ip-location') {
      validateQuery(url.searchParams, [])
      await enforceRateLimit(request, env, false)
      response = Response.json(ipLocation(request), { headers })
    } else {
      const target = route(url)
      await enforceRateLimit(request, env, true)
      const payload = await fetchWithTelemetry(
        target.upstream,
        telemetry,
        target.kind === 'location' ? { isNotFound: isLocationNotFound } : {}
      )
      let result: unknown
      try {
        if (isObject(payload) && 'error' in payload) throw new Error('Provider error payload')
        result = target.kind === 'weather'
          ? normalizeWeather(parseOpenMeteoWeatherResponse(payload))
          : target.kind === 'search'
            ? parseSearch(payload, target.maxResults)
            : parseLocation(payload, target.id)
      } catch {
        telemetry.upstreamOutcome = 'invalid'
        throw new ApiError(502, 'upstream_invalid', 'Invalid provider response')
      }
      response = Response.json(result, { headers })
    }
  } catch (error) {
    const failure = error instanceof ApiError
      ? error
      : new ApiError(500, 'internal_error', 'Unexpected server error')
    code = failure.code
    if (failure.status === 429) headers.set('Retry-After', '60')
    response = Response.json({ error: { code: failure.code, message: failure.message } }, {
      status: failure.status, headers
    })
  }
  const summary = {
    event: 'request',
    route: routeName,
    method,
    status: response.status,
    code,
    duration_ms: elapsedMs(startedAt),
    upstream_outcome: telemetry.upstreamOutcome,
    upstream_ms: telemetry.upstreamMs,
    version: env.CF_VERSION_METADATA?.id ?? 'local'
  }
  if (response.status >= 500) console.error(summary)
  else console.log(summary)
  return response
}

export default {
  fetch: handleRequest
} satisfies ExportedHandler<Env>
