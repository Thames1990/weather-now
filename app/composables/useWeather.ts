import type { DailyForecast, HourlyForecast, LocationResult, WeatherResponse } from '~/types/weather'
import { parseGeocodingResults, parseIpLocationResult, parseOpenMeteoWeatherResponse, parseReverseGeocodeResult } from '~/utils/provider-validation'
import { normalizeWeather, selectHourlyForecast, weatherEffect, weatherIcon, weatherLabel } from '~/utils/weather'

const defaultLocation: LocationResult = {
  name: 'London',
  country: 'United Kingdom',
  latitude: 51.5072,
  longitude: -0.1276,
  timezone: 'Europe/London'
}
// Sentinels for transient placeholder locations; translated for display where rendered (see CurrentWeatherPanel).
export const LOADING_LOCATION_NAME = '__loading-location__'
export const LOCATING_LOCATION_NAME = '__locating-location__'
export const CURRENT_LOCATION_FALLBACK_NAME = '__current-location-fallback__'
const loadingLocation: LocationResult = {
  name: LOADING_LOCATION_NAME,
  country: '',
  latitude: 0,
  longitude: 0,
  timezone: 'auto'
}
const savedLocationKey = 'weather-now:last-location'
const currentParams = 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m'
const hourlyParams = 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m'
const dailyParams = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunshine_duration,sunrise,sunset'

