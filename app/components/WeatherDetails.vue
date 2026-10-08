<script setup lang="ts">
import type { WeatherResponse } from '~/types/weather'
import { formatHour, windDirection } from '~/utils/weather'

const { locale } = useI18n()
const isReady = useAppReady()

defineProps<{
  current: WeatherResponse['current'] | undefined
  timezone: string | undefined
  sunrise: string | undefined
  sunset: string | undefined
}>()
</script>

<template>
  <UCard data-testid="weather-details-card" class="dashboard:min-h-[196px]" :ui="{ root: 'overflow-visible flex flex-col', body: 'flex-1 flex flex-col justify-center' }">
    <template #header>
      <h2 class="text-lg font-semibold text-highlighted">
        <span v-if="isReady" class="wn-fade-in">{{ $t('outsideReally') }}</span>
        <USkeleton v-else as="span" class="my-1 block h-5 w-40" />
      </h2>
    </template>
    <div v-if="!isReady" class="flex h-full flex-col divide-y divide-default" aria-hidden="true">
      <div v-for="index in 6" :key="index" data-testid="weather-detail-row" class="grid flex-1 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-2 py-1.5">
        <USkeleton class="size-5 rounded-full" />
        <USkeleton class="h-3.5 w-24" />
        <USkeleton class="h-4 w-12" />
      </div>
    </div>
    <div v-else class="flex h-full flex-col divide-y divide-default">
      <UTooltip class="flex flex-1" :text="$t('feelsLikeTooltip')">
        <div data-testid="weather-detail-row" class="grid flex-1 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-elevated">
          <UIcon name="i-lucide-thermometer" class="size-5 text-primary" />
          <span class="text-sm text-muted">{{ $t('feelsLikeLabel') }}</span>
          <strong v-if="current" class="wn-fade-in text-right whitespace-nowrap">{{ Math.round(current.apparent_temperature) }}<small class="font-normal text-muted">°</small></strong>
          <USkeleton v-else class="h-4 w-12" />
        </div>
      </UTooltip>
      <UTooltip class="flex flex-1" :text="$t('humidityTooltip')">
        <div data-testid="weather-detail-row" class="grid flex-1 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-elevated">
          <UIcon name="i-lucide-droplets" class="size-5 text-primary" />
          <span class="text-sm text-muted">{{ $t('humidityLabel') }}</span>
          <strong v-if="current" class="wn-fade-in text-right whitespace-nowrap">{{ Math.round(current.relative_humidity_2m) }}<small class="font-normal text-muted">%</small></strong>
          <USkeleton v-else class="h-4 w-12" />
        </div>
      </UTooltip>
      <UTooltip class="flex flex-1" :text="$t('windTooltip')">
        <div data-testid="weather-detail-row" class="grid flex-1 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-elevated">
          <UIcon name="i-lucide-wind" class="size-5 text-primary" />
          <span class="text-sm text-muted">{{ $t('wind') }}</span>
          <strong v-if="current" class="wn-fade-in text-right whitespace-nowrap">{{ Math.round(current.wind_speed_10m) }} <small class="font-normal text-muted">km/h {{ windDirection(current.wind_direction_10m) }}</small></strong>
          <USkeleton v-else class="h-4 w-16" />
        </div>
      </UTooltip>
      <UTooltip class="flex flex-1" :text="$t('precipitationTooltip')">
        <div data-testid="weather-detail-row" class="grid flex-1 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-elevated">
          <UIcon name="i-lucide-cloud-rain" class="size-5 text-primary" />
          <span class="text-sm text-muted">{{ $t('precipitation') }}</span>
          <strong v-if="current" class="wn-fade-in text-right whitespace-nowrap">{{ current.precipitation }} <small class="font-normal text-muted">{{ $t('millimetersToday') }}</small></strong>
          <USkeleton v-else class="h-4 w-16" />
        </div>
      </UTooltip>
      <UTooltip class="flex flex-1" :text="$t('sunriseTooltip')">
        <div data-testid="weather-detail-row" class="grid flex-1 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-elevated">
          <UIcon name="i-lucide-sunrise" class="size-5 text-primary" />
          <span class="text-sm text-muted">{{ $t('sunriseLabel') }}</span>
          <strong v-if="sunrise" class="wn-fade-in text-right whitespace-nowrap">{{ formatHour(sunrise, locale, timezone) }}</strong>
          <USkeleton v-else class="h-4 w-12" />
        </div>
      </UTooltip>
      <UTooltip class="flex flex-1" :text="$t('sunsetTooltip')">
        <div data-testid="weather-detail-row" class="grid flex-1 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-elevated">
          <UIcon name="i-lucide-sunset" class="size-5 text-primary" />
          <span class="text-sm text-muted">{{ $t('sunsetLabel') }}</span>
          <strong v-if="sunset" class="wn-fade-in text-right whitespace-nowrap">{{ formatHour(sunset, locale, timezone) }}</strong>
          <USkeleton v-else class="h-4 w-12" />
        </div>
      </UTooltip>
    </div>
  </UCard>
</template>
