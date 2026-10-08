import type { LocationResult } from '#shared/weather/types'

export type { LocationResult, OpenMeteoWeatherResponse, WeatherResponse } from '#shared/weather/types'

export type LocationLabels = Pick<LocationResult, 'name' | 'country' | 'admin1'>

export type FavoriteLocation = LocationResult & {
  labels?: Record<string, LocationLabels>
}

export type HourlyForecast = {
  time: string
  isNow: boolean
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
