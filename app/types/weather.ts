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
    precipitation_probability: number[]
    precipitation: number[]
    weather_code: number[]
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
  isNow: boolean
  temperature: number
  precipitation: number
  precipitationAmount: number
  code: number
}

// Open-Meteo's timeformat=unixtime uses seconds since the UTC epoch.
export type OpenMeteoWeatherResponse = Omit<WeatherResponse, 'current' | 'hourly' | 'daily'> & {
  utc_offset_seconds: number
  current: Omit<WeatherResponse['current'], 'time'> & { time: number }
  hourly: Omit<WeatherResponse['hourly'], 'time'> & { time: number[] }
  daily: Omit<WeatherResponse['daily'], 'time' | 'sunrise' | 'sunset'> & {
    time: number[]
    sunrise: number[]
    sunset: number[]
  }
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
