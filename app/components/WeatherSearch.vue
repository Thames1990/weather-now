<script setup lang="ts">
import type { LocationResult } from '~/types/weather'

const props = defineProps<{
  query: string
  results: LocationResult[]
  isSearching: boolean
  hasSearched: boolean
  errorMessage: string
}>()

const emit = defineEmits<{
  'update:query': [value: string]
  select: [location: LocationResult]
  retry: []
}>()

const isReady = useAppReady()

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
  <div class="min-w-0">
    <UInputMenu
      v-model:open="menuOpen"
      :search-term="query"
      :items="items"
      :loading="isSearching"
      ignore-filter
      icon="i-lucide-search"
      :placeholder="isReady ? $t('searchPlaceholder') : ''"
      :aria-label="$t('searchPlaceholder')"
      @update:search-term="emit('update:query', $event)"
      @update:model-value="onSelect"
    />
    <div v-if="errorMessage" class="flex items-center justify-between gap-2 px-1 pt-1 text-xs text-error" role="alert">
      <span>{{ $t(errorMessage) }}</span>
      <UButton color="error" variant="link" size="xs" @click="emit('retry')">
        {{ $t('retrySearch') }}
      </UButton>
    </div>
    <p v-else-if="hasSearched && query.trim().length >= 2 && !results.length" class="px-1 pt-1 text-xs text-muted" role="status">
      {{ $t('noLocationsFound') }}
    </p>
  </div>
</template>
