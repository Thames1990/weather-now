import type { OpenMeteoWeatherResponse } from '#shared/weather/types'
import { parseOpenMeteoWeatherResponse } from '#shared/weather/provider-validation'
import { normalizeWeather } from '#shared/weather/normalize'
import { createWeatherQuery } from '#shared/weather/query'
import { fetchAndParseProviderResponse, parseCoordinates } from '../utils/provider'

export default defineCachedEventHandler(async (event) => {
  const { latitude, longitude } = getQuery(event)
  const coordinates = parseCoordinates(latitude, longitude)

  const response: OpenMeteoWeatherResponse = await fetchAndParseProviderResponse(
    (): Promise<unknown> => $fetch<unknown>('https://api.open-meteo.com/v1/forecast', {
      query: createWeatherQuery(coordinates.latitude, coordinates.longitude)
    }),
    parseOpenMeteoWeatherResponse,
    'weather'
  )
  return normalizeWeather(response)
}, {
  maxAge: 60 * 5,
  getKey: (event) => {
    const { latitude, longitude } = getQuery(event)
    return `unix-iso-v1:${JSON.stringify(createWeatherQuery(String(latitude), String(longitude)))}`
  }
})
