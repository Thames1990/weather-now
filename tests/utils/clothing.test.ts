import { describe, expect, it } from 'vitest'
import { clothingRecommendation } from '~/utils/clothing'
import type { WeatherResponse } from '~/types/weather'

function current(overrides: Partial<WeatherResponse['current']>): WeatherResponse['current'] {
  return {
    time: '2026-09-09T12:00',
    temperature_2m: 18,
    relative_humidity_2m: 50,
    apparent_temperature: 18,
    is_day: 1,
    precipitation: 0,
    weather_code: 1,
    wind_speed_10m: 10,
    wind_direction_10m: 180,
    ...overrides
  }
}

describe('clothingRecommendation', () => {
  it('returns a loading state when there is no current data', () => {
    const result = clothingRecommendation(undefined, 'neutral')
    expect(result.accent).toBe('cool')
    expect(result.pieces).toHaveLength(3)
  })

  it('recommends rain gear when precipitation is present', () => {
    const result = clothingRecommendation(current({ precipitation: 2, weather_code: 61 }), 'neutral')
    expect(result.accent).toBe('wet')
  })

  it('recommends warm layers below 10 degrees apparent temperature', () => {
    const result = clothingRecommendation(current({ apparent_temperature: 5 }), 'neutral')
    expect(result.accent).toBe('cool')
    expect(result.title).toMatch(/cold/i)
  })

  it('recommends light clothing at or above 21 degrees apparent temperature', () => {
    const result = clothingRecommendation(current({ apparent_temperature: 24 }), 'neutral')
    expect(result.accent).toBe('warm')
  })

  it('flags windy conditions in the mild range', () => {
    const result = clothingRecommendation(current({ apparent_temperature: 15, wind_speed_10m: 30 }), 'neutral')
    expect(result.accent).toBe('wind')
  })

  it('adapts copy for the requested gender in German', () => {
    const result = clothingRecommendation(current({ apparent_temperature: 15 }), 'feminine', 'de')
    expect(result.description).toContain('Bluse')
  })
})
