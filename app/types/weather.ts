export type LocationResult = {
  name: string
  country: string
  latitude: number
  longitude: number
  timezone: string
  admin1?: string
}

export type WeatherResponse = {
  timezone: string
  current: {
    time: string
    temperature_2m: number
    relative_humidity_2m: number
    apparent_temperature: number
    is_day: number
    precipitation: number
    weather_code: number
    wind_speed_10m: number
    wind_direction_10m: number
  }
  hourly: {
    time: string[]
    temperature_2m: number[]
    apparent_temperature: number[]
    precipitation_probability: number[]
    precipitation: number[]
    weather_code: number[]
    wind_speed_10m: number[]
  }
  daily: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_probability_max: number[]
    precipitation_sum: number[]
    sunshine_duration: number[]
    sunrise: string[]
    sunset: string[]
  }
}

export type HourlyForecast = {
  time: string
  temperature: number
  apparentTemperature: number
  precipitation: number
  precipitationAmount: number
  code: number
  windSpeed: number
}

export type DailyForecast = {
  time: string
  code: number
  high: number
  low: number
  precipitation: number
  precipitationSum: number
  sunshineHours: number
}
