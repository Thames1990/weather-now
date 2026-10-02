import type { HourlyForecast, WeatherResponse } from '~/types/weather'

export type ClothingGender = 'neutral' | 'feminine' | 'masculine'

export type ClothingPiece = {
  label: string
  icon: string
}

export type ClothingRecommendation = {
  title: string
  description: string
  pieces: ClothingPiece[]
  accent: 'cool' | 'warm' | 'wet' | 'wind'
  forecast: {
    low: number
    high: number
    wind: number
    rain: number
  } | null
}

const wetWeatherCodes = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]

export function clothingRecommendation(
  current: WeatherResponse['current'] | undefined,
  hourly: HourlyForecast[],
  gender: ClothingGender,
): ClothingRecommendation {
  if (!current) {
    return {
      title: 'wearPreparingTitle',
      description: 'wearPreparingDescription',
      pieces: [
        { label: 'wearPreparingTemperature', icon: '🌡️' },
        { label: 'wearPreparingRain', icon: '🌧️' },
        { label: 'wearPreparingWind', icon: '🌬️' }
      ],
      accent: 'cool',
      forecast: null
    }
  }

  const nextHours = hourly.slice(0, 8)
  const feelsLike = [current.apparent_temperature, ...nextHours.map(hour => hour.apparentTemperature)]
  const lowFeelsLike = Math.min(...feelsLike)
  const highFeelsLike = Math.max(...feelsLike)
  const wind = Math.round(Math.max(current.wind_speed_10m, ...nextHours.map(hour => hour.windSpeed)))
  const rain = Math.max(0, ...nextHours.map(hour => hour.precipitation))
  const isWet = wetWeatherCodes.includes(current.weather_code)
    || current.precipitation > 0
    || nextHours.some(hour => wetWeatherCodes.includes(hour.code) || hour.precipitationAmount > 0)
    || rain >= 40
  const isCold = lowFeelsLike < 10
  const isWarm = lowFeelsLike >= 21
  const isWindy = wind >= 25
  const temperatureChange = nextHours.length > 1
    ? nextHours[nextHours.length - 1]!.temperature - nextHours[0]!.temperature
    : 0
  const genderStyle = gender === 'feminine' ? 'Feminine' : gender === 'masculine' ? 'Masculine' : 'Neutral'
  const trendPiece = Math.abs(temperatureChange) >= 5
    ? {
        label: temperatureChange > 0 ? 'wearRemovableLayer' : 'wearExtraLayerLater',
        icon: temperatureChange > 0 ? '🧥' : '🧶'
      }
    : null
  const forecast = {
    low: Math.round(lowFeelsLike),
    high: Math.round(highFeelsLike),
    wind,
    rain: Math.round(rain)
  }

  if (isWet) {
    return {
      title: 'wearRainTitle',
      description: isCold ? 'wearColdRainDescription' : 'wearRainDescription',
      pieces: [
        { label: isCold ? 'wearInsulatedRaincoat' : 'wearWaterproofJacket', icon: '🧥' },
        { label: 'wearWaterResistantShoes', icon: '👟' },
        { label: 'wearCompactUmbrella', icon: '☂️' },
        ...(trendPiece ? [trendPiece] : [])
      ],
      accent: 'wet',
      forecast
    }
  }

  if (isCold) {
    return {
      title: 'wearColdTitle',
      description: 'wearColdDescription',
      pieces: [
        { label: 'wearThermalBaseLayer', icon: '🧶' },
        { label: isWindy ? 'wearWindproofCoat' : 'wearInsulatedCoat', icon: '🧥' },
        { label: gender === 'feminine' ? 'wearWarmSkirtAndTights' : 'wearWarmTrousers', icon: gender === 'feminine' ? '👗' : '👖' },
        ...(trendPiece ? [trendPiece] : [])
      ],
      accent: isWindy ? 'wind' : 'cool',
      forecast
    }
  }

  if (isWarm) {
    return {
      title: 'wearWarmTitle',
      description: 'wearWarmDescription',
      pieces: [
        { label: `wear${genderStyle}BreathableTop`, icon: '👕' },
        { label: gender === 'feminine' ? 'wearSkirtOrLinenTrousers' : 'wearLightweightTrousersOrShorts', icon: gender === 'feminine' ? '👗' : '🩳' },
        { label: 'wearSunProtection', icon: '🕶️' },
        ...(trendPiece ? [trendPiece] : [])
      ],
      accent: 'warm',
      forecast
    }
  }

  const top = `wear${genderStyle}MildTop`
  return {
    title: 'wearMildTitle',
    description: isWindy ? 'wearWindyDescription' : 'wearMildDescription',
    pieces: [
      { label: top, icon: '👕' },
      { label: gender === 'feminine' ? 'wearSkirtOrTrousers' : 'wearEverydayTrousers', icon: '👖' },
      { label: isWindy ? 'wearLightWindbreaker' : 'wearLightJacket', icon: isWindy ? '🌬️' : '🧥' },
      ...(trendPiece ? [trendPiece] : [])
    ],
    accent: isWindy ? 'wind' : 'cool',
    forecast
  }
}
