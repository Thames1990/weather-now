<script setup lang="ts">
import type { ClothingGender } from '~/utils/clothing'
import { LOCATING_LOCATION_NAME, LOADING_LOCATION_NAME } from '~/composables/useWeather'
import { formatDay, hourlyLabels } from '~/utils/weather'

const {
  weather,
  current,
  selectedLocation,
  query,
  searchResults,
  isLoading,
  isSearching,
  hasSearched,
  errorMessage,
  searchError,
  currentCondition,
  currentIcon,
  currentEffect,
  hourlyForecast,
  dailyForecast,
  fetchWeather,
  searchLocations,
  clearSearch,
  chooseLocation,
  useCurrentLocation
} = useWeather()
const { locale, t, setLocaleCookie } = useI18n()
const hourlyTimeLabels = computed(() => hourlyLabels(hourlyForecast.value, locale.value, weather.value?.timezone ?? 'UTC', t('now')))
const languageOptions = [
  { label: 'EN', value: 'en' },
  { label: 'DE', value: 'de' }
]

const colorMode = useColorMode()
const themeOptions = computed(() => [
  { label: t('systemTheme'), value: 'system', icon: 'i-lucide-monitor' },
  { label: t('lightTheme'), value: 'light', icon: 'i-lucide-sun' },
  { label: t('darkTheme'), value: 'dark', icon: 'i-lucide-moon' }
])
const isReady = useAppReady()
const isDashboardVisible = ref(false)
const showStartupLoader = useDelayedFlag(() => isReady.value && !isDashboardVisible.value, 600)
let isUnmounted = false

watch(() => isReady.value && !isLoading.value, async (settled) => {
  if (!settled || isDashboardVisible.value) return
  await nextTick()
  await document.fonts.ready
  // Let the populated dashboard finish layout before its first visible frame.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!isUnmounted) isDashboardVisible.value = true
    })
  })
})

onBeforeUnmount(() => { isUnmounted = true })
const isRefreshing = useDelayedFlag(() => isLoading.value && Boolean(current.value))
// theme classes use `dark:` variants so the prerendered page already matches the color-mode class set before paint
const panelThemeClass = 'border border-slate-200/80 bg-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-slate-800/80 dark:bg-slate-900/90 dark:shadow-[0_10px_30px_rgba(2,6,23,0.38)]'
const headerIconButtonClass = 'min-h-[48px] min-w-[48px] justify-center'

const {
  favorites, isFavorite, addFavorite, saveFavorites, displayLocation,
  isLocalizing, errorMessage: favoriteError, retryLocalization
} = useFavorites()
const displayedLocation = computed(() => displayLocation(selectedLocation.value))

const clothingGender = usePersistentState<ClothingGender>('weather-now:clothing-gender', 'neutral')
const savedLanguage = usePersistentState<'en' | 'de'>(
  'weather-now:language',
  isSupportedLocale(locale.value) ? locale.value : 'en'
)

function isClothingGender(value: string | null): value is ClothingGender {
  return value === 'neutral' || value === 'feminine' || value === 'masculine'
}

function updateClothingGender(gender: ClothingGender) {
  clothingGender.value = gender
}

function isSupportedLocale(value: string | null): value is 'en' | 'de' {
  return value === 'en' || value === 'de'
}

onMounted(() => {
  if (!isClothingGender(clothingGender.value)) clothingGender.value = 'neutral'
  if (!isSupportedLocale(savedLanguage.value)) savedLanguage.value = 'en'
  // Restoration may equal the default and not trigger the savedLanguage watcher.
  locale.value = savedLanguage.value
  setLocaleCookie(savedLanguage.value)
  isReady.value = true
})

watch(locale, (value) => {
  if (isSupportedLocale(value)) {
    setLocaleCookie(value)
    savedLanguage.value = value
  }
})

watch(savedLanguage, (value) => {
  if (isSupportedLocale(value) && locale.value !== value) locale.value = value
})
</script>

