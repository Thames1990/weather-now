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
function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

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
    <UDashboardGroup>
      <UDashboardPanel :ui="{ body: 'flex flex-col gap-3 overflow-y-auto p-3 md:grid md:grid-cols-12 md:grid-rows-6 md:gap-3 md:overflow-hidden md:p-3' }">
        <template #header>
          <UDashboardNavbar :title="$t('brand')" icon="i-lucide-cloud-sun" :toggle="false">
            <template #right>
              <WeatherSearch
                class="w-64"
                :query="query"
                :results="searchResults"
                :is-searching="isSearching"
                @update:query="query = $event"
                @select="chooseLocation"
              />
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
              <USelect v-model="locale" :items="languageOptions" value-key="value" size="sm" class="w-16" :aria-label="$t('language')" />
              <UButton
                :icon="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'"
                color="neutral"
                variant="ghost"
                :aria-label="$t('toggleTheme')"
                @click="toggleColorMode"
              />
            </template>
          </UDashboardNavbar>
        </template>

        <template #body>
          <CurrentWeatherPanel
            class="col-span-12 row-span-2 md:col-span-4"
            :location="selectedLocation"
            :current="current"
            :condition="currentCondition"
            :icon="currentIcon"
            :effect="currentEffect"
            :is-loading="isLoading"
            :error-message="errorMessage"
            @retry="fetchWeather(selectedLocation)"
          />
          <ClothingRecommendation class="col-span-12 row-span-2 md:col-span-5" :current="current" :gender="clothingGender" @update:gender="updateClothingGender" />
          <WeatherDetails class="col-span-12 row-span-2 md:col-span-3" :current="current" :sunrise="weather?.daily.sunrise[0]" :sunset="weather?.daily.sunset[0]" />

          <HourlyForecast class="col-span-12 row-span-2 md:col-span-5" :forecast="hourlyForecast" :timezone="weather?.timezone" :is-loading="isLoading" />
          <DailyForecast class="col-span-12 row-span-2 md:col-span-7" :forecast="dailyForecast" :sunrise="weather?.daily.sunrise[0]" />

          <UCard class="col-span-12 row-span-2 md:col-span-4" :ui="{ root: 'h-full flex flex-col', body: 'flex-1 min-h-0' }">
            <template #header>
              <h2 class="text-lg font-semibold text-highlighted">{{ $t('temperatureTrend') }}</h2>
            </template>
            <LineChart v-if="hourlyForecast.length" :values="hourlyForecast.slice(0, 8).map((hour) => hour.temperature)" :labels="hourlyForecast.slice(0, 8).map((hour, index) => (index === 0 ? $t('now') : formatHour(hour.time, locale)))" unit="°" color="var(--ui-primary)" />
            <p v-else class="text-sm text-muted">{{ $t('readingNextHours') }}</p>
          </UCard>

          <UCard class="col-span-12 row-span-2 md:col-span-4" :ui="{ root: 'h-full flex flex-col', body: 'flex-1 min-h-0' }">
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

          <UCard class="col-span-12 row-span-2 md:col-span-4" :ui="{ root: 'h-full flex flex-col', body: 'flex-1 min-h-0' }">
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
  </UApp>
</template>
