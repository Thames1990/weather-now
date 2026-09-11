<script setup lang="ts">
import type { WeatherResponse } from '~/types/weather'
import { formatHour, windDirection } from '~/utils/weather'

const { locale } = useI18n()

defineProps<{
  current: WeatherResponse['current'] | undefined
  sunrise: string | undefined
  sunset: string | undefined
}>()
</script>

<template>
  <UCard class="h-full" :ui="{ root: 'h-full flex flex-col', body: 'flex-1 flex flex-col justify-center' }">
    <template #header>
      <h2 class="text-lg font-semibold text-highlighted">{{ $t('outsideReally') }}</h2>
    </template>
    <div class="divide-y divide-default">
      <UTooltip :text="$t('feelsLikeTooltip')">
        <div class="grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 transition-colors first:pt-0 last:pb-0 hover:bg-elevated">
          <UIcon name="i-lucide-thermometer" class="size-5 text-primary" />
          <span class="text-sm text-muted">{{ $t('feelsLikeLabel') }}</span>
          <strong class="whitespace-nowrap">{{ current ? Math.round(current.apparent_temperature) : '--' }}<small class="font-normal text-muted">°</small></strong>
        </div>
      </UTooltip>
      <UTooltip :text="$t('humidityTooltip')">
        <div class="grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-elevated">
          <UIcon name="i-lucide-droplets" class="size-5 text-primary" />
          <span class="text-sm text-muted">{{ $t('humidityLabel') }}</span>
          <strong class="whitespace-nowrap">{{ current ? Math.round(current.relative_humidity_2m) : '--' }}<small class="font-normal text-muted">%</small></strong>
        </div>
      </UTooltip>
      <UTooltip :text="$t('windTooltip')">
        <div class="grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-elevated">
          <UIcon name="i-lucide-wind" class="size-5 text-primary" />
          <span class="text-sm text-muted">{{ $t('wind') }}</span>
          <strong class="whitespace-nowrap">{{ current ? Math.round(current.wind_speed_10m) : '--' }} <small class="font-normal text-muted">km/h {{ current ? windDirection(current.wind_direction_10m) : '' }}</small></strong>
        </div>
      </UTooltip>
      <UTooltip :text="$t('precipitationTooltip')">
        <div class="grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-elevated">
          <UIcon name="i-lucide-cloud-rain" class="size-5 text-primary" />
          <span class="text-sm text-muted">{{ $t('precipitation') }}</span>
          <strong class="whitespace-nowrap">{{ current ? current.precipitation : '--' }} <small class="font-normal text-muted">{{ $t('millimetersToday') }}</small></strong>
        </div>
      </UTooltip>
      <UTooltip :text="$t('sunriseTooltip')">
        <div class="grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-elevated">
          <UIcon name="i-lucide-sunrise" class="size-5 text-primary" />
          <span class="text-sm text-muted">{{ $t('sunriseLabel') }}</span>
          <strong class="whitespace-nowrap">{{ sunrise ? formatHour(sunrise, locale) : '--' }}</strong>
        </div>
      </UTooltip>
      <UTooltip :text="$t('sunsetTooltip')">
        <div class="grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 transition-colors last:pb-0 hover:bg-elevated">
          <UIcon name="i-lucide-sunset" class="size-5 text-primary" />
          <span class="text-sm text-muted">{{ $t('sunsetLabel') }}</span>
          <strong class="whitespace-nowrap">{{ sunset ? formatHour(sunset, locale) : '--' }}</strong>
        </div>
      </UTooltip>
    </div>
  </UCard>
</template>
