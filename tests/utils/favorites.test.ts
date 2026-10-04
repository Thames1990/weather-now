import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import type { FavoriteLocation, LocationResult } from '~/types/weather'
import { favoriteLabels, localizeFavorite, resolveCityIdentity, sameLocation } from '~/utils/locations'

const cologne: LocationResult = {
  id: 2886242, name: 'Cologne', country: 'Germany', admin1: 'North Rhine-Westphalia',
  latitude: 50.93333, longitude: 6.95, timezone: 'Europe/Berlin'
}
const koeln: LocationResult = { ...cologne, name: 'Köln', country: 'Deutschland', admin1: 'Nordrhein-Westfalen' }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function setup(mode = 'server', saved: FavoriteLocation[] = [], fetch = vi.fn()) {
  const storage = ref(saved)
  const locale = ref('en')
  const mounted: (() => void)[] = []
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('usePersistentState', () => storage)
  vi.stubGlobal('useI18n', () => ({ locale, locales: ref([{ code: 'en' }, { code: 'de' }]) }))
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { apiMode: mode } }))
  vi.stubGlobal('onMounted', (callback: () => void) => mounted.push(callback))
  vi.stubGlobal('onBeforeUnmount', vi.fn())
  vi.stubGlobal('$fetch', fetch)
  const { useFavorites } = await import('~/composables/useFavorites')
  const state = useFavorites()
  return { state, storage, locale, mounted, fetch }
}

function localizedFetch(mode: string) {
  return vi.fn(async (_url: string, options: { query: { language: string } }) => {
    const location = options.query.language === 'de' ? koeln : cologne
    return mode === 'external' ? location : { results: [location] }
  })
}

