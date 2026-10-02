import { describe, expect, it } from 'vitest'
import {
  isOpenMeteoWeatherResponse,
  parseGeocodingResults,
  parseIpLocationResult,
  parseOpenMeteoWeatherResponse,
  parseReverseGeocodeResult
} from '~/utils/provider-validation'

const timestamp = 1_790_000_000
const validWeather = {
  timezone: 'UTC',
  utc_offset_seconds: 0,
  current: {
    time: timestamp, temperature_2m: 20, relative_humidity_2m: 50, apparent_temperature: 19,
    is_day: 1, precipitation: 0, weather_code: 0, wind_speed_10m: 10, wind_direction_10m: 90
  },
  hourly: {
    time: [timestamp, timestamp + 3600], temperature_2m: [20, 21], apparent_temperature: [19, 20],
    precipitation_probability: [0, 10], precipitation: [0, 0.1], weather_code: [0, 1], wind_speed_10m: [10, 11]
  },
  daily: {
    time: [timestamp], weather_code: [0], temperature_2m_max: [22], temperature_2m_min: [12],
    precipitation_probability_max: [10], precipitation_sum: [0.1], sunshine_duration: [36000],
    sunrise: [timestamp - 18000], sunset: [timestamp + 18000]
  }
}

describe('external provider response validation', () => {
  it('accepts complete Open-Meteo forecasts and rejects inconsistent series', () => {
    expect(isOpenMeteoWeatherResponse(validWeather)).toBe(true)
    expect(isOpenMeteoWeatherResponse({
      ...validWeather,
      hourly: { ...validWeather.hourly, temperature_2m: [20] }
    })).toBe(false)
    expect(() => parseOpenMeteoWeatherResponse({ ...validWeather, current: null })).toThrow(/Invalid Open-Meteo/)
  })

  it('normalizes geocoding results and rejects malformed locations', () => {
    expect(parseGeocodingResults({
      results: [{ name: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.41, timezone: 'Europe/Berlin' }]
    })).toEqual([{
      name: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.41, timezone: 'Europe/Berlin'
    }])
    expect(parseGeocodingResults({})).toEqual([])
    expect(() => parseGeocodingResults({
      results: [{ name: 'Berlin', latitude: 52.52, longitude: 181, timezone: 'Europe/Berlin' }]
    })).toThrow(/Invalid Open-Meteo/)
  })

  it('accepts recognized reverse-geocoding fields and rejects unknown payloads', () => {
    expect(parseReverseGeocodeResult({ locality: 'Berlin', countryName: 'Germany' }))
      .toEqual({ name: 'Berlin', country: 'Germany' })
    expect(() => parseReverseGeocodeResult({ unexpected: 'value' })).toThrow(/Invalid reverse-geocoding/)
    expect(() => parseReverseGeocodeResult({ city: 42 })).toThrow(/Invalid reverse-geocoding/)
  })

  it('parses IP coordinates and rejects missing or out-of-range values', () => {
    expect(parseIpLocationResult({ city: 'Berlin', country: 'DE', loc: '52.52,13.41' }))
      .toEqual({ name: 'Berlin', country: 'DE', latitude: 52.52, longitude: 13.41 })
    expect(() => parseIpLocationResult({ city: 'Berlin', loc: '52.52' })).toThrow(/Invalid IP location/)
    expect(() => parseIpLocationResult({ latitude: 91, longitude: 13 })).toThrow(/Invalid IP location/)
  })
})
