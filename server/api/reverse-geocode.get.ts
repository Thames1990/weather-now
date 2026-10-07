import { parseReverseGeocodeResult, type ReverseGeocodeResult } from '~/utils/provider-validation'
import { fetchAndParseProviderResponse, parseCoordinates } from '../utils/provider'

export default defineCachedEventHandler(async (event): Promise<ReverseGeocodeResult> => {
  const { latitude, longitude, language } = getQuery(event)
  const coordinates = parseCoordinates(latitude, longitude)
  return fetchAndParseProviderResponse(
    (): Promise<unknown> => $fetch<unknown>(
      'https://api.bigdatacloud.net/data/reverse-geocode-client',
      { query: { latitude: coordinates.latitude, longitude: coordinates.longitude, localityLanguage: language || 'en' } }
    ),
    parseReverseGeocodeResult,
    'reverse-geocoding'
  )
}, {
  maxAge: 60 * 60,
  getKey: (event) => {
    const { latitude, longitude, language } = getQuery(event)
    // round to ~1km so nearby requests share a cache entry
    return `${Number(latitude).toFixed(2)}:${Number(longitude).toFixed(2)}:${language || 'en'}`
  }
})
