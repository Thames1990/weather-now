<script setup lang="ts">
const props = defineProps<{
  values: number[]
  labels: string[]
  unit?: string
  color?: string
}>()

const gradientId = `line-chart-gradient-${useId()}`
const viewBoxWidth = 100
const viewBoxHeight = 36
const topPadding = 7 // reserve headroom so the always-visible value labels never clip above the chart

const min = computed(() => Math.min(...props.values, 0))
const max = computed(() => Math.max(...props.values, 1))
const range = computed(() => Math.max(max.value - min.value, 1))

const points = computed(() => props.values.map((value, index) => {
  const x = ((index + 0.5) / props.values.length) * viewBoxWidth
  const y = topPadding + (viewBoxHeight - topPadding) - ((value - min.value) / range.value) * (viewBoxHeight - topPadding)
  return { x, y, value }
}))

const linePath = computed(() => points.value.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' '))
const areaPath = computed(() => `${linePath.value} L ${points.value.at(-1)?.x ?? 0} ${viewBoxHeight} L ${points.value[0]?.x ?? 0} ${viewBoxHeight} Z`)
const summary = computed(() => `${Math.round(min.value)}${props.unit ?? ''} to ${Math.round(max.value)}${props.unit ?? ''} across ${props.values.length} readings`)

const activeIndex = ref<number | null>(null)
const active = computed(() => (activeIndex.value === null ? null : points.value[activeIndex.value]))
const activeLabel = computed(() => (activeIndex.value === null ? '' : props.labels[activeIndex.value]))

function updateActiveIndex(event: PointerEvent) {
  const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect()
  if (!rect.width || !points.value.length) return
  const fraction = (event.clientX - rect.left) / rect.width
  activeIndex.value = Math.min(points.value.length - 1, Math.max(0, Math.floor(fraction * points.value.length)))
}

function clearActiveIndex() {
  activeIndex.value = null
}

function labelStyle(point: { x: number, y: number }, index: number, tooltip = false) {
  const xOffset = tooltip && index === 0 ? '0%' : tooltip && index === points.value.length - 1 ? '-100%' : '-50%'
  return {
    left: `${point.x}%`,
    top: `${(point.y / viewBoxHeight) * 100}%`,
    transform: `translate(${xOffset}, calc(-100% - 10px))`
  }
}

function markerStyle(point: { x: number, y: number }, index: number) {
  const size = activeIndex.value === index ? '20px' : '12px'
  return {
    left: `${point.x}%`,
    top: `${(point.y / viewBoxHeight) * 100}%`,
    width: size,
    height: size,
    transform: 'translate(-50%, -50%)',
    backgroundColor: props.color || 'var(--ui-primary)',
    border: '1px solid var(--ui-bg)'
  }
}
</script>

<template>
  <div data-testid="line-chart-scroll" tabindex="0" role="group" :aria-label="summary" class="h-full min-h-0 w-full overflow-x-auto rounded-md focus-visible:outline-2 focus-visible:outline-primary">
    <div class="flex h-full min-h-0 w-full flex-col" :style="{ minWidth: `${values.length * 3.5}rem` }">
      <div class="relative min-h-0 flex-1">
        <div
          v-if="active"
          class="pointer-events-none absolute z-10 rounded-md bg-inverted px-2 py-1 text-xs font-medium whitespace-nowrap text-inverted shadow-sm"
          :style="labelStyle(active, activeIndex!, true)"
        >
          <span v-if="activeLabel">{{ activeLabel }} · </span>{{ Math.round(active.value) }}{{ unit }}
        </div>
        <span
          v-for="(point, index) in points"
          v-show="activeIndex !== index"
          :key="index"
          class="pointer-events-none absolute z-10 whitespace-nowrap text-[0.65rem] font-semibold text-highlighted"
          :style="labelStyle(point, index)"
        >
          {{ Math.round(point.value) }}{{ unit }}
        </span>
        <svg
          :viewBox="`0 0 ${viewBoxWidth} ${viewBoxHeight}`"
          preserveAspectRatio="none"
          class="absolute inset-0 h-full w-full cursor-crosshair overflow-visible"
          role="img"
          :aria-label="summary"
          @pointermove="updateActiveIndex"
          @pointerleave="clearActiveIndex"
        >
          <defs>
            <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" :stop-color="color || 'var(--ui-primary)'" stop-opacity="0.35" />
              <stop offset="100%" :stop-color="color || 'var(--ui-primary)'" stop-opacity="0" />
            </linearGradient>
          </defs>
          <path :d="areaPath" :fill="`url(#${gradientId})`" stroke="none" />
          <path :d="linePath" fill="none" :stroke="color || 'var(--ui-primary)'" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" />
          <line v-if="active" :x1="active.x" :x2="active.x" y1="0" :y2="viewBoxHeight" class="text-muted" stroke="currentColor" stroke-width="0.5" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />
        </svg>
        <span
          v-for="(point, index) in points"
          :key="index"
          data-testid="line-chart-marker"
          aria-hidden="true"
          class="pointer-events-none absolute z-0 box-border rounded-full"
          :style="markerStyle(point, index)"
        />
      </div>
      <div class="mt-2 flex shrink-0 text-xs text-muted">
        <span v-for="(label, index) in labels" :key="index" data-testid="line-chart-label" class="min-w-0 flex-1 text-center whitespace-nowrap">{{ label }}</span>
      </div>
    </div>
  </div>
</template>
