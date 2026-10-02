<script setup lang="ts">
import type { HourlyForecast as HourlyForecastItem } from '~/types/weather'
import { weatherIcon, weatherLabel } from '~/utils/weather'

const { locale } = useI18n()
const isReady = useAppReady()

const props = defineProps<{
  forecast: HourlyForecastItem[]
  labels: string[]
  timezone: string | undefined
  isRefreshing: boolean
}>()

const visibleForecast = computed(() => props.forecast.slice(0, 6))
</script>

<template>
  <UCard data-testid="hourly-forecast-card" class="lg:h-full lg:min-h-[196px]" :ui="{ root: 'overflow-visible lg:overflow-hidden lg:h-full flex flex-col', body: 'flex-1 flex' }">
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-highlighted">
          <span v-if="isReady" class="wn-fade-in">{{ $t('hourlyRhythm') }}</span>
          <USkeleton v-else as="span" class="my-1 block h-5 w-40" />
        </h2>
        <UBadge v-if="isReady && timezone" class="wn-fade-in" color="neutral" variant="subtle" size="sm">{{ $t('localTime', { value: timezone }) }}</UBadge>
        <USkeleton v-else class="h-5 w-32 rounded-md" />
      </div>
    </template>
    <div v-if="isReady && visibleForecast.length" class="grid w-full flex-1 grid-cols-2 gap-1.5 transition-opacity duration-300 sm:grid-cols-3 md:grid-cols-6 md:gap-0 md:divide-x md:divide-default" :class="{ 'opacity-60': isRefreshing }">
      <UTooltip v-for="(hour, index) in visibleForecast" :key="hour.time" :text="`${weatherLabel(hour.code, locale)} · ${Math.round(hour.temperature)}° · ${$t('rain', { value: hour.precipitation })}`">
        <div class="wn-fade-in flex h-full min-w-0 flex-col items-center justify-center gap-2 rounded-md px-1.5 py-2 text-center transition-colors hover:bg-elevated md:px-1">
          <UBadge v-if="hour.isNow" color="primary" variant="subtle" size="sm">{{ labels[index] }}</UBadge>
          <span v-else class="text-[10px] text-muted sm:text-xs">{{ labels[index] }}</span>
          <span class="text-2xl" aria-hidden="true">{{ weatherIcon(hour.code) }}</span>
          <strong class="text-base font-semibold text-highlighted sm:text-lg">{{ Math.round(hour.temperature) }}°</strong>
          <span class="text-[10px] text-muted sm:text-xs">{{ $t('rain', { value: hour.precipitation }) }}</span>
        </div>
      </UTooltip>
    </div>
    <div v-else class="grid w-full flex-1 grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-6 md:gap-0 md:divide-x md:divide-default" aria-hidden="true">
      <div v-for="index in 6" :key="index" class="flex h-full min-w-0 flex-col items-center justify-center gap-2 px-1.5 py-2 md:px-1">
        <USkeleton class="h-3 w-10" />
        <USkeleton class="size-7 rounded-full" />
        <USkeleton class="h-5 w-8" />
        <USkeleton class="h-3 w-12" />
      </div>
    </div>
  </UCard>
</template>
