import { isValidCoordinates, parseGeocodingResults, parseOpenMeteoWeatherResponse } from '../../../app/utils/provider-validation'
import { normalizeWeather } from '../../../app/utils/weather'
import { ApiError, fetchJson } from './upstream'

export interface Env {
  CLIENT_RATE_LIMITER: RateLimit
  UPSTREAM_RATE_LIMITER: RateLimit
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

function upstreamUrl(url: URL): URL {
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
    return upstream
  }

  validateQuery(url.searchParams, ['q'])
  const query = url.searchParams.get('q')?.trim()
  if (!query || query.length < 2 || query.length > 100
    || [...query].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new ApiError(400, 'invalid_request', 'q must contain 2 to 100 characters without control characters')
  }
  const upstream = new URL('https://geocoding-api.open-meteo.com/v1/search')
  upstream.search = new URLSearchParams({ name: query, count: '5', language: 'en', format: 'json' }).toString()
  return upstream
}

async function enforceRateLimit(request: Request, env: Env): Promise<void> {
  try {
    // Cloudflare supplies this header at the edge; never use caller-supplied X-Forwarded-For.
    const key = request.headers.get('CF-Connecting-IP') || 'anonymous'
    if (!(await env.CLIENT_RATE_LIMITER.limit({ key })).success
      || !(await env.UPSTREAM_RATE_LIMITER.limit({ key: 'all-provider-requests' })).success) {
      throw new ApiError(429, 'rate_limited', 'Request limit reached')
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(503, 'rate_limit_unavailable', 'Abuse protection unavailable')
  }
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const origin = request.headers.get('Origin')
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin'
  })
  if (origin === BROWSER_ORIGIN) headers.set('Access-Control-Allow-Origin', BROWSER_ORIGIN)
  try {
    if (origin !== null && origin !== BROWSER_ORIGIN) {
      throw new ApiError(403, 'origin_not_allowed', 'Browser origin not allowed')
    }
    if (!['/health', '/weather', '/locations'].includes(url.pathname)) {
      throw new ApiError(404, 'not_found', 'Endpoint not found')
    }
    if (request.method === 'OPTIONS') {
      if (origin !== BROWSER_ORIGIN || request.headers.get('Access-Control-Request-Method') !== 'GET'
        || request.headers.get('Access-Control-Request-Headers')) {
        throw new ApiError(403, 'preflight_not_allowed', 'Preflight request not allowed')
      }
      headers.set('Access-Control-Allow-Methods', 'GET')
      return new Response(null, { status: 204, headers })
    }
    if (request.method !== 'GET') {
      headers.set('Allow', 'GET, OPTIONS')
      throw new ApiError(405, 'method_not_allowed', 'Only GET is supported')
    }
    if (url.pathname === '/health') {
      validateQuery(url.searchParams, [])
      return Response.json({ status: 'ok' }, { headers })
    }
    const upstream = upstreamUrl(url)
    await enforceRateLimit(request, env)
    const payload = await fetchJson(upstream)
    let result: unknown
    try {
      if (typeof payload === 'object' && payload !== null && 'error' in payload) {
        throw new Error('Provider error payload')
      }
      if (url.pathname === '/locations' && typeof payload === 'object' && payload !== null) {
        if ((!('results' in payload) && Object.keys(payload).some(key => key !== 'generationtime_ms'))
          || ('generationtime_ms' in payload
            && (typeof payload.generationtime_ms !== 'number'
              || !Number.isFinite(payload.generationtime_ms) || payload.generationtime_ms < 0))
          || ('results' in payload && Array.isArray(payload.results) && payload.results.length > 5)) {
          throw new Error('Invalid geocoding envelope')
        }
      }
      result = url.pathname === '/weather'
        ? normalizeWeather(parseOpenMeteoWeatherResponse(payload))
        : { results: parseGeocodingResults(payload) }
    } catch {
      throw new ApiError(502, 'upstream_invalid', 'Invalid provider response')
    }
    return Response.json(result, { headers })
  } catch (error) {
    const failure = error instanceof ApiError
      ? error
      : new ApiError(500, 'internal_error', 'Unexpected server error')
    if (failure.status >= 500 || failure.code === 'upstream_rate_limited') {
      console.error(JSON.stringify({ event: 'request_failed', code: failure.code, status: failure.status }))
    }
    if (failure.status === 429) headers.set('Retry-After', '60')
    return Response.json({ error: { code: failure.code, message: failure.message } }, {
      status: failure.status, headers
    })
  }
}

export default {
  fetch: handleRequest
} satisfies ExportedHandler<Env>
