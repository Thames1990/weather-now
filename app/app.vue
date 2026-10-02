<script setup lang="ts">
import type { ClothingGender } from '~/utils/clothing'
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
  chooseLocation,
  useCurrentLocation
} = useWeather()
const { locale, t } = useI18n()
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
const navbarThemeClass = 'border-b border-slate-200/80 bg-white/80 dark:border-slate-800/80 dark:bg-slate-900/90'
function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

onMounted(() => {
  if (!colorMode.value) colorMode.preference = 'dark'
})

const { favorites, isFavorite, toggleFavorite, removeFavorite } = useFavorites()

const clothingGender = usePersistentState<ClothingGender>('weather-now:clothing-gender', 'neutral')
const savedLanguage = usePersistentState<'en' | 'de'>('weather-now:language', 'en')

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
  // persisted state is restored by now; the savedLanguage watcher applies the locale before the next render
  isReady.value = true
})

watch(locale, (value) => {
  if (isSupportedLocale(value)) savedLanguage.value = value
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
            <UDashboardNavbar data-testid="app-navbar" :title="$t('brand')" icon="i-lucide-cloud-sun" :toggle="false" :ui="{ root: `${navbarThemeClass} h-auto flex-wrap gap-2 px-2 py-3 sm:px-3`, right: 'w-full min-w-0 sm:w-auto' }">
              <template #right>
                <div class="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:flex-nowrap sm:gap-2">
                  <WeatherSearch
                    class="order-1 w-full min-w-0 basis-full sm:order-none sm:w-64 sm:basis-auto"
                    :query="query"
                    :results="searchResults"
                    :is-searching="isSearching"
                    :has-searched="hasSearched"
                    :error-message="searchError"
                    @update:query="query = $event"
                    @select="chooseLocation"
                    @retry="searchLocations"
                  />
                  <div class="order-2 flex flex-wrap items-center gap-1.5 sm:order-none sm:flex-nowrap sm:gap-2">
                    <UTooltip :text="$t('useCurrentLocation')">
                      <UButton icon="i-lucide-locate-fixed" color="neutral" variant="ghost" :aria-label="$t('useCurrentLocation')" @click="useCurrentLocation" />
                    </UTooltip>
                    <UTooltip v-if="isReady && current" :text="isFavorite(selectedLocation) ? $t('removeFavorite', { value: selectedLocation.name }) : $t('addFavorite', { value: selectedLocation.name })">
                      <UButton
                        :icon="isFavorite(selectedLocation) ? 'i-lucide-star' : 'i-lucide-star-off'"
                        :color="isFavorite(selectedLocation) ? 'warning' : 'neutral'"
                        variant="ghost"
                        :aria-label="isFavorite(selectedLocation) ? $t('removeFavorite', { value: selectedLocation.name }) : $t('addFavorite', { value: selectedLocation.name })"
                        @click="toggleFavorite(selectedLocation)"
                      />
                    </UTooltip>
                    <USkeleton v-else class="size-8 rounded-md" />
                    <FavoritesMenu :favorites="favorites" @select="chooseLocation" @remove="removeFavorite" />
                    <USelect v-if="isReady" v-model="locale" :items="languageOptions" value-key="value" size="sm" class="w-20 sm:w-24" :aria-label="$t('language')" />
                    <USkeleton v-else class="h-8 w-20 rounded-md sm:w-24" />
                    <UButton color="neutral" variant="ghost" square :aria-label="$t('toggleTheme')" @click="toggleColorMode">
                      <UIcon name="i-lucide-moon" class="size-5 dark:hidden" />
                      <UIcon name="i-lucide-sun" class="hidden size-5 dark:block" />
                    </UButton>
                  </div>
                </div>
              </template>
            </UDashboardNavbar>
          </template>

          <template #body>
            <CurrentWeatherPanel
              class="min-w-0 col-span-1 lg:col-span-4"
              :location="selectedLocation"
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
