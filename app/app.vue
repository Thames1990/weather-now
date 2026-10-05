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
const isReady = useAppReady()
const isRefreshing = useDelayedFlag(() => isLoading.value && Boolean(current.value))
// theme classes use `dark:` variants so the prerendered page already matches the color-mode class set before paint
const panelThemeClass = 'border border-slate-200/80 bg-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-slate-800/80 dark:bg-slate-900/90 dark:shadow-[0_10px_30px_rgba(2,6,23,0.38)]'
function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
const themeAction = computed(() => t(colorMode.value === 'dark' ? 'switchToLight' : 'switchToDark'))
const headerIconButtonClass = 'min-h-[48px] min-w-[48px] justify-center'

onMounted(() => {
  if (!colorMode.value) colorMode.preference = 'dark'
})

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
    <div class="min-h-screen w-full max-w-none overflow-x-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <UDashboardGroup class="w-full max-w-none">
        <UDashboardPanel :ui="{ root: `${panelThemeClass} w-full rounded-2xl backdrop-blur-sm`, body: 'js-dashboard-scroll grid min-h-0 w-full grid-cols-1 gap-4 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:grid-cols-12 lg:auto-rows-[minmax(196px,auto)] lg:gap-3 lg:p-3 lg:overflow-hidden' }">
          <template #header>
            <header data-testid="app-navbar" class="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-slate-200/80 bg-white/80 px-3 py-2 dark:border-slate-800/80 dark:bg-slate-900/90 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-x-4 lg:px-4">
              <div class="flex min-w-0 items-center gap-2">
                <UIcon name="i-lucide-cloud-sun" class="size-6 shrink-0 text-primary" aria-hidden="true" />
                <h1 class="truncate font-semibold text-highlighted">{{ $t('brand') }}</h1>
              </div>

              <div class="flex items-center justify-end gap-1.5 lg:col-start-3 lg:row-start-1 lg:gap-2">
                <UTooltip :text="$t('useCurrentLocation')">
                  <UButton icon="i-lucide-locate-fixed" color="neutral" variant="ghost" :class="headerIconButtonClass" :aria-label="$t('useCurrentLocation')" @click="useCurrentLocation" />
                </UTooltip>
                <div class="hidden items-center gap-2 lg:flex">
                  <USelect v-if="isReady" v-model="locale" :items="languageOptions" value-key="value" size="sm" class="w-24" :ui="{ base: 'min-h-[48px]' }" :aria-label="$t('language')" />
                  <USkeleton v-else class="h-[48px] w-24 rounded-md" />
                  <UButton color="neutral" variant="ghost" square :class="headerIconButtonClass" :aria-label="themeAction" @click="toggleColorMode">
                    <UIcon name="i-lucide-moon" class="size-5 dark:hidden" />
                    <UIcon name="i-lucide-sun" class="hidden size-5 dark:block" />
                  </UButton>
                </div>

                <UPopover class="lg:hidden" :content="{ side: 'bottom', align: 'end' }">
                  <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" :class="headerIconButtonClass" :aria-label="$t('settings')" />
                  <template #content>
                    <div class="grid min-w-52 gap-3 p-3">
                      <USelect v-if="isReady" v-model="locale" :items="languageOptions" value-key="value" class="w-full" :ui="{ base: 'min-h-[48px]' }" :aria-label="$t('language')" />
                      <USkeleton v-else class="h-[48px] w-full rounded-md" />
                      <UButton color="neutral" variant="ghost" class="min-h-[48px] justify-start" :aria-label="themeAction" @click="toggleColorMode">
                        <UIcon name="i-lucide-moon" class="size-5 dark:hidden" />
                        <UIcon name="i-lucide-sun" class="hidden size-5 dark:block" />
                        {{ themeAction }}
                      </UButton>
                    </div>
                  </template>
                </UPopover>
              </div>

              <FavoritesMenu
                class="col-span-2 min-w-0 lg:col-span-1 lg:col-start-2 lg:row-start-1"
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
              class="min-w-0 col-span-1 lg:col-span-4"
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
            <ClothingRecommendation class="min-w-0 col-span-1 lg:col-span-5" :current="current" :hourly="hourlyForecast" :gender="clothingGender" @update:gender="updateClothingGender" />
            <WeatherDetails class="min-w-0 col-span-1 lg:col-span-3" :current="current" :timezone="weather?.timezone" :sunrise="weather?.daily.sunrise[0]" :sunset="weather?.daily.sunset[0]" />

            <HourlyForecast class="min-w-0 col-span-1 lg:col-span-5" :forecast="hourlyForecast" :labels="hourlyTimeLabels" :timezone="weather?.timezone" :is-refreshing="isRefreshing" />
            <DailyForecast class="min-w-0 col-span-1 lg:col-span-7" :forecast="dailyForecast" :timezone="weather?.timezone" :sunrise="weather?.daily.sunrise[0]" />

            <UCard data-testid="temperature-trend-card" class="min-w-0 col-span-1 min-h-[220px] lg:col-span-4 lg:min-h-0" :ui="{ root: 'overflow-visible h-full lg:overflow-hidden flex min-w-0 flex-col', body: 'flex-1 min-h-0' }">
              <template #header>
                <h2 class="text-lg font-semibold text-highlighted">
                  <span v-if="isReady" class="wn-fade-in">{{ $t('temperatureTrend') }}</span>
                  <USkeleton v-else as="span" class="my-1 block h-5 w-40" />
                </h2>
              </template>
              <LineChart v-if="isReady && hourlyForecast.length" class="wn-fade-in" :values="hourlyForecast.slice(0, 8).map((hour) => hour.temperature)" :labels="hourlyTimeLabels.slice(0, 8)" unit="°" color="var(--ui-primary)" />
              <ChartSkeleton v-else variant="line" />
            </UCard>

            <UCard data-testid="precipitation-outlook-card" class="min-w-0 col-span-1 min-h-[220px] lg:col-span-4 lg:min-h-0" :ui="{ root: 'overflow-visible h-full lg:overflow-hidden flex min-w-0 flex-col', body: 'flex-1 min-h-0' }">
              <template #header>
                <h2 class="text-lg font-semibold text-highlighted">
                  <span v-if="isReady" class="wn-fade-in">{{ $t('precipitationOutlook') }}</span>
                  <USkeleton v-else as="span" class="my-1 block h-5 w-40" />
                </h2>
              </template>
              <BarChart
                v-if="isReady && hourlyForecast.length"
                class="wn-fade-in"
                :values="hourlyForecast.slice(0, 6).map((hour) => hour.precipitationAmount)"
                :labels="hourlyTimeLabels.slice(0, 6)"
                unit="mm"
                color="bg-primary"
                :format-value="(value) => value.toFixed(1)"
              />
              <ChartSkeleton v-else :bars="6" />
            </UCard>

            <UCard data-testid="sun-hours-card" class="min-w-0 col-span-1 min-h-[220px] lg:col-span-4 lg:min-h-0" :ui="{ root: 'overflow-visible h-full lg:overflow-hidden flex min-w-0 flex-col', body: 'flex-1 min-h-0' }">
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
