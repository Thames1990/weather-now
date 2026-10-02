import type { HourlyForecast, OpenMeteoWeatherResponse, WeatherResponse } from '~/types/weather'

export function weatherLabel(code: number, locale = 'en') {
  const german = locale === 'de'
  if (code === 0) return german ? 'Klarer Himmel' : 'Clear skies'
  if ([1, 2].includes(code)) return german ? 'Heiter bis wolkig' : 'Mostly clear'
  if (code === 3) return german ? 'Bedeckt' : 'Overcast'
  if ([45, 48].includes(code)) return german ? 'Nebel' : 'Misty'
  if ([51, 53, 55, 56, 57].includes(code)) return german ? 'Nieselregen' : 'Drizzle'
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return german ? 'Regen' : 'Rain'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return german ? 'Schnee' : 'Snow'
  if ([95, 96, 99].includes(code)) return german ? 'Gewitter' : 'Storms'
  return german ? 'Unbeständig' : 'Changeable'
}

export function weatherIcon(code: number, isDay = true) {
  if (code === 0) return isDay ? '☀️' : '🌙'
  if ([1, 2].includes(code)) return isDay ? '🌤️' : '☁️'
  if (code === 3) return '☁️'
  if ([45, 48].includes(code)) return '🌫️'
  if ([51, 53, 55, 56, 57].includes(code)) return '🌦️'
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '🌧️'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '🌨️'
  if ([95, 96, 99].includes(code)) return '⛈️'
  return '🌥️'
}

export function weatherEffect(code: number, windSpeed: number) {
  if ([95, 96, 99].includes(code)) return 'storm'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow'
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain'
  if (windSpeed >= 25) return 'wind'
  if (code === 0) return 'clear'
  return 'clouds'
}

export function formatHour(value: string, locale = 'en', timezone = 'UTC') {
  const options: Intl.DateTimeFormatOptions = locale === 'de'
    ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
    : { hour: 'numeric' }
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-US', { ...options, timeZone: timezone }).format(new Date(value))
}

export function formatDay(value: string, index: number, locale = 'en') {
  if (index === 0) return 'Today'
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-US', { weekday: 'short' }).format(new Date(`${value}T12:00:00`))
}

export function formatDate(value: string, locale = 'en') {
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(value))
}

export function windDirection(degrees: number) {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(degrees / 45) % 8]
}

export function normalizeWeather(response: OpenMeteoWeatherResponse): WeatherResponse {
  const instant = (seconds: number) => new Date(seconds * 1000).toISOString()
  return {
    ...response,
    current: { ...response.current, time: instant(response.current.time) },
    hourly: { ...response.hourly, time: response.hourly.time.map(instant) },
    daily: {
      ...response.daily,
      // Open-Meteo daily dates use the response's fixed offset, including across
      // DST. Reapply it per the provider contract; IANA instant formatting here
      // could shift a daily calendar date backwards after the autumn transition.
      time: response.daily.time.map(seconds => instant(seconds + response.utc_offset_seconds).slice(0, 10)),
      sunrise: response.daily.sunrise.map(instant),
      sunset: response.daily.sunset.map(instant)
    }
  }
}

export function selectHourlyForecast(weather: WeatherResponse, limit = 12): HourlyForecast[] {
  const currentTime = Date.parse(weather.current.time)
  const times = weather.hourly.time.map(time => Date.parse(time))
  const intervalEnd = (index: number) => times[index + 1] ?? times[index]! + 3600000
  const start = times.findIndex((time, index) => (time <= currentTime && currentTime < intervalEnd(index)) || time > currentTime)
  if (start === -1) return []
  return weather.hourly.time.slice(start, start + limit).map((time, index) => {
    const sourceIndex = start + index
    return {
      time,
      isNow: times[sourceIndex]! <= currentTime && currentTime < intervalEnd(sourceIndex),
      temperature: Number(weather.hourly.temperature_2m[sourceIndex] ?? 0),
      apparentTemperature: Number(weather.hourly.apparent_temperature[sourceIndex] ?? weather.current.apparent_temperature),
      precipitation: Number(weather.hourly.precipitation_probability[sourceIndex] ?? 0),
      precipitationAmount: Number(weather.hourly.precipitation[sourceIndex] ?? 0),
      code: Number(weather.hourly.weather_code[sourceIndex] ?? 0),
      windSpeed: Number(weather.hourly.wind_speed_10m[sourceIndex] ?? weather.current.wind_speed_10m)
    }
  })
}

export function hourlyLabels(forecast: HourlyForecast[], locale: string, timezone: string, nowLabel: string): string[] {
  return forecast.map(hour => hour.isNow ? nowLabel : formatHour(hour.time, locale, timezone))
}
