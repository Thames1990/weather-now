<script setup lang="ts">
import type { ClothingGender } from '~/utils/clothing'
import { formatDay, formatHour } from '~/utils/weather'

const {
  weather,
  current,
  selectedLocation,
  query,
  searchResults,
  isLoading,
  isSearching,
  errorMessage,
  currentCondition,
  currentIcon,
  currentEffect,
  hourlyForecast,
  dailyForecast,
  fetchWeather,
  chooseLocation,
  useCurrentLocation
} = useWeather()
const { locale } = useI18n()
const languageOptions = [
  { label: 'EN', value: 'en' },
  { label: 'DE', value: 'de' }
]

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const pageThemeClass = computed(() => isDark.value ? 'bg-slate-950 text-slate-50' : 'bg-slate-100 text-slate-900')
const panelThemeClass = computed(() => isDark.value
  ? 'border border-slate-800/80 bg-slate-900/90 shadow-[0_10px_30px_rgba(2,6,23,0.38)]'
  : 'border border-slate-200/80 bg-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.06)]')
const navbarThemeClass = computed(() => isDark.value
  ? 'border-b border-slate-800/80 bg-slate-900/90'
  : 'border-b border-slate-200/80 bg-white/80')
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
    <div :class="['min-h-screen w-full max-w-none overflow-x-hidden', pageThemeClass]">
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
                    @update:query="query = $event"
                    @select="chooseLocation"
                  />
                  <div class="order-2 flex flex-wrap items-center gap-1.5 sm:order-none sm:flex-nowrap sm:gap-2">
                    <UTooltip :text="$t('useCurrentLocation')">
                      <UButton icon="i-lucide-locate-fixed" color="neutral" variant="ghost" :aria-label="$t('useCurrentLocation')" @click="useCurrentLocation" />
                    </UTooltip>
                    <UTooltip v-if="current" :text="isFavorite(selectedLocation) ? $t('removeFavorite', { value: selectedLocation.name }) : $t('addFavorite', { value: selectedLocation.name })">
                      <UButton
                        :icon="isFavorite(selectedLocation) ? 'i-lucide-star' : 'i-lucide-star-off'"
                        :color="isFavorite(selectedLocation) ? 'warning' : 'neutral'"
                        variant="ghost"
                        :aria-label="isFavorite(selectedLocation) ? $t('removeFavorite', { value: selectedLocation.name }) : $t('addFavorite', { value: selectedLocation.name })"
                        @click="toggleFavorite(selectedLocation)"
                      />
                    </UTooltip>
                    <FavoritesMenu :favorites="favorites" @select="chooseLocation" @remove="removeFavorite" />
                    <USelect v-model="locale" :items="languageOptions" value-key="value" size="sm" class="w-20 sm:w-24" :aria-label="$t('language')" />
                    <UButton
                      :icon="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'"
                      color="neutral"
                      variant="ghost"
                      :aria-label="$t('toggleTheme')"
                      @click="toggleColorMode"
                    />
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
              :condition="currentCondition"
              :icon="currentIcon"
              :effect="currentEffect"
              :is-loading="isLoading"
              :error-message="errorMessage"
              @retry="fetchWeather(selectedLocation)"
            />
            <ClothingRecommendation class="min-w-0 col-span-1 lg:col-span-5" :current="current" :hourly="hourlyForecast" :gender="clothingGender" @update:gender="updateClothingGender" />
            <WeatherDetails class="min-w-0 col-span-1 lg:col-span-3" :current="current" :sunrise="weather?.daily.sunrise[0]" :sunset="weather?.daily.sunset[0]" />

            <HourlyForecast class="min-w-0 col-span-1 lg:col-span-5" :forecast="hourlyForecast" :timezone="weather?.timezone" :is-loading="isLoading" />
            <DailyForecast class="min-w-0 col-span-1 lg:col-span-7" :forecast="dailyForecast" :sunrise="weather?.daily.sunrise[0]" />

            <UCard data-testid="temperature-trend-card" class="min-w-0 col-span-1 min-h-[220px] lg:col-span-4 lg:min-h-0" :ui="{ root: 'overflow-visible h-full lg:overflow-hidden flex min-w-0 flex-col', body: 'flex-1 min-h-0' }">
              <template #header>
                <h2 class="text-lg font-semibold text-highlighted">{{ $t('temperatureTrend') }}</h2>
              </template>
              <LineChart v-if="hourlyForecast.length" :values="hourlyForecast.slice(0, 8).map((hour) => hour.temperature)" :labels="hourlyForecast.slice(0, 8).map((hour, index) => (index === 0 ? $t('now') : formatHour(hour.time, locale)))" unit="°" color="var(--ui-primary)" />
              <p v-else class="text-sm text-muted">{{ $t('readingNextHours') }}</p>
            </UCard>

            <UCard data-testid="precipitation-outlook-card" class="min-w-0 col-span-1 min-h-[220px] lg:col-span-4 lg:min-h-0" :ui="{ root: 'overflow-visible h-full lg:overflow-hidden flex min-w-0 flex-col', body: 'flex-1 min-h-0' }">
              <template #header>
                <h2 class="text-lg font-semibold text-highlighted">{{ $t('precipitationOutlook') }}</h2>
              </template>
              <BarChart
                v-if="hourlyForecast.length"
                :values="hourlyForecast.slice(0, 6).map((hour) => hour.precipitationAmount)"
                :labels="hourlyForecast.slice(0, 6).map((hour, index) => (index === 0 ? $t('now') : formatHour(hour.time, locale)))"
                unit="mm"
                color="bg-primary"
                :format-value="(value) => value.toFixed(1)"
              />
              <p v-else class="text-sm text-muted">{{ $t('readingNextHours') }}</p>
            </UCard>

            <UCard data-testid="sun-hours-card" class="min-w-0 col-span-1 min-h-[220px] lg:col-span-4 lg:min-h-0" :ui="{ root: 'overflow-visible h-full lg:overflow-hidden flex min-w-0 flex-col', body: 'flex-1 min-h-0' }">
              <template #header>
                <h2 class="text-lg font-semibold text-highlighted">{{ $t('sunHoursThisWeek') }}</h2>
              </template>
              <BarChart
                v-if="dailyForecast.length"
                :values="dailyForecast.map((day) => day.sunshineHours)"
                :labels="dailyForecast.map((day, index) => (index === 0 ? $t('today') : formatDay(day.time, index, locale)))"
                unit="h"
                color="bg-primary"
                :format-value="(value) => `${value.toFixed(1)}h`"
              />
              <p v-else class="text-sm text-muted">{{ $t('buildingWeek') }}</p>
            </UCard>
          </template>
        </UDashboardPanel>
      </UDashboardGroup>
    </div>
  </UApp>
</template>
