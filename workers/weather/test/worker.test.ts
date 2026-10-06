import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleRequest } from '../src/index'
import type { Env } from '../src/index'
import { UPSTREAM_TIMEOUT_MS } from '../src/upstream'
import { normalizeWeather } from '../../../app/utils/weather'

const timestamp = 1_790_000_000
const weather = {
  timezone: 'UTC', utc_offset_seconds: 0,
  current: {
    time: timestamp, temperature_2m: 20, relative_humidity_2m: 50, apparent_temperature: 19,
    is_day: 1, precipitation: 0, weather_code: 0, wind_speed_10m: 10, wind_direction_10m: 90
  },
  hourly: {
    time: [timestamp], temperature_2m: [20], apparent_temperature: [19],
    precipitation_probability: [0], precipitation: [0], weather_code: [0], wind_speed_10m: [10]
  },
  daily: {
    time: [timestamp], weather_code: [0], temperature_2m_max: [22], temperature_2m_min: [12],
    precipitation_probability_max: [10], precipitation_sum: [0], sunshine_duration: [36000],
    sunrise: [timestamp - 18000], sunset: [timestamp + 18000]
  }
}
const place = { id: 2950159, name: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.41, timezone: 'Europe/Berlin' }
const fetchMock = vi.fn<typeof fetch>()
const clientLimit = vi.fn<Env['CLIENT_RATE_LIMITER']['limit']>()
const upstreamLimit = vi.fn<Env['UPSTREAM_RATE_LIMITER']['limit']>()
const env: Env = {
  CLIENT_RATE_LIMITER: { limit: clientLimit },
  UPSTREAM_RATE_LIMITER: { limit: upstreamLimit }
}
const request = (path: string, init?: RequestInit) => new Request(`https://api.mohrworks.com${path}`, init)

