export function createWeatherQuery(latitude: number | string, longitude: number | string) {
  return {
    latitude,
    longitude,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m',
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunshine_duration,sunrise,sunset',
    timezone: 'auto',
    timeformat: 'unixtime',
    forecast_days: 7
  }
}
