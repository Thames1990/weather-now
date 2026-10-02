import type { DailyForecast, HourlyForecast, LocationResult, OpenMeteoWeatherResponse, WeatherResponse } from '~/types/weather'
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
const hourlyParams = 'temperature_2m,precipitation_probability,precipitation,weather_code'
const dailyParams = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunshine_duration,sunrise,sunset'

interface ExternalGeocodeResponse {
  results?: LocationResult[]
}

interface ExternalReverseGeocodeResponse {
  city?: string
  locality?: string
  principalSubdivision?: string
  countryName?: string
}

interface ExternalIpLocationResponse {
  city?: string
  country?: string
  loc?: string
}

export function useWeather() {
  const { locale } = useI18n()
  const config = useRuntimeConfig()
  const weather = ref<WeatherResponse | null>(null)
  const selectedLocation = ref<LocationResult>(loadingLocation)
  const query = ref('')
  const searchResults = ref<LocationResult[]>([])
  const isLoading = ref(true)
  const isSearching = ref(false)
  const errorMessage = ref('')
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  let weatherRequestId = 0

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

    const response = await $fetch<OpenMeteoWeatherResponse>('https://api.open-meteo.com/v1/forecast', {
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
    return normalizeWeather(response)
  }

  async function fetchWeather(location: LocationResult) {
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

  async function searchLocations(searchTerm = query.value) {
    const normalizedQuery = searchTerm.trim()
    if (normalizedQuery.length < 2) return
    isSearching.value = true
    try {
      const response = config.public.apiMode === 'external'
        ? await $fetch<ExternalGeocodeResponse>('https://geocoding-api.open-meteo.com/v1/search', {
            query: { name: normalizedQuery, count: 5, language: locale.value, format: 'json' }
          })
        : await $fetch<ExternalGeocodeResponse>('/api/geocode', {
            query: { name: normalizedQuery, language: locale.value }
          })
      if (query.value.trim() === normalizedQuery) searchResults.value = response.results ?? []
    } catch {
      if (query.value.trim() === normalizedQuery) searchResults.value = []
    } finally {
      isSearching.value = false
    }
  }

  function chooseLocation(location: LocationResult) {
    searchResults.value = []
    query.value = ''
    fetchWeather(location)
  }

  async function locationFromCoordinates(latitude: number, longitude: number): Promise<LocationResult> {
    try {
      const place = config.public.apiMode === 'external'
        ? await $fetch<ExternalReverseGeocodeResponse>('https://api.bigdatacloud.net/data/reverse-geocode-client', {
            query: { latitude, longitude, localityLanguage: 'en' }
          })
        : await $fetch<{ name?: string; country?: string }>('/api/reverse-geocode', {
            query: { latitude, longitude }
          })
      const name = 'name' in place
        ? place.name
        : place.city || place.locality || place.principalSubdivision
      const country = 'country' in place ? place.country : place.countryName
      return { name: name || CURRENT_LOCATION_FALLBACK_NAME, country: country || '', latitude, longitude, timezone: 'auto' }
    } catch {
      return { name: CURRENT_LOCATION_FALLBACK_NAME, country: '', latitude, longitude, timezone: 'auto' }
    }
  }

  async function locationFromIp(): Promise<LocationResult> {
    const place = config.public.apiMode === 'external'
      ? await $fetch<ExternalIpLocationResponse>('https://ipinfo.io/json')
      : await $fetch<{ name?: string; country?: string; latitude?: number; longitude?: number }>('/api/ip-location')
    const [latitude, longitude] = 'loc' in place
      ? (place.loc || '').split(',').map(Number)
      : [place.latitude, place.longitude]
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('IP location coordinates unavailable')
    return {
      name: ('name' in place ? place.name : place.city) || CURRENT_LOCATION_FALLBACK_NAME,
      country: place.country || '',
      latitude,
      longitude,
      timezone: 'auto'
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      errorMessage.value = 'errorLocationUnsupported'
      return
    }
    isLoading.value = true
    errorMessage.value = ''
    selectedLocation.value = { name: LOCATING_LOCATION_NAME, country: '', latitude: 0, longitude: 0, timezone: 'auto' }
    let settled = false
    let ipFailed = false
    let geoFailed = false

    function failIfBothGaveUp() {
      if (settled || !ipFailed || !geoFailed) return
      settled = true
      errorMessage.value = 'errorLocationNotFound'
      isLoading.value = false
    }

    // Start a fast IP-based lookup immediately alongside the browser's own geolocation request
    // (permission prompt + network location lookup) and use whichever resolves first.
    ;(async () => {
      try {
        const place = await locationFromIp()
        if (settled) return
        settled = true
        await fetchWeather(place)
      } catch {
        ipFailed = true
        failIfBothGaveUp()
      }
    })()

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        if (settled) return
        settled = true
        const { latitude, longitude } = coords
        // show the forecast as soon as it's ready instead of waiting on reverse-geocoding first; resolve the place name in parallel
        const namePromise = locationFromCoordinates(latitude, longitude)
        await fetchWeather({ name: CURRENT_LOCATION_FALLBACK_NAME, country: '', latitude, longitude, timezone: 'auto' })
        const place = await namePromise
        if (selectedLocation.value.latitude === latitude && selectedLocation.value.longitude === longitude) {
          selectedLocation.value = { ...selectedLocation.value, name: place.name, country: place.country }
          if (import.meta.client) localStorage.setItem(savedLocationKey, JSON.stringify(selectedLocation.value))
        }
      },
      () => {
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
    if (searchTimer) clearTimeout(searchTimer)
    searchResults.value = []
    if (value.trim().length < 2) return
    searchTimer = setTimeout(() => searchLocations(value), 250)
  })

  onMounted(() => fetchWeather(readSavedLocation()))
  onBeforeUnmount(() => { if (searchTimer) clearTimeout(searchTimer) })

  return { weather, current, selectedLocation, query, searchResults, isLoading, isSearching, errorMessage, currentCondition, currentIcon, currentEffect, hourlyForecast, dailyForecast, fetchWeather, searchLocations, chooseLocation, useCurrentLocation }
}
