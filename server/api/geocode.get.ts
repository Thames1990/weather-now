import type { LocationResult } from '~/types/weather'
import { parseGeocodingResults } from '~/utils/provider-validation'

export default defineEventHandler(async (event) => {
  const { name, language } = getQuery(event)
  const normalized = String(name ?? '').trim()
  if (normalized.length < 2) return { results: [] as LocationResult[] }

  let payload: unknown
  try {
    payload = await $fetch<unknown>('https://geocoding-api.open-meteo.com/v1/search', {
      query: { name: normalized, count: 5, language: language || 'en', format: 'json' }
    })
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Upstream geocoding provider unavailable' })
  }

  try {
    return { results: parseGeocodingResults(payload) }
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Invalid geocoding provider response' })
  }
})