export function useWeather() {
  const { locale } = useI18n()
  const config = useRuntimeConfig()
  const weather = ref<WeatherResponse | null>(null)
  const selectedLocation = ref<LocationResult>(loadingLocation)
  const query = ref('')
  const searchResults = ref<LocationResult[]>([])
  const isLoading = ref(true)
  const isSearching = ref(false)
  const hasSearched = ref(false)
  const errorMessage = ref('')
  const searchError = ref('')
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  let weatherRequestId = 0
  let searchRequestId = 0
  let locationRequestId = 0

  const current = computed(() => weather.value?.current)
  const currentCondition = computed(() => weatherLabel(current.value?.weather_code ?? 0, locale.value))
  const currentIcon = computed(() => weatherIcon(current.value?.weather_code ?? 0, current.value?.is_day === 1))
  const currentEffect = computed(() => weatherEffect(current.value?.weather_code ?? 0, current.value?.wind_speed_10m ?? 0))
  const hourlyForecast = computed<HourlyForecast[]>(() => {
    if (!weather.value) return []
    return selectHourlyForecast(weather.value)
  })
  const dailyForecast = computed<DailyForecast[]>(() => {
    if (!weather.value) return []
    return weather.value.daily.time.map((time, index) => ({
      time,
      code: Number(weather.value!.daily.weather_code[index] ?? 0),
      high: Number(weather.value!.daily.temperature_2m_max[index] ?? 0),
      low: Number(weather.value!.daily.temperature_2m_min[index] ?? 0),
      precipitation: Number(weather.value!.daily.precipitation_probability_max[index] ?? 0),
      precipitationSum: Number(weather.value!.daily.precipitation_sum[index] ?? 0),
      sunshineHours: Number(weather.value!.daily.sunshine_duration[index] ?? 0) / 3600
    }))
  })

  async function fetchWeatherData(location: LocationResult): Promise<WeatherResponse> {
    if (config.public.apiMode !== 'external') {
      return await $fetch<WeatherResponse>('/api/weather', {
        query: { latitude: location.latitude, longitude: location.longitude }
      })
    }

    const payload = await $fetch<unknown>('https://api.open-meteo.com/v1/forecast', {
      query: {
        latitude: location.latitude,
        longitude: location.longitude,
        current: currentParams,
        hourly: hourlyParams,
        daily: dailyParams,
        timezone: 'auto',
        timeformat: 'unixtime',
        forecast_days: 7
      }
    })
    return normalizeWeather(parseOpenMeteoWeatherResponse(payload))
  }

  async function loadWeather(location: LocationResult) {
    const requestId = ++weatherRequestId
    isLoading.value = true
    errorMessage.value = ''
    selectedLocation.value = location
    try {
      const response = await fetchWeatherData(location)
      if (requestId !== weatherRequestId) return // a newer request has superseded this one
      weather.value = response
      if (import.meta.client) localStorage.setItem(savedLocationKey, JSON.stringify(location))
    } catch {
      if (requestId !== weatherRequestId) return
      errorMessage.value = 'errorForecastUnavailable'
    } finally {
      if (requestId === weatherRequestId) isLoading.value = false
    }
  }

  async function fetchWeather(location: LocationResult) {
    locationRequestId++
    await loadWeather(location)
  }

  async function searchLocations(searchTerm = query.value) {
    const requestId = ++searchRequestId
    const normalizedQuery = searchTerm.trim()
    if (normalizedQuery.length < 2) {
      searchResults.value = []
      searchError.value = ''
      hasSearched.value = false
      isSearching.value = false
      return
    }
    isSearching.value = true
    searchError.value = ''
    hasSearched.value = false
    try {
      const payload = config.public.apiMode === 'external'
        ? await $fetch<unknown>('https://geocoding-api.open-meteo.com/v1/search', {
            query: { name: normalizedQuery, count: 5, language: locale.value, format: 'json' }
          })
        : await $fetch<unknown>('/api/geocode', {
            query: { name: normalizedQuery, language: locale.value }
          })
      if (requestId !== searchRequestId || query.value.trim() !== normalizedQuery) return
      searchResults.value = parseGeocodingResults(payload)
      hasSearched.value = true
    } catch {
      if (requestId !== searchRequestId || query.value.trim() !== normalizedQuery) return
      searchResults.value = []
      searchError.value = 'errorSearchUnavailable'
      hasSearched.value = true
    } finally {
      if (requestId === searchRequestId) isSearching.value = false
    }
  }

  function chooseLocation(location: LocationResult) {
    searchResults.value = []
    query.value = ''
    fetchWeather(location)
  }

  async function locationFromCoordinates(latitude: number, longitude: number): Promise<LocationResult> {
    try {
      const payload = config.public.apiMode === 'external'
        ? await $fetch<unknown>('https://api.bigdatacloud.net/data/reverse-geocode-client', {
            query: { latitude, longitude, localityLanguage: 'en' }
          })
        : await $fetch<unknown>('/api/reverse-geocode', {
            query: { latitude, longitude }
          })
      const place = parseReverseGeocodeResult(payload)
      return { name: place.name || CURRENT_LOCATION_FALLBACK_NAME, country: place.country, latitude, longitude, timezone: 'auto' }
    } catch {
      return { name: CURRENT_LOCATION_FALLBACK_NAME, country: '', latitude, longitude, timezone: 'auto' }
    }
  }

  async function locationFromIp(): Promise<LocationResult> {
    const payload = config.public.apiMode === 'external'
      ? await $fetch<unknown>('https://ipinfo.io/json')
      : await $fetch<unknown>('/api/ip-location')
    const place = parseIpLocationResult(payload)
    return {
      name: place.name || CURRENT_LOCATION_FALLBACK_NAME,
      country: place.country,
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: 'auto'
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      locationRequestId++
      weatherRequestId++
      isLoading.value = false
      errorMessage.value = 'errorLocationUnsupported'
      return
    }
    const requestId = ++locationRequestId
    const isCurrentRequest = () => requestId === locationRequestId
    weatherRequestId++
    isLoading.value = true
    errorMessage.value = ''
    selectedLocation.value = { name: LOCATING_LOCATION_NAME, country: '', latitude: 0, longitude: 0, timezone: 'auto' }
    let settled = false
    let ipFailed = false
    let geoFailed = false

    function failIfBothGaveUp() {
      if (!isCurrentRequest() || settled || !ipFailed || !geoFailed) return
      settled = true
      errorMessage.value = 'errorLocationNotFound'
      isLoading.value = false
    }

    // Start a fast IP-based lookup immediately alongside the browser's own geolocation request
    // (permission prompt + network location lookup) and use whichever resolves first.
    ;(async () => {
      try {
        const place = await locationFromIp()
        if (!isCurrentRequest() || settled) return
        settled = true
        await loadWeather(place)
      } catch {
        if (!isCurrentRequest()) return
        ipFailed = true
        failIfBothGaveUp()
      }
    })()

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        if (!isCurrentRequest() || settled) return
        settled = true
        const { latitude, longitude } = coords
        // show the forecast as soon as it's ready instead of waiting on reverse-geocoding first; resolve the place name in parallel
        const namePromise = locationFromCoordinates(latitude, longitude)
        await loadWeather({ name: CURRENT_LOCATION_FALLBACK_NAME, country: '', latitude, longitude, timezone: 'auto' })
        const place = await namePromise
        if (isCurrentRequest() && selectedLocation.value.latitude === latitude && selectedLocation.value.longitude === longitude) {
          selectedLocation.value = { ...selectedLocation.value, name: place.name, country: place.country }
          if (import.meta.client) localStorage.setItem(savedLocationKey, JSON.stringify(selectedLocation.value))
        }
      },
      () => {
        if (!isCurrentRequest()) return
        geoFailed = true
        failIfBothGaveUp()
      },
      {
        enableHighAccuracy: false,
        maximumAge: 300000,
        timeout: 8000
      }
    )
  }

  function readSavedLocation(): LocationResult {
    if (!import.meta.client) return defaultLocation
    try {
      const saved = JSON.parse(localStorage.getItem(savedLocationKey) || 'null') as Partial<LocationResult> | null
      if (saved && typeof saved.name === 'string' && typeof saved.latitude === 'number' && typeof saved.longitude === 'number') {
        return { name: saved.name, country: typeof saved.country === 'string' ? saved.country : '', latitude: saved.latitude, longitude: saved.longitude, timezone: typeof saved.timezone === 'string' ? saved.timezone : 'auto', admin1: typeof saved.admin1 === 'string' ? saved.admin1 : undefined }
      }
    } catch {
      localStorage.removeItem(savedLocationKey)
    }
    return defaultLocation
  }

  watch(query, (value) => {
    searchRequestId++
    if (searchTimer) clearTimeout(searchTimer)
    searchResults.value = []
    searchError.value = ''
    hasSearched.value = false
    isSearching.value = false
    if (value.trim().length < 2) return
    const requestId = searchRequestId
    searchTimer = setTimeout(() => {
      searchTimer = undefined
      if (requestId === searchRequestId) void searchLocations(value)
    }, 250)
  }, { flush: 'sync' })

  onMounted(() => fetchWeather(readSavedLocation()))
  onBeforeUnmount(() => {
    if (searchTimer) clearTimeout(searchTimer)
    searchRequestId++
    locationRequestId++
    weatherRequestId++
  })

  return { weather, current, selectedLocation, query, searchResults, isLoading, isSearching, hasSearched, errorMessage, searchError, currentCondition, currentIcon, currentEffect, hourlyForecast, dailyForecast, fetchWeather, searchLocations, chooseLocation, useCurrentLocation }
}
