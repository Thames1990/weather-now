import { describe, expect, it } from 'vitest'
import { clothingRecommendation } from '~/utils/clothing'
import type { HourlyForecast, WeatherResponse } from '~/types/weather'

function current(overrides: Partial<WeatherResponse['current']> = {}): WeatherResponse['current'] {
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

function hour(overrides: Partial<HourlyForecast> = {}): HourlyForecast {
  return {
    time: '2026-09-09T13:00',
    temperature: 18,
    apparentTemperature: 18,
    precipitation: 0,
    precipitationAmount: 0,
    code: 1,
    windSpeed: 10,
    ...overrides
  }
}

describe('clothingRecommendation', () => {
  it('returns a translated loading state when there is no current data', () => {
    const result = clothingRecommendation(undefined, [], 'neutral')
    expect(result.title).toBe('wearPreparingTitle')
    expect(result.pieces).toHaveLength(3)
    expect(result.forecast).toBeNull()
  })

  it('recommends rain gear for forecast rain probability, even before rain starts', () => {
    const result = clothingRecommendation(current(), [hour({ precipitation: 65 })], 'neutral')
    expect(result.accent).toBe('wet')
    expect(result.forecast?.rain).toBe(65)
    expect(result.pieces.map(piece => piece.label)).toContain('wearWaterproofJacket')
  })

  it('does not present snow probability or accumulation as rain', () => {
    const result = clothingRecommendation(
      current({ weather_code: 71, precipitation: 1 }),
      [hour({ code: 71, precipitation: 80, precipitationAmount: 1 })],
      'neutral'
    )
    expect(result.accent).not.toBe('wet')
    expect(result.forecast?.rain).toBe(0)
    expect(result.pieces.map(piece => piece.label)).not.toContain('wearCompactUmbrella')
  })

  it('accounts for current precipitation without presenting it as a forecast probability', () => {
    const result = clothingRecommendation(current({ precipitation: 1 }), [], 'neutral')
    expect(result.accent).toBe('wet')
    expect(result.forecast?.rain).toBe(0)
  })

  it('uses forecast feels-like temperatures and wind to recommend protective layers', () => {
    const result = clothingRecommendation(current({ apparent_temperature: 16 }), [
      hour({ apparentTemperature: 7, windSpeed: 32 })
    ], 'neutral')
    expect(result.title).toBe('wearColdTitle')
    expect(result.pieces.map(piece => piece.label)).toContain('wearWindproofCoat')
    expect(result.forecast).toMatchObject({ low: 7, wind: 32 })
  })

  it('recommends light breathable clothing when the feels-like forecast is hot', () => {
    const result = clothingRecommendation(current({ apparent_temperature: 22 }), [], 'neutral')
    expect(result.accent).toBe('warm')
    expect(result.pieces).toContainEqual({ label: 'wearSunProtection', icon: '🕶️' })
  })

  it('adds a removable layer when temperatures rise through the forecast', () => {
    const result = clothingRecommendation(current(), [
      hour({ temperature: 15 }),
      hour({ temperature: 17 }),
      hour({ temperature: 21 })
    ], 'neutral')
    expect(result.pieces.map(piece => piece.label)).toContain('wearRemovableLayer')
  })

  it('adds an extra layer when temperatures fall through the forecast', () => {
    const result = clothingRecommendation(current(), [
      hour({ temperature: 20 }),
      hour({ temperature: 17 }),
      hour({ temperature: 14 })
    ], 'neutral')
    expect(result.pieces.map(piece => piece.label)).toContain('wearExtraLayerLater')
  })

  it('uses the selected style to tailor concrete garment suggestions', () => {
    const feminine = clothingRecommendation(current({ apparent_temperature: 24 }), [], 'feminine')
    const masculine = clothingRecommendation(current({ apparent_temperature: 24 }), [], 'masculine')
    expect(feminine.pieces.map(piece => piece.label)).toContain('wearFeminineBreathableTop')
    expect(masculine.pieces.map(piece => piece.label)).toContain('wearMasculineBreathableTop')
  })
})