describe('multilingual favorites', () => {
  it.each(['server', 'external'])('saves all selectable labels and switches without fetching in %s mode', async (mode) => {
    const { state, storage, locale, fetch } = await setup(mode, [], localizedFetch(mode))
    state.toggleFavorite(cologne)
    await vi.waitFor(() => expect(state.isLocalizing.value).toBe(false))

    expect(storage.value[0]).toMatchObject({
      id: cologne.id,
      labels: {
        en: { name: 'Cologne', country: 'Germany', admin1: 'North Rhine-Westphalia' },
        de: { name: 'Köln', country: 'Deutschland', admin1: 'Nordrhein-Westfalen' }
      }
    })
    expect(state.favorites.value[0]?.name).toBe('Cologne')
    locale.value = 'de'
    expect(state.favorites.value[0]?.name).toBe('Köln')
    expect(state.displayLocation(cologne).name).toBe('Köln')
    expect(state.isFavorite(koeln)).toBe(true)
    locale.value = 'en'
    expect(state.favorites.value[0]?.name).toBe('Cologne')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledWith(mode === 'external' ? 'https://geocoding-api.open-meteo.com/v1/get' : '/api/geocode',
      expect.objectContaining({ query: expect.objectContaining({ id: 2886242, language: 'de' }) }))
  })

  it('also saves English names when added in German', async () => {
    const { state, storage, locale } = await setup('server', [], localizedFetch('server'))
    locale.value = 'de'
    state.toggleFavorite(koeln)
    await vi.waitFor(() => expect(state.isLocalizing.value).toBe(false))
    expect(storage.value[0]?.labels?.en?.name).toBe('Cologne')
    locale.value = 'en'
    expect(state.favorites.value[0]?.name).toBe('Cologne')
  })

  it('localizes a current-location favorite whose precise coordinates differ from the city geocoding point', async () => {
    const currentLocation: LocationResult = {
      ...cologne,
      latitude: 50.94,
      longitude: 6.96
    }
    const { state, storage } = await setup('server', [], localizedFetch('server'))

    state.toggleFavorite(currentLocation)
    await vi.waitFor(() => expect(state.isLocalizing.value).toBe(false))

    expect(state.errorMessage.value).toBe('')
    expect(storage.value[0]).toMatchObject({
      id: cologne.id,
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      labels: {
        en: { name: 'Cologne' },
        de: { name: 'Köln' }
      }
    })
  })

  it('migrates legacy favorites by coordinates, not the first search result', async () => {
    const legacy = { ...cologne, id: undefined }
    const fetch = vi.fn(async (_url: string, options: { query: { id?: number; language: string } }) => {
      if (options.query.id === undefined) return { results: [{ ...cologne, id: 3178287, latitude: 45.57862, longitude: 9.9418 }, cologne] }
      return { results: [options.query.language === 'de' ? koeln : cologne] }
    })
    const { state, storage, locale, mounted } = await setup('server', [legacy], fetch)
    mounted.forEach(callback => callback())
    await vi.waitFor(() => expect(state.isLocalizing.value).toBe(false))
    expect(storage.value).toHaveLength(1)
    expect(storage.value[0]?.id).toBe(cologne.id)
    expect(storage.value[0]?.labels?.de?.name).toBe('Köln')
    locale.value = 'de'
    expect(state.favorites.value[0]?.country).toBe('Deutschland')
  })

  it('keeps fully translated favorites offline after reload', async () => {
    const saved = { ...cologne, labels: { en: cologne, de: koeln } }
    const { state, locale, fetch } = await setup('server', [saved], vi.fn().mockRejectedValue(new Error('offline')))
    await state.retryLocalization()
    locale.value = 'de'
    expect(state.favorites.value[0]?.name).toBe('Köln')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('preserves favorites on lookup failure and offers a successful retry', async () => {
    const { state, storage, fetch } = await setup('server', [cologne], vi.fn().mockRejectedValue(new Error('offline')))
    await state.retryLocalization()
    expect(state.errorMessage.value).toBe('errorFavoriteLocalization')
    expect(storage.value).toEqual([cologne])
    fetch.mockImplementation(localizedFetch('server'))
    await state.retryLocalization()
    expect(state.errorMessage.value).toBe('')
    expect(storage.value[0]?.labels?.de?.name).toBe('Köln')
  })

  it('does not restore a removed favorite when an old lookup finishes', async () => {
    let resolve!: (payload: unknown) => void
    const response = new Promise(resolvePromise => { resolve = resolvePromise })
    const { state, storage } = await setup('server', [], vi.fn().mockReturnValue(response))
    state.toggleFavorite(cologne)
    state.removeFavorite(koeln)
    resolve({ results: [koeln] })
    await vi.waitFor(() => expect(state.isLocalizing.value).toBe(false))
    expect(storage.value).toEqual([])
    expect(state.errorMessage.value).toBe('')
  })

  it('rejects an ID lookup that returns a different city', async () => {
    const { state, storage } = await setup('server', [cologne], vi.fn().mockResolvedValue({
      results: [{ ...koeln, id: 3178287, latitude: 45.57862 }]
    }))
    await state.retryLocalization()
    expect(state.errorMessage.value).toBe('errorFavoriteLocalization')
    expect(storage.value[0]?.labels).toBeUndefined()
  })

  it.each(['server', 'external'])('localizes coordinate-based favorites with reverse geocoding in %s mode', async (mode) => {
    const fetch = vi.fn(async (url: string, options: { query: { language?: string; localityLanguage?: string } }) => {
      if (url.includes('geocode') && !url.includes('reverse-geocode')) return { results: [] }
      if (url.includes('/v1/search')) return { results: [] }
      const language = options.query.language ?? options.query.localityLanguage
      return language === 'de' ? { city: 'Köln', countryName: 'Deutschland' } : { city: 'Cologne', countryName: 'Germany' }
    })
    const { state, storage } = await setup(mode, [{ ...cologne, id: undefined }], fetch)
    await state.retryLocalization()
    expect(storage.value[0]?.labels?.de?.name).toBe('Köln')
    expect(storage.value[0]?.labels?.en?.name).toBe('Cologne')
  })

  it('distinguishes namesakes and uses coordinates for old favorites', () => {
    expect(sameLocation(cologne, koeln)).toBe(true)
    expect(sameLocation(cologne, { ...cologne, id: 3178287 })).toBe(false)
    expect(sameLocation(cologne, { ...cologne, id: undefined })).toBe(true)
    expect(sameLocation(cologne, { ...cologne, id: undefined, latitude: cologne.latitude + 0.005 })).toBe(false)
    expect(localizeFavorite({ ...cologne, labels: { de: { name: 'Köln', country: 'Deutschland' } } }, 'de').admin1).toBeUndefined()
    expect(favoriteLabels({ ...cologne, labels: { de: { name: '', country: 'Deutschland' } } }, 'de')).toBeUndefined()
  })

  it('only resolves current-city identity from unique name, country, and administrative context', () => {
    const current = { ...cologne, id: undefined, latitude: 50.94, longitude: 6.96 }
    expect(resolveCityIdentity(current, [cologne], cologne.admin1)).toMatchObject({ id: cologne.id })
    expect(resolveCityIdentity(current, [cologne, { ...cologne, id: 3178287 }], cologne.admin1)).toEqual(current)
    expect(resolveCityIdentity(current, [{ ...cologne, admin1: 'Bavaria' }], cologne.admin1)).toEqual(current)
    expect(resolveCityIdentity({ ...current, country: 'DE' }, [cologne], cologne.admin1)).toMatchObject({ id: cologne.id })
  })
})
