export default defineCachedEventHandler(async (event) => {
  const { latitude, longitude } = getQuery(event)
  const parsedLatitude = Number(latitude)
  const parsedLongitude = Number(longitude)
  if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) {
    throw createError({ statusCode: 400, statusMessage: 'latitude and longitude are required numeric query params' })
  }

  try {
    const place = await $fetch<{ city?: string; locality?: string; principalSubdivision?: string; countryName?: string }>(
      'https://api.bigdatacloud.net/data/reverse-geocode-client',
      { query: { latitude: parsedLatitude, longitude: parsedLongitude, localityLanguage: 'en' } }
    )
    return {
      name: place.city || place.locality || place.principalSubdivision || '',
      country: place.countryName || ''
    }
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Upstream reverse-geocoding provider unavailable' })
  }
}, {
  maxAge: 60 * 60,
  getKey: (event) => {
    const { latitude, longitude } = getQuery(event)
    // round to ~1km so nearby requests share a cache entry
    return `${Number(latitude).toFixed(2)}:${Number(longitude).toFixed(2)}`
  }
})
