<script setup lang="ts">
import type { HourlyForecast, WeatherResponse } from '~/types/weather'
import type { ClothingGender } from '~/utils/clothing'
import { clothingRecommendation } from '~/utils/clothing'

const emit = defineEmits<{
  'update:gender': [gender: ClothingGender]
}>()

const { t } = useI18n()
const genderOptions = computed<Array<{ label: string; value: ClothingGender }>>(() => [
  { label: t('neutral'), value: 'neutral' },
  { label: t('feminine'), value: 'feminine' },
  { label: t('masculine'), value: 'masculine' }
])

const props = defineProps<{
  current: WeatherResponse['current'] | undefined
  hourly: HourlyForecast[]
  gender: ClothingGender
}>()
const recommendation = computed(() => clothingRecommendation(props.current, props.hourly, props.gender))
const badgeColor = computed(() => recommendation.value.accent === 'wet' ? 'info' : recommendation.value.accent === 'warm' ? 'warning' : 'primary')
const badgeLabel = computed(() => recommendation.value.accent === 'wet' ? t('rainReady') : recommendation.value.accent === 'warm' ? t('breatheEasy') : recommendation.value.accent === 'wind' ? t('wind') : t('layerUp'))
</script>

<template>
  <UCard data-testid="clothing-card" class="lg:h-full lg:min-h-[196px]" :ui="{ root: 'overflow-visible lg:h-full flex flex-col', body: 'flex-1 flex flex-col justify-center gap-3' }">
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-highlighted">{{ $t('dressForDay') }}</h2>
        <USelect
          :model-value="gender"
          :items="genderOptions"
          value-key="value"
          size="sm"
          class="w-32"
          :aria-label="$t('chooseClothingPreference')"
          @update:model-value="emit('update:gender', $event)"
        />
      </div>
    </template>

    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <UBadge :color="badgeColor" variant="subtle">{{ badgeLabel }}</UBadge>
        <h3 class="mt-2 font-semibold text-highlighted">{{ $t(recommendation.title) }}</h3>
        <p class="mt-1 text-sm text-muted">{{ $t(recommendation.description) }}</p>
      </div>
      <span class="shrink-0 text-4xl" aria-hidden="true">{{ recommendation.pieces[0]?.icon }}</span>
    </div>

    <p v-if="recommendation.forecast" class="text-xs text-muted">
      {{ $t('wearForecastSummary', recommendation.forecast) }}
    </p>

    <div class="grid gap-2 border-t border-default pt-3 sm:grid-cols-3">
      <div v-for="piece in recommendation.pieces" :key="piece.label" class="flex min-w-0 items-start gap-2 rounded-lg bg-elevated px-2 py-1.5 text-xs text-muted transition-colors hover:bg-primary/10 hover:text-highlighted">
        <span class="shrink-0 text-lg" aria-hidden="true">{{ piece.icon }}</span>
        <span class="min-w-0 whitespace-normal break-words leading-snug">{{ $t(piece.label) }}</span>
      </div>
    </div>
  </UCard>
</template>
