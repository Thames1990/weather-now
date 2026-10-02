import type { OpenMeteoWeatherResponse } from '~/types/weather'
import { isValidCoordinates, parseOpenMeteoWeatherResponse } from '~/utils/provider-validation'
import { normalizeWeather } from '~/utils/weather'

const currentParams = 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m'
const hourlyParams = 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m'
const dailyParams = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunshine_duration,sunrise,sunset'

export default defineCachedEventHandler(async (event) => {
  const { latitude, longitude } = getQuery(event)
  const parsedLatitude = Number(latitude)
  const parsedLongitude = Number(longitude)
  if (!isValidCoordinates(parsedLatitude, parsedLongitude)) {
    throw createError({ statusCode: 400, statusMessage: 'latitude and longitude must be valid coordinates' })
  }

  let payload: unknown
  try {
    payload = await $fetch<unknown>('https://api.open-meteo.com/v1/forecast', {
      query: {
        latitude: parsedLatitude,
        longitude: parsedLongitude,
        current: currentParams,
        hourly: hourlyParams,
        daily: dailyParams,
        timezone: 'auto',
        timeformat: 'unixtime',
        forecast_days: 7
      }
    })
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Upstream weather provider unavailable' })
  }

  let response: OpenMeteoWeatherResponse
  try {
    response = parseOpenMeteoWeatherResponse(payload)
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Invalid weather provider response' })
  }
  return normalizeWeather(response)
}, {
  maxAge: 60 * 5,
  getKey: (event) => {
    const { latitude, longitude } = getQuery(event)
    // include the requested field lists so a stale cache entry can never outlive a code change to the params above
    return `unix-iso-v1:${latitude}:${longitude}:${hourlyParams}:${dailyParams}`
  }
})
