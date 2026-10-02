import type { FavoriteLocation, LocationLabels, LocationResult } from '~/types/weather'

export function sameLocation(a: LocationResult, b: LocationResult): boolean {
  if (a.id !== undefined && b.id !== undefined) return a.id === b.id
  return Math.abs(a.latitude - b.latitude) < 0.01 && Math.abs(a.longitude - b.longitude) < 0.01
}

export function localizeFavorite(location: FavoriteLocation, language: string): FavoriteLocation {
  const labels = favoriteLabels(location, language)
  return labels ? { ...location, ...labels, admin1: labels.admin1 } : location
}

export function favoriteLabels(location: FavoriteLocation, language: string): LocationLabels | undefined {
  const labels = location.labels?.[language]
  if (!labels || typeof labels.name !== 'string' || !labels.name.trim()
    || typeof labels.country !== 'string'
    || (labels.admin1 !== undefined && typeof labels.admin1 !== 'string')) return undefined
  return { name: labels.name, country: labels.country, admin1: labels.admin1 }
}
