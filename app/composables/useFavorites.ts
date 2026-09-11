import type { LocationResult } from '~/types/weather'

function sameLocation(a: LocationResult, b: LocationResult) {
  return Math.abs(a.latitude - b.latitude) < 0.01 && Math.abs(a.longitude - b.longitude) < 0.01
}

export function useFavorites() {
  const favorites = usePersistentState<LocationResult[]>('weather-now:favorites', [])

  function isFavorite(location: LocationResult) {
    return favorites.value.some((favorite) => sameLocation(favorite, location))
  }

  function toggleFavorite(location: LocationResult) {
    favorites.value = isFavorite(location)
      ? favorites.value.filter((favorite) => !sameLocation(favorite, location))
      : [...favorites.value, location]
  }

  function removeFavorite(location: LocationResult) {
    favorites.value = favorites.value.filter((favorite) => !sameLocation(favorite, location))
  }

  return { favorites, isFavorite, toggleFavorite, removeFavorite }
}
