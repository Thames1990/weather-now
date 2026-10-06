import type { FavoriteLocation, LocationLabels, LocationResult } from '~/types/weather'
import { favoriteLabels, localizeFavorite, moveItem, sameLocation } from '~/utils/locations'
import { parseGeocodingResults, parseReverseGeocodeResult } from '~/utils/provider-validation'

export function useFavorites() {
  const storedFavorites = usePersistentState<FavoriteLocation[]>('weather-now:favorites', [])
  const { locale, locales } = useI18n()
  const config = useRuntimeConfig()
  const errorMessage = ref('')
  const pending = ref(0)
  const requests = new Map<FavoriteLocation, symbol>()
  const favorites = computed(() => storedFavorites.value.map(favorite => localizeFavorite(favorite, locale.value)))
  const isLocalizing = computed(() => pending.value > 0)
  const languages = computed(() => locales.value.map(language => typeof language === 'string' ? language : language.code))

  function hasAllLabels(location: FavoriteLocation) {
    return languages.value.every(language => Boolean(favoriteLabels(location, language)))
  }

  async function geocode(query: { id: number; language: string } | { name: string; count: number; language: string }) {
    // The Worker has no ID or localized lookup, so worker builds keep the direct provider path for labels.
    if (config.public.apiMode === 'server') {
      return parseGeocodingResults(await $fetch<unknown>('/api/geocode', { query }))
    }
    const byId = 'id' in query
    const payload = await $fetch<unknown>(`https://geocoding-api.open-meteo.com/v1/${byId ? 'get' : 'search'}`, {
      query: { ...query, format: 'json' }
    })
    return parseGeocodingResults(byId ? { results: [payload] } : payload)
  }

  async function loadLabels(location: FavoriteLocation): Promise<FavoriteLocation> {
    let id = location.id
    if (id === undefined) {
      // Old favorites have no provider ID. Never pick a namesake in another city.
      const matches = await geocode({ name: location.name, count: 100, language: locale.value })
      id = matches.find(match => sameLocation(match, location))?.id
    }
    const entries = await Promise.all(languages.value.map(async (language): Promise<[string, LocationLabels]> => {
      const existing = favoriteLabels(location, language)
      if (existing) return [language, existing]
      if (id !== undefined) {
        const match = (await geocode({ id, language })).find(candidate => candidate.id === id)
        if (!match) throw new Error('Favorite city could not be identified')
        return [language, { name: match.name, country: match.country, admin1: match.admin1 }]
      }
      const query = { latitude: location.latitude, longitude: location.longitude }
      const payload = config.public.apiMode === 'server'
        ? await $fetch<unknown>('/api/reverse-geocode', { query: { ...query, language } })
        : await $fetch<unknown>('https://api.bigdatacloud.net/data/reverse-geocode-client', {
            query: { ...query, localityLanguage: language }
          })
      const labels = parseReverseGeocodeResult(payload)
      if (!labels.name) throw new Error('Favorite city name is unavailable')
      return [language, labels]
    }))
    return { ...location, id, labels: Object.fromEntries(entries) }
  }

  async function localize(location: FavoriteLocation) {
    if (hasAllLabels(location) || requests.has(location)) return
    const token = Symbol()
    requests.set(location, token)
    pending.value++
    try {
      const localized = await loadLabels(location)
      if (requests.get(location) !== token) return
      storedFavorites.value = storedFavorites.value.map(favorite => favorite === location ? localized : favorite)
    } catch {
      if (requests.get(location) === token) errorMessage.value = 'errorFavoriteLocalization'
    } finally {
      if (requests.get(location) === token) requests.delete(location)
      pending.value--
    }
  }

  function retryLocalization() {
    errorMessage.value = ''
    return Promise.all(storedFavorites.value.map(localize))
  }

  function isFavorite(location: LocationResult) {
    return storedFavorites.value.some(favorite => sameLocation(favorite, location))
  }

  function displayLocation(location: LocationResult): LocationResult {
    const favorite = storedFavorites.value.find(candidate => sameLocation(candidate, location))
    return favorite ? localizeFavorite(favorite, locale.value) : location
  }

  function toggleFavorite(location: LocationResult) {
    if (isFavorite(location)) {
      removeFavorite(location)
      return
    }
    addFavorite(location)
  }

  function addFavorite(location: LocationResult) {
    if (isFavorite(location)) return
    storedFavorites.value = [{ ...location }, ...storedFavorites.value]
    const added = storedFavorites.value[0]!
    void localize(added)
  }

  function removeFavorite(location: LocationResult) {
    const index = storedFavorites.value.findIndex(favorite => sameLocation(favorite, location))
    if (index < 0) return undefined
    const [removed] = storedFavorites.value.splice(index, 1)
    if (removed) requests.delete(removed)
    if (!storedFavorites.value.length) errorMessage.value = ''
    return removed ? { favorite: removed, index } : undefined
  }

  function restoreFavorite(favorite: FavoriteLocation, index: number) {
    if (isFavorite(favorite)) return
    const restored = [...storedFavorites.value]
    restored.splice(Math.max(0, Math.min(index, restored.length)), 0, favorite)
    storedFavorites.value = restored
    void localize(favorite)
  }

  function reorderFavorite(location: LocationResult, toIndex: number) {
    const index = storedFavorites.value.findIndex(favorite => sameLocation(favorite, location))
    if (index < 0 || toIndex < 0 || toIndex >= storedFavorites.value.length) return
    storedFavorites.value = moveItem(storedFavorites.value, index, toIndex)
  }

  function saveFavorites(locations: LocationResult[]) {
    const saved = locations
      .map(location => storedFavorites.value.find(favorite => sameLocation(favorite, location)))
      .filter((favorite): favorite is FavoriteLocation => favorite !== undefined)
    for (const favorite of storedFavorites.value) {
      if (!saved.includes(favorite)) requests.delete(favorite)
    }
    storedFavorites.value = saved
    if (!saved.length) errorMessage.value = ''
  }

  onMounted(() => { void retryLocalization() })
  onBeforeUnmount(() => requests.clear())

  return {
    favorites,
    isFavorite,
    toggleFavorite,
    addFavorite,
    removeFavorite,
    restoreFavorite,
    reorderFavorite,
    saveFavorites,
    displayLocation,
    isLocalizing,
    errorMessage,
    retryLocalization
  }
}
