import type { LocationResult, OpenMeteoWeatherResponse } from '~/types/weather'

type ProviderObject = Record<string, unknown>

function isObject(value: unknown): value is ProviderObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isValidUnixSeconds(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isFinite(new Date(value * 1000).getTime())
}

export function isValidCoordinates(latitude: unknown, longitude: unknown): latitude is number {
  return isFiniteNumber(latitude)
    && isFiniteNumber(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180
}

function isNumericArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isFiniteNumber)
}

function hasNumericSeries(record: ProviderObject, timeKey: string, valueKeys: string[]): boolean {
  const times = record[timeKey]
  return isNumericArray(times)
    && times.length > 0
    && times.every(isValidUnixSeconds)
    && times.every((time, index) => index === 0 || time > times[index - 1]!)
    && valueKeys.every((key) => {
      const values = record[key]
      return isNumericArray(values) && values.length === times.length
    })
}

function hasNumericFields(record: ProviderObject, keys: string[]): boolean {
  return keys.every(key => isFiniteNumber(record[key]))
}

function isWeatherCode(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0
}

export function isOpenMeteoWeatherResponse(value: unknown): value is OpenMeteoWeatherResponse {
  if (!isObject(value) || !isNonEmptyString(value.timezone) || !isFiniteNumber(value.utc_offset_seconds)) return false
  if (!Number.isInteger(value.utc_offset_seconds)) return false

  const current = value.current
  const hourly = value.hourly
  const daily = value.daily
  if (!isObject(current) || !isObject(hourly) || !isObject(daily)) return false

  if (!isValidUnixSeconds(current.time)
    || !hasNumericFields(current, [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'precipitation',
      'wind_speed_10m',
      'wind_direction_10m'
    ])
    || !isWeatherCode(current.weather_code)
    || (current.is_day !== 0 && current.is_day !== 1)
    || current.relative_humidity_2m < 0
    || current.relative_humidity_2m > 100
    || current.precipitation < 0
    || current.wind_speed_10m < 0
    || current.wind_direction_10m < 0
    || current.wind_direction_10m > 360) return false

  if (!hasNumericSeries(hourly, 'time', [
    'temperature_2m',
    'apparent_temperature',
    'precipitation_probability',
    'precipitation',
    'weather_code',
    'wind_speed_10m'
  ])) return false
  const hourlyWeatherCodes = hourly.weather_code as number[]
  const hourlyPrecipitationProbability = hourly.precipitation_probability as number[]
  const hourlyPrecipitation = hourly.precipitation as number[]
  const hourlyWindSpeed = hourly.wind_speed_10m as number[]
  if (!hourlyWeatherCodes.every(isWeatherCode)
    || !hourlyPrecipitationProbability.every(value => value >= 0 && value <= 100)
    || !hourlyPrecipitation.every(value => value >= 0)
    || !hourlyWindSpeed.every(value => value >= 0)) return false

  if (!hasNumericSeries(daily, 'time', [
    'weather_code',
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_probability_max',
    'precipitation_sum',
    'sunshine_duration',
    'sunrise',
    'sunset'
  ])) return false
  const dailyWeatherCodes = daily.weather_code as number[]
  const dailyHighs = daily.temperature_2m_max as number[]
  const dailyLows = daily.temperature_2m_min as number[]
  const dailyPrecipitationProbability = daily.precipitation_probability_max as number[]
  const dailyPrecipitation = daily.precipitation_sum as number[]
  const dailySunshine = daily.sunshine_duration as number[]
  const dailySunrise = daily.sunrise as number[]
  const dailySunset = daily.sunset as number[]
  return dailyWeatherCodes.every(isWeatherCode)
    && dailySunrise.every(isValidUnixSeconds)
    && dailySunset.every(isValidUnixSeconds)
    && dailyHighs.every((value, index) => value >= dailyLows[index]!)
    && dailyPrecipitationProbability.every(value => value >= 0 && value <= 100)
    && dailyPrecipitation.every(value => value >= 0)
    && dailySunshine.every(value => value >= 0)
}

