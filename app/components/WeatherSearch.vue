<script setup lang="ts">
import type { LocationResult } from '~/types/weather'

const props = defineProps<{
  query: string
  results: LocationResult[]
  isSearching: boolean
}>()

const emit = defineEmits<{
  'update:query': [value: string]
  select: [location: LocationResult]
}>()

const items = computed(() => props.results.map((result) => ({
  label: result.name,
  description: [result.admin1, result.country].filter(Boolean).join(', '),
  location: result
})))

// only pop the menu open once there's an actual query, so focusing an empty box never shows a bare "no data" state
const menuOpen = ref(false)
watch(() => props.query, (query) => {
  menuOpen.value = query.trim().length >= 2
})

function onSelect(item: { location: LocationResult } | null) {
  if (item) emit('select', item.location)
}
</script>

<template>
  <UInputMenu
    v-model:open="menuOpen"
    :search-term="query"
    :items="items"
    :loading="isSearching"
    ignore-filter
    icon="i-lucide-search"
    :placeholder="$t('searchPlaceholder')"
    :aria-label="$t('searchPlaceholder')"
    @update:search-term="emit('update:query', $event)"
    @update:model-value="onSelect"
  />
</template>