beforeEach(() => {
  clientLimit.mockResolvedValue({ success: true })
  upstreamLimit.mockResolvedValue({ success: true })
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('Worker contract', () => {
  it('returns minimal health without calling providers or rate limiters', async () => {
    const response = await handleRequest(request('/health'), env)
    expect(await response.json()).toEqual({ status: 'ok' })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(clientLimit).not.toHaveBeenCalled()
  })

  it('returns the existing normalized weather contract from a fixed provider', async () => {
    fetchMock.mockResolvedValue(Response.json(weather))
    const response = await handleRequest(request('/weather?latitude=52.52&longitude=13.40'), env)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(normalizeWeather(weather))
    const [url, options] = fetchMock.mock.calls[0]!
    const upstream = new URL(String(url))
    expect(upstream.origin + upstream.pathname).toBe('https://api.open-meteo.com/v1/forecast')
    expect(upstream.searchParams.get('forecast_days')).toBe('7')
    expect(upstream.searchParams.get('timeformat')).toBe('unixtime')
    expect(upstream.searchParams.get('longitude')).toBe('13.4')
    expect(options?.redirect).toBe('manual')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([{}, { generationtime_ms: 0.5 }, { results: [] }, { results: null }])('returns empty search results normally: %j', async (payload) => {
    fetchMock.mockResolvedValue(Response.json(payload))
    const response = await handleRequest(request('/locations?q=NoMatch'), env)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ results: [] })
  })

  it('normalizes location results and fixes language and count', async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [place] }))
    const response = await handleRequest(request('/locations?q=%20Berlin%20'), env)
    expect(await response.json()).toEqual({ results: [place] })
    const upstream = new URL(String(fetchMock.mock.calls[0]![0]))
    expect(upstream.origin + upstream.pathname).toBe('https://geocoding-api.open-meteo.com/v1/search')
    expect(Object.fromEntries(upstream.searchParams)).toEqual({
      name: 'Berlin', count: '5', language: 'en', format: 'json'
    })
  })

  it.each(['ab', 'a'.repeat(100)])('accepts search length boundary %s', async (query) => {
    fetchMock.mockResolvedValue(Response.json({}))
    expect((await handleRequest(request(`/locations?q=${query}`), env)).status).toBe(200)
  })

  it.each([
    '/weather', '/weather?latitude=&longitude=0', '/weather?latitude=NaN&longitude=0',
    '/weather?latitude=Infinity&longitude=0', '/weather?latitude=91&longitude=0',
    '/weather?latitude=0&longitude=-181', '/weather?latitude=0x1&longitude=0',
    '/weather?latitude=1e2&longitude=0', '/weather?latitude=0&latitude=1&longitude=0',
    '/weather?latitude=0&longitude=0&url=https://evil.example',
    '/locations', '/locations?q=', '/locations?q=A', '/locations?q=%00Berlin',
    `/locations?q=${'a'.repeat(101)}`, '/locations?q=Berlin&q=Paris',
    '/locations?q=Berlin&count=100', '/health?unknown=1'
  ])('rejects invalid query %s without upstream work', async (path) => {
    const response = await handleRequest(request(path), env)
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: 'invalid_request' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([[-90, -180], [90, 180], [0, 0]])('accepts coordinate boundary %s, %s', async (latitude, longitude) => {
    fetchMock.mockResolvedValue(Response.json(weather))
    expect((await handleRequest(request(`/weather?latitude=${latitude}&longitude=${longitude}`), env)).status).toBe(200)
  })

  it('rejects unknown paths and unsupported methods', async () => {
    expect((await handleRequest(request('/unknown'), env)).status).toBe(404)
    for (const method of ['POST', 'PUT', 'DELETE', 'HEAD']) {
      const response = await handleRequest(request('/weather', { method }), env)
      expect(response.status).toBe(405)
      expect(response.headers.get('Allow')).toBe('GET, OPTIONS')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('Provider failures and deadlines', () => {
  it.each([301, 302, 307, 308, 400, 401, 403, 404, 500, 503])('maps provider status %s to safe 502 without retries', async (status) => {
    fetchMock.mockResolvedValue(new Response('private provider detail', { status }))
    const response = await handleRequest(request('/locations?q=Berlin'), env)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: { code: 'upstream_status' } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('maps provider 429 explicitly', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 429 }))
    const response = await handleRequest(request('/locations?q=Berlin'), env)
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('60')
    expect(await response.json()).toMatchObject({ error: { code: 'upstream_rate_limited' } })
  })

  it('does not expose transport exception details or request data in logs', async () => {
    fetchMock.mockRejectedValue(new Error('secret private URL'))
    const response = await handleRequest(request('/locations?q=Berlin'), env)
    expect(response.status).toBe(502)
    expect(await response.text()).not.toMatch(/secret|Berlin/)
    expect(console.error).toHaveBeenCalledWith(JSON.stringify({
      event: 'request_failed', code: 'upstream_network', status: 502
    }))
  })

  it.each([
    ['invalid JSON', () => new Response('{', { headers: { 'Content-Type': 'application/json' } })],
    ['wrong media type', () => new Response('{}')],
    ['JSONP media type', () => new Response('{}', { headers: { 'Content-Type': 'application/jsonp' } })],
    ['invalid location shape', () => Response.json({ results: [{}] })],
    ['provider error object', () => Response.json({ error: true, reason: 'bad request' })],
    ['unknown envelope', () => Response.json({ unexpected: true })],
    ['invalid provider metadata', () => Response.json({ generationtime_ms: 'bad' })],
    ['too many results', () => Response.json({ results: Array.from({ length: 6 }, () => place) })],
    ['oversized response', () => Response.json({ padding: 'x'.repeat(1_000_000) })]
  ])('rejects %s', async (_, responseFactory) => {
    fetchMock.mockResolvedValue(responseFactory())
    const response = await handleRequest(request('/locations?q=Berlin'), env)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: { code: 'upstream_invalid' } })
  })

  it('rejects malformed forecasts', async () => {
    fetchMock.mockResolvedValue(Response.json({ ...weather, hourly: { ...weather.hourly, time: [] } }))
    expect((await handleRequest(request('/weather?latitude=0&longitude=0'), env)).status).toBe(502)
  })

  it('maps interrupted body streams to a safe provider error', async () => {
    fetchMock.mockResolvedValue(new Response(new ReadableStream({
      start(controller) { controller.error(new Error('private stream failure')) }
    }), { headers: { 'Content-Type': 'application/json' } }))
    const response = await handleRequest(request('/locations?q=Berlin'), env)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: { code: 'upstream_invalid' } })
  })

  it.each(['headers', 'body'])('bounds timeout including stalled %s', async (stage) => {
    vi.useFakeTimers()
    if (stage === 'headers') fetchMock.mockImplementation(() => new Promise(() => {}))
    else fetchMock.mockResolvedValue(new Response(new ReadableStream(), { headers: { 'Content-Type': 'application/json' } }))
    const pending = handleRequest(request('/locations?q=Berlin'), env)
    await vi.advanceTimersByTimeAsync(UPSTREAM_TIMEOUT_MS - 1)
    const signal = fetchMock.mock.calls[0]![1]!.signal
    expect(signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const response = await pending
    expect(response.status).toBe(504)
    expect(await response.json()).toMatchObject({ error: { code: 'upstream_timeout' } })
    expect(signal?.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('Abuse protection and CORS', () => {
  it.each(['client', 'aggregate'])('rejects exhausted %s limiter before upstream fetch', async (limiter) => {
    (limiter === 'client' ? clientLimit : upstreamLimit).mockResolvedValue({ success: false })
    const response = await handleRequest(request('/locations?q=Berlin'), env)
    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({ error: { code: 'rate_limited' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed when a limiter errors or bindings are missing', async () => {
    clientLimit.mockRejectedValue(new Error('private binding detail'))
    expect((await handleRequest(request('/locations?q=Berlin'), env)).status).toBe(503)
    expect((await handleRequest(request('/locations?q=Berlin'), {} as Env)).status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed when the aggregate limiter is unavailable', async () => {
    upstreamLimit.mockRejectedValue(new Error('private binding detail'))
    const response = await handleRequest(request('/locations?q=Berlin'), env)
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: { code: 'rate_limit_unavailable' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses the Cloudflare client IP, with a shared anonymous bucket when absent', async () => {
    fetchMock.mockResolvedValue(Response.json({}))
    await handleRequest(request('/locations?q=Berlin', { headers: { 'CF-Connecting-IP': '192.0.2.1', 'X-Forwarded-For': 'untrusted' } }), env)
    expect(clientLimit).toHaveBeenLastCalledWith({ key: '192.0.2.1' })
    await handleRequest(request('/locations?q=Berlin'), env)
    expect(clientLimit).toHaveBeenLastCalledWith({ key: 'anonymous' })
    expect(upstreamLimit).toHaveBeenLastCalledWith({ key: 'all-provider-requests' })
  })

  it('allows only the production browser origin, including safe error responses', async () => {
    const allowed = await handleRequest(request('/locations', { headers: { Origin: 'https://weather.mohrworks.com' } }), env)
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://weather.mohrworks.com')
    expect(allowed.headers.has('Access-Control-Allow-Credentials')).toBe(false)
    for (const origin of ['https://evil.example', 'null', 'http://localhost:3000']) {
      const response = await handleRequest(request('/locations?q=Berlin', { headers: { Origin: origin } }), env)
      expect(response.status).toBe(403)
      expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows GET preflight only, without upstream or limiter calls', async () => {
    const headers = { Origin: 'https://weather.mohrworks.com', 'Access-Control-Request-Method': 'GET' }
    const response = await handleRequest(request('/weather', { method: 'OPTIONS', headers }), env)
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET')
    expect((await handleRequest(request('/weather', { method: 'OPTIONS', headers: { ...headers, 'Access-Control-Request-Method': 'POST' } }), env)).status).toBe(403)
    expect((await handleRequest(request('/weather', { method: 'OPTIONS', headers: { ...headers, 'Access-Control-Request-Headers': 'Authorization' } }), env)).status).toBe(403)
    expect(clientLimit).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
