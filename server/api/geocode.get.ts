import type { LocationResult } from '~/types/weather'
import { parseGeocodingResults } from '~/utils/provider-validation'
import { fetchAndParseProviderResponse } from '../utils/provider'

export default defineEventHandler(async (event): Promise<{ results: LocationResult[] }> => {
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

  return fetchAndParseProviderResponse(
    async (): Promise<unknown> => {
      if (parsedId === undefined) {
        return $fetch<unknown>('https://geocoding-api.open-meteo.com/v1/search', {
          query: { name: normalized, count: parsedCount, language: language || 'en', format: 'json' }
        })
      }
      return { results: [await $fetch<unknown>('https://geocoding-api.open-meteo.com/v1/get', {
        query: { id: parsedId, language: language || 'en', format: 'json' }
      })] }
    },
    payload => ({ results: parseGeocodingResults(payload) }),
    'geocoding'
  )
})
