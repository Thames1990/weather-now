import type { OpenMeteoWeatherResponse, WeatherResponse } from './types'

export function normalizeWeather(response: OpenMeteoWeatherResponse): WeatherResponse {
  const instant = (seconds: number) => new Date(seconds * 1000).toISOString()
  return {
    ...response,
    current: { ...response.current, time: instant(response.current.time) },
    hourly: { ...response.hourly, time: response.hourly.time.map(instant) },
    daily: {
      ...response.daily,
      // Open-Meteo daily dates use the response's fixed offset, including across
      // DST. Reapply it per the provider contract; IANA instant formatting here
      // could shift a daily calendar date backwards after the autumn transition.
      time: response.daily.time.map(seconds => instant(seconds + response.utc_offset_seconds).slice(0, 10)),
      sunrise: response.daily.sunrise.map(instant),
      sunset: response.daily.sunset.map(instant)
    }
  }
}
