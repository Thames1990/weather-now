import type { OpenMeteoWeatherResponse } from '#shared/weather/types'
import { parseOpenMeteoWeatherResponse } from '#shared/weather/provider-validation'
import { normalizeWeather } from '#shared/weather/normalize'
import { fetchAndParseProviderResponse, parseCoordinates } from '../utils/provider'

const currentParams = 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m'
const hourlyParams = 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m'
const dailyParams = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunshine_duration,sunrise,sunset'

export default defineCachedEventHandler(async (event) => {
  const { latitude, longitude } = getQuery(event)
  const coordinates = parseCoordinates(latitude, longitude)

  const response: OpenMeteoWeatherResponse = await fetchAndParseProviderResponse(
    (): Promise<unknown> => $fetch<unknown>('https://api.open-meteo.com/v1/forecast', {
      query: {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        current: currentParams,
        hourly: hourlyParams,
        daily: dailyParams,
        timezone: 'auto',
        timeformat: 'unixtime',
        forecast_days: 7
      }
    }),
    parseOpenMeteoWeatherResponse,
    'weather'
  )
  return normalizeWeather(response)
}, {
  maxAge: 60 * 5,
  getKey: (event) => {
    const { latitude, longitude } = getQuery(event)
    // include the requested field lists so a stale cache entry can never outlive a code change to the params above
    return `unix-iso-v1:${latitude}:${longitude}:${hourlyParams}:${dailyParams}`
  }
})
