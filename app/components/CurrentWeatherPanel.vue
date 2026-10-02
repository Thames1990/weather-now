<script setup lang="ts">
import type { LocationResult, WeatherResponse } from '~/types/weather'
import { formatHour } from '~/utils/weather'
import { CURRENT_LOCATION_FALLBACK_NAME, LOADING_LOCATION_NAME, LOCATING_LOCATION_NAME } from '~/composables/useWeather'

const { locale, t } = useI18n()

const props = defineProps<{
  location: LocationResult
  current: WeatherResponse['current'] | undefined
  timezone: string | undefined
  condition: string
  icon: string
  effect: string
  isRefreshing: boolean
  errorMessage: string
}>()

const isReady = useAppReady()
const showSkeleton = computed(() => !isReady.value || (!props.current && !props.errorMessage))

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
      <div v-if="showSkeleton" class="flex items-start justify-between gap-3" aria-hidden="true">
        <div class="min-w-0 space-y-1.5">
          <USkeleton class="h-3 w-12" />
          <USkeleton class="h-6 w-40" />
          <USkeleton class="h-3 w-24" />
        </div>
        <USkeleton class="size-10 rounded-full" />
      </div>
      <div v-else class="flex items-start justify-between gap-3 transition-opacity duration-300" :class="{ 'opacity-60': isRefreshing }">
        <div class="min-w-0">
          <p class="text-xs font-medium uppercase tracking-wide text-muted">{{ $t('nowIn') }}</p>
          <h2 :key="displayName" class="wn-fade-in truncate text-lg font-semibold text-highlighted">{{ displayName }}</h2>
          <p class="text-xs text-muted">{{ location.country || $t('yourCoordinates') }}</p>
        </div>
        <span v-if="current" :key="icon" class="wn-fade-in text-4xl" aria-hidden="true">{{ icon }}</span>
      </div>
    </template>

    <div v-if="showSkeleton" class="flex items-end gap-3" aria-hidden="true">
      <USkeleton class="h-14 w-24" />
      <div class="space-y-2 pb-1">
        <USkeleton class="h-4 w-28" />
        <USkeleton class="h-3.5 w-20" />
      </div>
    </div>
    <UAlert v-else-if="errorMessage" class="wn-fade-in" color="error" variant="soft" :title="$t('forecastUnavailable')" :description="$t(errorMessage)">
      <template #actions>
        <UButton color="error" variant="outline" size="sm" @click="$emit('retry')">{{ $t('tryAgain') }}</UButton>
      </template>
    </UAlert>
    <div v-else-if="current" class="wn-fade-in flex items-end gap-3 transition-opacity duration-300" :class="{ 'opacity-60': isRefreshing }">
      <UTooltip :text="$t('feelsLikeTooltip')">
        <span class="cursor-default text-6xl font-bold text-highlighted">{{ Math.round(current.temperature_2m) }}°</span>
      </UTooltip>
      <div class="pb-1">
        <p class="font-medium text-highlighted">{{ condition }}</p>
        <p class="text-sm text-muted">{{ $t('feelsLike', { value: Math.round(current.apparent_temperature) }) }}</p>
      </div>
    </div>

    <template v-if="showSkeleton || current" #footer>
      <div v-if="showSkeleton" aria-hidden="true">
        <div class="flex items-center justify-between gap-2">
          <USkeleton class="h-3 w-28" />
          <USkeleton class="h-5 w-24 rounded-md" />
        </div>
        <USkeleton class="mt-3 h-12 w-full rounded-lg" />
      </div>
      <template v-else-if="current">
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>{{ isRefreshing ? $t('refreshingConditions') : $t('updated', { value: formatHour(current.time, locale, timezone) }) }}</span>
          <UTooltip :text="$t('humidityTooltip')">
            <UBadge color="neutral" variant="subtle" size="sm" class="cursor-default">{{ $t('humidity', { value: current.relative_humidity_2m }) }}</UBadge>
          </UTooltip>
        </div>
        <UAlert v-if="!errorMessage" :key="insightKey" class="wn-fade-in mt-3" color="primary" variant="subtle" icon="i-lucide-sparkles" :description="$t(insightKey)" />
      </template>
    </template>
  </UCard>
</template>