<template>
  <UApp>
    <div class="relative min-h-screen w-full max-w-none overflow-x-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <div v-if="showStartupLoader" role="status" class="absolute inset-0 grid place-content-center justify-items-center gap-3">
        <UIcon name="i-lucide-cloud-sun" class="size-8 text-primary" aria-hidden="true" />
        <span class="min-h-5 text-sm text-muted">{{ $t('loadingForecast') }}</span>
      </div>
      <UDashboardGroup
        class="wn-dashboard relative min-h-dvh w-full max-w-none overflow-visible dashboard:fixed dashboard:overflow-hidden motion-safe:transition-opacity motion-safe:duration-300 motion-safe:ease-out"
        :class="isDashboardVisible ? 'visible opacity-100' : 'invisible opacity-0'"
        :inert="!isDashboardVisible"
        :aria-busy="!isDashboardVisible"
      >
        <UDashboardPanel :ui="{ root: `${panelThemeClass} min-h-dvh w-full rounded-2xl backdrop-blur-sm dashboard:min-h-0 dashboard:h-full`, body: 'js-dashboard-scroll grid flex-none min-h-0 w-full grid-cols-1 gap-4 overflow-visible p-3 sm:p-4 md:grid-cols-2 dashboard:flex-1 dashboard:grid-cols-12 dashboard:auto-rows-[minmax(max-content,auto)] dashboard:gap-3 dashboard:p-3 dashboard:overflow-y-auto dashboard:overflow-x-hidden pb-[max(0.75rem,env(safe-area-inset-bottom))]' }">
          <template #header>
            <header data-testid="app-navbar" class="grid w-full shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-slate-200/80 bg-white/80 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] dark:border-slate-800/80 dark:bg-slate-900/90 toolbar:grid-cols-[auto_minmax(0,1fr)_auto] toolbar:gap-x-4 toolbar:pl-[max(1rem,env(safe-area-inset-left))] toolbar:pr-[max(1rem,env(safe-area-inset-right))] short-landscape:grid-cols-[auto_minmax(0,1fr)_auto] short-landscape:gap-x-2 short-landscape:pt-[max(0.25rem,env(safe-area-inset-top))] short-landscape:pb-1">
              <div class="flex min-w-0 items-center gap-2">
                <UIcon name="i-lucide-cloud-sun" class="size-6 shrink-0 text-primary" aria-hidden="true" />
                <h1 class="truncate font-semibold text-highlighted">{{ $t('brand') }}</h1>
              </div>

              <div class="flex items-center justify-end gap-1.5 toolbar:col-start-3 toolbar:row-start-1 toolbar:gap-2 short-landscape:col-start-3 short-landscape:row-start-1">
                <UTooltip :text="$t('useCurrentLocation')">
                  <UButton icon="i-lucide-locate-fixed" color="neutral" variant="ghost" :class="headerIconButtonClass" :aria-label="$t('useCurrentLocation')" @click="useCurrentLocation" />
                </UTooltip>
                <div class="hidden items-center gap-2 toolbar:flex">
                  <USelect v-if="isReady" v-model="locale" :items="languageOptions" value-key="value" size="sm" class="w-24" :ui="{ base: 'min-h-[48px]' }" :aria-label="$t('language')" />
                  <USkeleton v-else class="h-[48px] w-24 rounded-md" />
                  <ThemeSelector v-if="isReady" v-model="colorMode.preference" class="w-60" :options="themeOptions" :label="$t('theme')" />
                  <USkeleton v-else class="h-[50px] w-60 rounded-lg" />
                </div>

                <UPopover class="toolbar:hidden" :content="{ side: 'bottom', align: 'end' }">
                  <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" :class="headerIconButtonClass" :aria-label="$t('settings')" />
                  <template #content>
                    <div class="grid min-w-52 gap-3 p-3">
                      <USelect v-if="isReady" v-model="locale" :items="languageOptions" value-key="value" class="w-full" :ui="{ base: 'min-h-[48px]' }" :aria-label="$t('language')" />
                      <USkeleton v-else class="h-[48px] w-full rounded-md" />
                      <ThemeSelector v-if="isReady" v-model="colorMode.preference" :options="themeOptions" :label="$t('theme')" />
                      <USkeleton v-else class="h-12 w-full rounded-md" />
                    </div>
                  </template>
                </UPopover>
              </div>

              <FavoritesMenu
                class="col-span-2 min-w-0 toolbar:col-span-1 toolbar:col-start-2 toolbar:row-start-1 short-landscape:col-span-1 short-landscape:col-start-2 short-landscape:row-start-1"
                :favorites="favorites"
                :current-location="displayedLocation"
                :has-current-location="isReady && Boolean(current) && selectedLocation.name !== LOCATING_LOCATION_NAME && selectedLocation.name !== LOADING_LOCATION_NAME"
                :is-current-favorite="isFavorite(selectedLocation)"
                :is-localizing="isLocalizing"
                :error-message="favoriteError"
                @select="chooseLocation"
                @add="addFavorite"
                @save="saveFavorites"
                @retry="retryLocalization"
                @close="clearSearch"
              >
                <template #desktop-search="{ selectLocation }">
                  <WeatherSearch
                    input-only
                    :query="query"
                    :results="searchResults"
                    :is-searching="isSearching"
                    :has-searched="hasSearched"
                    :error-message="searchError"
                    @update:query="query = $event"
                    @clear="clearSearch"
                    @select="selectLocation"
                    @retry="searchLocations"
                  />
                </template>
                <template #search="{ selectLocation }">
                  <WeatherSearch
                    :query="query"
                    :results="searchResults"
                    :is-searching="isSearching"
                    :has-searched="hasSearched"
                    :error-message="searchError"
                    @update:query="query = $event"
                    @clear="clearSearch"
                    @select="selectLocation"
                    @retry="searchLocations"
                  />
                </template>
              </FavoritesMenu>
            </header>
          </template>

          <template #body>
            <CurrentWeatherPanel
              class="min-w-0 col-span-1 dashboard:col-span-4"
              :location="displayedLocation"
              :current="current"
              :timezone="weather?.timezone"
              :condition="currentCondition"
              :icon="currentIcon"
              :effect="currentEffect"
              :is-refreshing="isRefreshing"
              :error-message="errorMessage"
              @retry="fetchWeather(selectedLocation)"
            />
            <ClothingRecommendation class="min-w-0 col-span-1 dashboard:col-span-5" :current="current" :hourly="hourlyForecast" :gender="clothingGender" @update:gender="updateClothingGender" />
            <WeatherDetails class="min-w-0 col-span-1 dashboard:col-span-3" :current="current" :timezone="weather?.timezone" :sunrise="weather?.daily.sunrise[0]" :sunset="weather?.daily.sunset[0]" />

            <HourlyForecast class="min-w-0 col-span-1 dashboard:col-span-5" :forecast="hourlyForecast" :labels="hourlyTimeLabels" :timezone="weather?.timezone" :is-refreshing="isRefreshing" />
            <DailyForecast class="min-w-0 col-span-1 md:col-span-2 dashboard:col-span-7" :forecast="dailyForecast" :timezone="weather?.timezone" :sunrise="weather?.daily.sunrise[0]" />

            <UCard data-testid="temperature-trend-card" class="min-w-0 col-span-1 min-h-[220px] dashboard:col-span-4" :ui="{ root: 'overflow-visible flex min-w-0 flex-col', body: 'flex-1 min-h-0' }">
              <template #header>
                <h2 class="text-lg font-semibold text-highlighted">
                  <span v-if="isReady" class="wn-fade-in">{{ $t('temperatureTrend') }}</span>
                  <USkeleton v-else as="span" class="my-1 block h-5 w-40" />
                </h2>
              </template>
              <LineChart v-if="isReady && hourlyForecast.length" class="wn-fade-in" :values="hourlyForecast.map((hour) => hour.temperature)" :labels="hourlyTimeLabels" unit="°" color="var(--ui-primary)" />
              <ChartSkeleton v-else variant="line" />
            </UCard>

            <UCard data-testid="precipitation-outlook-card" class="min-w-0 col-span-1 min-h-[220px] dashboard:col-span-4" :ui="{ root: 'overflow-visible flex min-w-0 flex-col', body: 'flex-1 min-h-0' }">
              <template #header>
                <h2 class="text-lg font-semibold text-highlighted">
                  <span v-if="isReady" class="wn-fade-in">{{ $t('precipitationOutlook') }}</span>
                  <USkeleton v-else as="span" class="my-1 block h-5 w-40" />
                </h2>
              </template>
              <BarChart
                v-if="isReady && hourlyForecast.length"
                class="wn-fade-in"
                :values="hourlyForecast.map((hour) => hour.precipitationAmount)"
                :labels="hourlyTimeLabels"
                :min-column-width="3.5"
                unit="mm"
                color="bg-primary"
                :format-value="(value) => value.toFixed(1)"
              />
              <ChartSkeleton v-else :bars="6" />
            </UCard>

            <UCard data-testid="sun-hours-card" class="min-w-0 col-span-1 min-h-[220px] md:col-span-2 dashboard:col-span-4" :ui="{ root: 'overflow-visible flex min-w-0 flex-col', body: 'flex-1 min-h-0' }">
              <template #header>
                <h2 class="text-lg font-semibold text-highlighted">
                  <span v-if="isReady" class="wn-fade-in">{{ $t('sunHoursThisWeek') }}</span>
                  <USkeleton v-else as="span" class="my-1 block h-5 w-40" />
                </h2>
              </template>
              <BarChart
                v-if="isReady && dailyForecast.length"
                class="wn-fade-in"
                :values="dailyForecast.map((day) => day.sunshineHours)"
                :labels="dailyForecast.map((day, index) => (index === 0 ? $t('today') : formatDay(day.time, index, locale)))"
                unit="h"
                color="bg-primary"
                :format-value="(value) => `${value.toFixed(1)}h`"
              />
              <ChartSkeleton v-else :bars="7" />
            </UCard>
          </template>
        </UDashboardPanel>
      </UDashboardGroup>
    </div>
  </UApp>
</template>
