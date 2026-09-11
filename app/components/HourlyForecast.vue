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
  <UCard class="h-full" :ui="{ root: 'h-full flex flex-col', body: 'flex-1 flex' }" :class="{ 'opacity-60': isLoading }">
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-highlighted">{{ $t('hourlyRhythm') }}</h2>
        <UBadge color="neutral" variant="subtle" size="sm">{{ $t('localTime', { value: timezone || '—' }) }}</UBadge>
      </div>
    </template>
    <div v-if="visibleForecast.length" class="grid w-full flex-1 grid-cols-6 divide-x divide-default">
      <UTooltip v-for="(hour, index) in visibleForecast" :key="hour.time" :text="`${weatherLabel(hour.code, locale)} · ${Math.round(hour.temperature)}° · ${$t('rain', { value: hour.precipitation })}`">
        <div class="flex h-full flex-col items-center justify-center gap-2 rounded-md px-1 transition-colors hover:bg-elevated">
          <UBadge v-if="index === 0" color="primary" variant="subtle" size="sm">{{ $t('now') }}</UBadge>
          <span v-else class="text-xs text-muted">{{ formatHour(hour.time, locale) }}</span>
          <span class="text-2xl" aria-hidden="true">{{ weatherIcon(hour.code) }}</span>
          <strong class="text-lg font-semibold text-highlighted">{{ Math.round(hour.temperature) }}°</strong>
          <span class="whitespace-nowrap text-xs text-muted">{{ $t('rain', { value: hour.precipitation }) }}</span>
        </div>
      </UTooltip>
    </div>
    <div v-else class="grid flex-1 place-items-center text-sm text-muted">{{ $t('readingNextHours') }}</div>
  </UCard>
</template>
