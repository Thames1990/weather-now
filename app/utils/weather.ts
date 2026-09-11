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

export function formatHour(value: string, locale = 'en') {
  const options = locale === 'de' ? { hour: '2-digit' as const, minute: '2-digit' as const } : { hour: 'numeric' as const }
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-US', options).format(new Date(value))
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
