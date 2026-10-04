import type { FavoriteLocation, LocationLabels, LocationResult } from '~/types/weather'

export function sameLocation(a: LocationResult, b: LocationResult): boolean {
  if (a.id !== undefined && b.id !== undefined) return a.id === b.id
  // Coordinates are only a safe fallback when they identify the same provider point.
  // A tolerance can silently merge neighboring towns (or unrelated same-name places).
  return a.latitude === b.latitude && a.longitude === b.longitude
}

function normalizedPlaceName(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase('en')
}

function normalizedCountry(value: string): string {
  const countryName = value.length === 2
    ? new Intl.DisplayNames(['en'], { type: 'region' }).of(value.toUpperCase())
    : undefined
  return normalizedPlaceName(countryName || value)
}

export function resolveCityIdentity(
  location: LocationResult,
  candidates: LocationResult[],
  admin1?: string
): LocationResult {
  if (!location.name || !location.country) return location
  const matches = candidates.filter(candidate =>
    normalizedPlaceName(candidate.name) === normalizedPlaceName(location.name)
    && normalizedCountry(candidate.country) === normalizedCountry(location.country)
    && (!admin1 || (candidate.admin1 !== undefined && normalizedPlaceName(candidate.admin1) === normalizedPlaceName(admin1)))
  )
  const match = matches.length === 1 ? matches[0] : undefined
  return match?.id === undefined ? location : { ...location, id: match.id, admin1: match.admin1 ?? admin1 }
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
