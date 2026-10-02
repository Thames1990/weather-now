import type { LocationResult } from '~/types/weather'
import { parseGeocodingResults } from '~/utils/provider-validation'

export default defineEventHandler(async (event) => {
  const { name, language, id, count } = getQuery(event)
  const normalized = String(name ?? '').trim()
  const parsedId = id === undefined ? undefined : Number(id)
  if (parsedId !== undefined && (!Number.isSafeInteger(parsedId) || parsedId <= 0)) {
    throw createError({ statusCode: 400, statusMessage: 'id must be a positive integer' })
  }
  if (parsedId === undefined && normalized.length < 2) return { results: [] as LocationResult[] }
  const parsedCount = count === undefined ? 5 : Number(count)
  if (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 100) {
    throw createError({ statusCode: 400, statusMessage: 'count must be between 1 and 100' })
  }

  let payload: unknown
  try {
    payload = parsedId === undefined
      ? await $fetch<unknown>('https://geocoding-api.open-meteo.com/v1/search', {
          query: { name: normalized, count: parsedCount, language: language || 'en', format: 'json' }
        })
      : { results: [await $fetch<unknown>('https://geocoding-api.open-meteo.com/v1/get', {
          query: { id: parsedId, language: language || 'en', format: 'json' }
        })] }
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Upstream geocoding provider unavailable' })
  }

  try {
    return { results: parseGeocodingResults(payload) }
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Invalid geocoding provider response' })
  }
})
