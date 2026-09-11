<script setup lang="ts">
import type { HourlyForecast as HourlyForecastItem } from '~/types/weather'
import { formatHour, weatherIcon, weatherLabel } from '~/utils/weather'

const { locale } = useI18n()

const props = defineProps<{
  forecast: HourlyForecastItem[]
  timezone: string | undefined
  isLoading: boolean
}>()

const visibleForecast = computed(() => props.forecast.slice(0, 6))
</script>

<template>
  <UCard data-testid="hourly-forecast-card" class="lg:h-full lg:min-h-[196px]" :ui="{ root: 'overflow-visible lg:overflow-hidden lg:h-full flex flex-col', body: 'flex-1 flex' }" :class="{ 'opacity-60': isLoading }">
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-highlighted">{{ $t('hourlyRhythm') }}</h2>
        <UBadge color="neutral" variant="subtle" size="sm">{{ $t('localTime', { value: timezone || '—' }) }}</UBadge>
      </div>
    </template>
    <div v-if="visibleForecast.length" class="grid w-full flex-1 grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-6 md:gap-0 md:divide-x md:divide-default">
      <UTooltip v-for="(hour, index) in visibleForecast" :key="hour.time" :text="`${weatherLabel(hour.code, locale)} · ${Math.round(hour.temperature)}° · ${$t('rain', { value: hour.precipitation })}`">
        <div class="flex h-full min-w-0 flex-col items-center justify-center gap-2 rounded-md px-1.5 py-2 text-center transition-colors hover:bg-elevated md:px-1">
          <UBadge v-if="index === 0" color="primary" variant="subtle" size="sm">{{ $t('now') }}</UBadge>
          <span v-else class="text-[10px] text-muted sm:text-xs">{{ formatHour(hour.time, locale) }}</span>
          <span class="text-2xl" aria-hidden="true">{{ weatherIcon(hour.code) }}</span>
          <strong class="text-base font-semibold text-highlighted sm:text-lg">{{ Math.round(hour.temperature) }}°</strong>
          <span class="text-[10px] text-muted sm:text-xs">{{ $t('rain', { value: hour.precipitation }) }}</span>
        </div>
      </UTooltip>
    </div>
    <div v-else class="grid flex-1 place-items-center text-sm text-muted">{{ $t('readingNextHours') }}</div>
  </UCard>
</template>
