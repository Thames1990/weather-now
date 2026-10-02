import type { OpenMeteoWeatherResponse } from '~/types/weather'
import { normalizeWeather } from '~/utils/weather'

const currentParams = 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m'
const hourlyParams = 'temperature_2m,precipitation_probability,precipitation,weather_code'
const dailyParams = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunshine_duration,sunrise,sunset'

export default defineCachedEventHandler(async (event) => {
  const { latitude, longitude } = getQuery(event)
  const parsedLatitude = Number(latitude)
  const parsedLongitude = Number(longitude)
  if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) {
    throw createError({ statusCode: 400, statusMessage: 'latitude and longitude are required numeric query params' })
  }

  try {
    const response = await $fetch<OpenMeteoWeatherResponse>('https://api.open-meteo.com/v1/forecast', {
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
    return normalizeWeather(response)
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Upstream weather provider unavailable' })
  }
}, {
  maxAge: 60 * 5,
  getKey: (event) => {
    const { latitude, longitude } = getQuery(event)
    // include the requested field lists so a stale cache entry can never outlive a code change to the params above
    return `unix-iso-v1:${latitude}:${longitude}:${hourlyParams}:${dailyParams}`
  }
})