export function parseOpenMeteoWeatherResponse(value: unknown): OpenMeteoWeatherResponse {
  if (!isOpenMeteoWeatherResponse(value)) throw new Error('Invalid Open-Meteo weather response')
  return value
}

export function parseGeocodingResults(value: unknown): LocationResult[] {
  if (!isObject(value)) throw new Error('Invalid Open-Meteo geocoding response')
  const results = value.results
  if (results === undefined || results === null) return []
  if (!Array.isArray(results)) throw new Error('Invalid Open-Meteo geocoding response')

  return results.map((result): LocationResult => {
    if (!isObject(result)
      || (result.id !== undefined && (!Number.isSafeInteger(result.id) || Number(result.id) <= 0))
      || !isNonEmptyString(result.name)
      || !isFiniteNumber(result.latitude)
      || !isFiniteNumber(result.longitude)
      || !isValidCoordinates(result.latitude, result.longitude)
      || !isNonEmptyString(result.timezone)
      || (result.country !== undefined && typeof result.country !== 'string')
      || (result.admin1 !== undefined && result.admin1 !== null && typeof result.admin1 !== 'string')) {
      throw new Error('Invalid Open-Meteo geocoding result')
    }
    const location: LocationResult = {
      name: result.name,
      country: typeof result.country === 'string' ? result.country : '',
      latitude: result.latitude,
      longitude: result.longitude,
      timezone: result.timezone
    }
    if (typeof result.id === 'number') location.id = result.id
    if (typeof result.admin1 === 'string') location.admin1 = result.admin1
    return location
  })
}

export type ReverseGeocodeResult = {
  name: string
  country: string
}

export function parseReverseGeocodeResult(value: unknown): ReverseGeocodeResult {
  if (!isObject(value)) throw new Error('Invalid reverse-geocoding response')
  const recognizedKeys = ['name', 'city', 'locality', 'principalSubdivision', 'country', 'countryName']
  if (!recognizedKeys.some(key => Object.hasOwn(value, key))) throw new Error('Invalid reverse-geocoding response')
  if (recognizedKeys.some(key => value[key] !== undefined && value[key] !== null && typeof value[key] !== 'string')) {
    throw new Error('Invalid reverse-geocoding response')
  }
  const firstString = (...values: unknown[]) => values.find((entry): entry is string => typeof entry === 'string' && entry.length > 0) || ''
  return {
    name: firstString(value.name, value.city, value.locality, value.principalSubdivision),
    country: firstString(value.country, value.countryName)
  }
}

export type IpLocationResult = {
  name: string
  country: string
  latitude: number
  longitude: number
}

export function parseIpLocationResult(value: unknown): IpLocationResult {
  if (!isObject(value)) throw new Error('Invalid IP location response')
  const name = value.name ?? value.city
  const country = value.country
  if ((name !== undefined && name !== null && typeof name !== 'string')
    || (country !== undefined && country !== null && typeof country !== 'string')) {
    throw new Error('Invalid IP location response')
  }

  let latitude: number
  let longitude: number
  if (Object.hasOwn(value, 'loc')) {
    if (typeof value.loc !== 'string') throw new Error('Invalid IP location response')
    const coordinates = value.loc.split(',').map(part => part.trim())
    if (coordinates.length !== 2 || coordinates.some(part => part.length === 0)) {
      throw new Error('Invalid IP location response')
    }
    latitude = Number(coordinates[0])
    longitude = Number(coordinates[1])
  } else {
    if (!isFiniteNumber(value.latitude) || !isFiniteNumber(value.longitude)) {
      throw new Error('Invalid IP location response')
    }
    latitude = value.latitude
    longitude = value.longitude
  }
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude) || !isValidCoordinates(latitude, longitude)) {
    throw new Error('Invalid IP location response')
  }
  return {
    name: typeof name === 'string' ? name : '',
    country: typeof country === 'string' ? country : '',
    latitude,
    longitude
  }
}
