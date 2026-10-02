<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'line' | 'bar'
  bars?: number
}>(), {
  variant: 'bar',
  bars: 6
})

const barHeights = ['45%', '70%', '35%', '80%', '55%', '65%', '40%', '75%']
</script>

<template>
  <div class="flex h-full min-h-24 w-full flex-col gap-2" aria-hidden="true">
    <USkeleton v-if="variant === 'line'" class="min-h-0 w-full flex-1 rounded-md" />
    <div v-else class="flex min-h-0 w-full flex-1 items-end gap-1.5 sm:gap-2">
      <USkeleton v-for="index in bars" :key="index" class="min-w-0 flex-1 rounded-md" :style="{ height: barHeights[(index - 1) % barHeights.length] }" />
    </div>
    <div class="flex shrink-0 justify-between gap-2">
      <USkeleton v-for="index in variant === 'line' ? 4 : bars" :key="index" class="h-3 w-8" />
    </div>
  </div>
</template>
