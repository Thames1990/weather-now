<script setup lang="ts">
import { h } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { DailyForecast as DailyForecastItem } from '~/types/weather'
import { formatDay, formatHour, weatherIcon, weatherLabel } from '~/utils/weather'

const { locale, t } = useI18n()

const props = defineProps<{
  forecast: DailyForecastItem[]
  sunrise: string | undefined
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
  <UCard class="h-full" :ui="{ root: 'h-full flex flex-col', body: 'flex-1 overflow-hidden' }">
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-highlighted">{{ $t('sevenDayOutlook') }}</h2>
        <UBadge color="neutral" variant="subtle" size="sm" icon="i-lucide-sunrise">{{ $t('sunrise', { value: sunrise ? formatHour(sunrise, locale) : '—' }) }}</UBadge>
      </div>
    </template>
    <UTable :data="rows" :columns="columns" :empty="$t('buildingWeek')" class="h-full" :ui="{ th: 'py-1.5 px-3', td: 'py-1 px-3', tr: 'hover:bg-elevated transition-colors' }" />
  </UCard>
</template>
