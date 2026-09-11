<script setup lang="ts">
import type { LocationResult, WeatherResponse } from '~/types/weather'
import { formatHour } from '~/utils/weather'
import { CURRENT_LOCATION_FALLBACK_NAME, LOADING_LOCATION_NAME, LOCATING_LOCATION_NAME } from '~/composables/useWeather'

const { locale, t } = useI18n()

const props = defineProps<{
  location: LocationResult
  current: WeatherResponse['current'] | undefined
  condition: string
  icon: string
  effect: string
  isLoading: boolean
  errorMessage: string
}>()

const placeholderLabels: Record<string, string> = {
  [LOADING_LOCATION_NAME]: 'checkingYourLocation',
  [LOCATING_LOCATION_NAME]: 'locatingYou',
  [CURRENT_LOCATION_FALLBACK_NAME]: 'currentLocationFallback'
}
const displayName = computed(() => {
  const key = placeholderLabels[props.location.name]
  return key ? t(key) : props.location.name
})

const insightKey = computed(() => {
  switch (props.effect) {
    case 'clear': return 'insightClear'
    case 'rain': return 'insightRain'
    case 'storm': return 'insightStorm'
    case 'snow': return 'insightSnow'
    case 'wind': return 'insightWind'
    default: return 'insightClouds'
  }
})

defineEmits<{
  retry: []
}>()
</script>

<template>
  <UCard data-testid="current-weather-card" class="lg:h-full lg:min-h-[196px]" :ui="{ root: 'overflow-visible lg:overflow-hidden lg:h-full flex flex-col', body: 'flex-1 flex flex-col justify-center', footer: 'shrink-0' }">
    <template #header>
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs font-medium uppercase tracking-wide text-muted">{{ $t('nowIn') }}</p>
          <h2 class="truncate text-lg font-semibold text-highlighted">{{ displayName }}</h2>
          <p class="text-xs text-muted">{{ location.country || $t('yourCoordinates') }}</p>
        </div>
        <span class="text-4xl" aria-hidden="true">{{ icon }}</span>
      </div>
    </template>

    <UAlert v-if="errorMessage" color="error" variant="soft" :title="$t('forecastUnavailable')" :description="$t(errorMessage)">
      <template #actions>
        <UButton color="error" variant="outline" size="sm" @click="$emit('retry')">{{ $t('tryAgain') }}</UButton>
      </template>
    </UAlert>
    <div v-else class="flex items-end gap-3">
      <UTooltip :text="$t('feelsLikeTooltip')">
        <span class="cursor-default text-6xl font-bold text-highlighted">{{ current ? Math.round(current.temperature_2m) : '--' }}°</span>
      </UTooltip>
      <div class="pb-1">
        <p class="font-medium text-highlighted">{{ condition }}</p>
        <p class="text-sm text-muted">{{ $t('feelsLike', { value: current ? Math.round(current.apparent_temperature) : '--' }) }}</p>
      </div>
    </div>

    <template #footer>
      <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>{{ isLoading ? $t('refreshingConditions') : $t('updated', { value: current ? formatHour(current.time, locale) : $t('now') }) }}</span>
        <UTooltip :text="$t('humidityTooltip')">
          <UBadge color="neutral" variant="subtle" size="sm" class="cursor-default">{{ current ? $t('humidity', { value: current.relative_humidity_2m }) : $t('readingConditions') }}</UBadge>
        </UTooltip>
      </div>
      <UAlert v-if="!errorMessage" class="mt-3" color="primary" variant="subtle" icon="i-lucide-sparkles" :description="$t(insightKey)" />
    </template>
  </UCard>
</template>
