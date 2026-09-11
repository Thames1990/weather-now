import type { LocationResult } from '~/types/weather'

export default defineEventHandler(async (event) => {
  const { name, language } = getQuery(event)
  const normalized = String(name ?? '').trim()
  if (normalized.length < 2) return { results: [] as LocationResult[] }

  try {
    const response = await $fetch<{ results?: LocationResult[] }>('https://geocoding-api.open-meteo.com/v1/search', {
      query: { name: normalized, count: 5, language: language || 'en', format: 'json' }
    })
    return { results: response.results ?? [] }
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Upstream geocoding provider unavailable' })
  }
})
