import { isValidCoordinates, parseReverseGeocodeResult } from '~/utils/provider-validation'

export default defineCachedEventHandler(async (event) => {
  const { latitude, longitude } = getQuery(event)
  const parsedLatitude = Number(latitude)
  const parsedLongitude = Number(longitude)
  if (!isValidCoordinates(parsedLatitude, parsedLongitude)) {
    throw createError({ statusCode: 400, statusMessage: 'latitude and longitude must be valid coordinates' })
  }

  let payload: unknown
  try {
    payload = await $fetch<unknown>(
      'https://api.bigdatacloud.net/data/reverse-geocode-client',
      { query: { latitude: parsedLatitude, longitude: parsedLongitude, localityLanguage: 'en' } }
    )
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Upstream reverse-geocoding provider unavailable' })
  }

  try {
    return parseReverseGeocodeResult(payload)
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Invalid reverse-geocoding provider response' })
  }
}, {
  maxAge: 60 * 60,
  getKey: (event) => {
    const { latitude, longitude } = getQuery(event)
    // round to ~1km so nearby requests share a cache entry
    return `${Number(latitude).toFixed(2)}:${Number(longitude).toFixed(2)}`
  }
})
