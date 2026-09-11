import { describe, expect, it } from 'vitest'
import { formatDay, weatherEffect, weatherIcon, weatherLabel, windDirection } from '~/utils/weather'

describe('weatherLabel', () => {
  it('labels clear skies', () => {
    expect(weatherLabel(0)).toBe('Clear skies')
    expect(weatherLabel(0, 'de')).toBe('Klarer Himmel')
  })

  it('labels rain codes', () => {
    for (const code of [61, 63, 65, 80, 81, 82]) expect(weatherLabel(code)).toBe('Rain')
  })

  it('falls back to changeable for unknown codes', () => {
    expect(weatherLabel(-1)).toBe('Changeable')
  })
})

describe('weatherIcon', () => {
  it('differentiates day and night for clear skies', () => {
    expect(weatherIcon(0, true)).toBe('☀️')
    expect(weatherIcon(0, false)).toBe('🌙')
  })

  it('returns a storm icon for thunderstorm codes', () => {
    expect(weatherIcon(95)).toBe('⛈️')
  })
})

describe('weatherEffect', () => {
  it('prioritizes storms over other conditions', () => {
    expect(weatherEffect(95, 5)).toBe('storm')
  })

  it('treats strong wind as its own effect when skies are otherwise calm', () => {
    expect(weatherEffect(1, 30)).toBe('wind')
  })

  it('defaults to clouds for an overcast day with light wind', () => {
    expect(weatherEffect(3, 5)).toBe('clouds')
  })
})

describe('windDirection', () => {
  it('maps degrees to compass points', () => {
    expect(windDirection(0)).toBe('N')
    expect(windDirection(90)).toBe('E')
    expect(windDirection(359)).toBe('N')
  })
})

describe('formatDay', () => {
  it('always labels the first index as Today', () => {
    expect(formatDay('2026-09-09', 0)).toBe('Today')
  })
})
