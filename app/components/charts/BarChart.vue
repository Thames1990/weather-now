<script setup lang="ts">
const props = defineProps<{
  values: number[]
  labels: string[]
  unit?: string
  color?: string
  formatValue?: (value: number) => string
}>()

const max = computed(() => Math.max(...props.values, 1))
const summary = computed(() => `${Math.round(Math.min(...props.values, 0))} to ${Math.round(max.value)}${props.unit ?? ''} across ${props.values.length} readings`)

const activeIndex = ref<number | null>(null)

function barHeight(value: number) {
  return `${Math.max((value / max.value) * 100, value > 0 ? 6 : 0)}%`
}

function displayValue(value: number) {
  return props.formatValue ? props.formatValue(value) : `${Math.round(value)}${props.unit ?? ''}`
}
</script>

<template>
  <div class="flex h-full min-h-0 w-full items-end gap-1.5 sm:gap-2" role="img" :aria-label="summary">
    <div
      v-for="(value, index) in values"
      :key="index"
      tabindex="0"
      class="flex h-full min-w-0 flex-1 cursor-default flex-col items-center gap-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary"
      @mouseenter="activeIndex = index"
      @mouseleave="activeIndex = null"
      @focus="activeIndex = index"
      @blur="activeIndex = null"
    >
      <span class="whitespace-nowrap text-[0.65rem] sm:text-xs" :class="activeIndex === index ? 'font-semibold text-highlighted' : 'font-medium text-muted'">{{ displayValue(value) }}</span>
      <div class="flex w-full min-h-0 flex-1 items-end overflow-hidden rounded-md bg-elevated">
        <div
          class="w-full rounded-t-md transition-[height,opacity]"
          :class="[color || 'bg-primary', activeIndex === index ? 'opacity-100' : 'opacity-70']"
          :style="{ height: barHeight(value) }"
        />
      </div>
      <span class="whitespace-nowrap text-[0.65rem] sm:text-xs" :class="activeIndex === index ? 'font-semibold text-highlighted' : 'text-muted'">{{ labels[index] }}</span>
    </div>
  </div>
</template>
