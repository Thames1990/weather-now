<script setup lang="ts">
import { nextTick, useTemplateRef, type ComponentPublicInstance } from 'vue'
import type { LocationResult } from '~/types/weather'

type InputMenuInstance = ComponentPublicInstance & { inputRef: HTMLInputElement | undefined }

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
  clear: []
}>()

const isReady = useAppReady()
const inputMenu = useTemplateRef<InputMenuInstance>('inputMenu')
const searchTerm = ref(props.query)
const inputMenuKey = ref(0)

const items = computed(() => props.results.map((result) => ({
  label: result.name,
  description: [result.admin1, result.country].filter(Boolean).join(', '),
  location: result
})))

// only pop the menu open once there's an actual query, so focusing an empty box never shows a bare "no data" state
const menuOpen = ref(false)
watch(() => props.query, (query) => {
  searchTerm.value = query
  menuOpen.value = query.trim().length >= 2
  if (!query) inputMenuKey.value++
})

function onSelect(item: { location: LocationResult } | null) {
  if (item) emit('select', item.location)
}

function clearSearch() {
  menuOpen.value = false
  searchTerm.value = ''
  emit('clear')
  nextTick(() => inputMenu.value?.inputRef?.focus())
}
</script>

<template>
  <div class="min-w-0">
    <div class="relative">
      <UInputMenu
        :key="inputMenuKey"
        ref="inputMenu"
        v-model:open="menuOpen"
        v-model:search-term="searchTerm"
        :model-value="null"
        :items="items"
        :loading="isSearching"
        :reset-search-term-on-blur="false"
        :ui="{ base: query ? 'pr-20' : undefined }"
        ignore-filter
        icon="i-lucide-search"
        :placeholder="isReady ? $t('searchPlaceholder') : ''"
        :aria-label="$t('searchPlaceholder')"
        @update:search-term="emit('update:query', $event)"
        @update:model-value="onSelect"
      />
      <UButton
        v-if="query"
        class="absolute right-9 top-1/2 -translate-y-1/2"
        type="button"
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-x"
        :aria-label="$t('clearSearch')"
        @mousedown.prevent
        @click="clearSearch"
      />
    </div>
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
