<script setup lang="ts">
import { h } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { DailyForecast as DailyForecastItem } from '~/types/weather'
import { formatDay, formatHour, weatherIcon, weatherLabel } from '~/utils/weather'

const { locale, t } = useI18n()
const isReady = useAppReady()

const props = defineProps<{
  forecast: DailyForecastItem[]
  sunrise: string | undefined
  timezone: string | undefined
}>()

type Row = {
  day: string
  icon: string
  condition: string
  rain: string
  range: string
}

const rows = computed<Row[]>(() => props.forecast.map((day, index) => ({
  day: index === 0 ? t('today') : formatDay(day.time, index, locale.value),
  icon: weatherIcon(day.code),
  condition: weatherLabel(day.code, locale.value),
  rain: t('rain', { value: day.precipitation }),
  range: `${Math.round(day.high)}° / ${Math.round(day.low)}°`
})))

const columns = computed<TableColumn<Row>[]>(() => [
  { accessorKey: 'day', header: t('day') },
  { accessorKey: 'icon', header: '', cell: ({ row }) => h('span', { class: 'text-xl' }, row.original.icon) },
  { accessorKey: 'condition', header: t('condition') },
  { accessorKey: 'rain', header: t('rainHeader') },
  { accessorKey: 'range', header: t('highLow') }
])
</script>

<template>
  <UCard data-testid="daily-forecast-card" class="lg:h-full lg:min-h-[196px]" :ui="{ root: 'overflow-visible lg:overflow-hidden lg:h-full flex flex-col', body: 'flex-1 overflow-x-auto' }">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-highlighted">
          <span v-if="isReady" class="wn-fade-in">{{ $t('sevenDayOutlook') }}</span>
          <USkeleton v-else as="span" class="my-1 block h-5 w-40" />
        </h2>
        <UBadge v-if="isReady && sunrise" class="wn-fade-in" color="neutral" variant="subtle" size="sm" icon="i-lucide-sunrise">{{ $t('sunrise', { value: formatHour(sunrise, locale, timezone) }) }}</UBadge>
        <USkeleton v-else class="h-5 w-28 rounded-md" />
      </div>
    </template>
    <UTable v-if="isReady && rows.length" data-testid="daily-forecast-table" :data="rows" :columns="columns" class="wn-fade-in h-full min-w-[420px]" :ui="{ base: 'h-full [&_tbody_tr]:h-[calc(100%/7)]', tbody: 'h-full', th: 'py-1.5 px-3 text-xs sm:text-sm', td: 'py-1 px-3 text-xs sm:text-sm', tr: 'hover:bg-elevated transition-colors' }" />
    <div v-else class="flex h-full min-w-[420px] flex-col divide-y divide-default" aria-hidden="true">
      <div v-for="index in 8" :key="index" class="grid flex-1 grid-cols-[3fr_2fr_5fr_5fr_4.5fr] items-center gap-3 px-3">
        <USkeleton class="h-3.5 w-14" />
        <USkeleton v-if="index > 1" class="size-5 rounded-full" />
        <span v-else />
        <USkeleton class="h-3.5 w-24" />
        <USkeleton class="h-3.5 w-12" />
        <USkeleton class="h-3.5 w-16" />
      </div>
    </div>
  </UCard>
</template>
