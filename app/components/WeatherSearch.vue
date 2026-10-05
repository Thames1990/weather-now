<script setup lang="ts">
import { nextTick, useTemplateRef, type ComponentPublicInstance } from 'vue'
import type { LocationResult } from '~/types/weather'

type InputInstance = ComponentPublicInstance & { inputRef: HTMLInputElement | undefined }

const props = defineProps<{
  query: string
  results: LocationResult[]
  isSearching: boolean
  hasSearched: boolean
  errorMessage: string
  inputOnly?: boolean
}>()

const emit = defineEmits<{
  'update:query': [value: string]
  select: [location: LocationResult]
  retry: []
  clear: []
}>()

const isReady = useAppReady()
const input = useTemplateRef<InputInstance>('input')
const menu = useTemplateRef<InputInstance>('menu')
const searchWrapper = useTemplateRef<HTMLElement>('searchWrapper')
const menuOpen = ref(false)
const menuKey = ref(0)
const searchTerm = ref(props.query)
const items = computed(() => props.results.map(location => ({
  label: location.name,
  description: [location.admin1, location.country].filter(Boolean).join(', '),
  location
})))
watch(() => props.query, (query) => {
  searchTerm.value = query
  menuOpen.value = query.trim().length >= 2
  if (!query && props.inputOnly) {
    const focused = document.activeElement === menu.value?.inputRef
    menuKey.value++
    if (focused) void nextTick(() => menu.value?.inputRef?.focus())
  }
})

function updateMenuOpen(open: boolean) {
  menuOpen.value = open && props.query.trim().length >= 2
}

function interactOutside(event: CustomEvent<{ originalEvent: Event }>) {
  const target = event.detail.originalEvent.target
  if (target instanceof Node && searchWrapper.value?.contains(target)) event.preventDefault()
}

function selectResult(item: typeof items.value[number] | null) {
  if (!item) return
  menuOpen.value = false
  emit('select', item.location)
  emit('clear')
  void nextTick(() => menu.value?.inputRef?.focus())
}

function clearSearch() {
  emit('clear')
  menuOpen.value = false
  nextTick(() => (props.inputOnly ? menu.value : input.value)?.inputRef?.focus())
}
</script>

<template>
  <div ref="searchWrapper" class="min-w-0">
    <div class="relative">
      <UInputMenu
        v-if="inputOnly"
        :key="menuKey"
        ref="menu"
        v-model:search-term="searchTerm"
        :open="menuOpen"
        :model-value="null"
        :items="items"
        :content="{ onInteractOutside: interactOutside, onEscapeKeyDown: clearSearch }"
        ignore-filter
        :reset-search-term-on-blur="false"
        :loading="isSearching"
        :disabled="!isReady"
        icon="i-lucide-search"
        class="w-full"
        :ui="{ base: 'min-h-[48px] rounded-r-none pr-14', trailing: 'hidden' }"
        :placeholder="isReady ? $t('searchPlaceholder') : ''"
        :aria-label="$t('searchPlaceholder')"
        @update:open="updateMenuOpen"
        @update:search-term="emit('update:query', $event)"
        @update:model-value="selectResult"
      >
        <template #empty>
          <span v-if="errorMessage" role="alert">{{ $t(errorMessage) }}</span>
          <span v-else-if="isSearching">{{ $t('searchPlaceholder') }}</span>
          <span v-else-if="hasSearched" role="status">{{ $t('noLocationsFound') }}</span>
        </template>
        <template #content-bottom>
          <UButton v-if="errorMessage" color="error" variant="link" @click="emit('retry')">{{ $t('retrySearch') }}</UButton>
        </template>
      </UInputMenu>
      <UInput
        v-else
        ref="input"
        :model-value="props.query"
        :loading="isSearching"
        class="w-full"
        :ui="{ base: ['min-h-[48px]', query ? 'pr-14' : '', inputOnly ? 'rounded-r-none' : ''].join(' ') }"
        icon="i-lucide-search"
        :placeholder="isReady ? $t('searchPlaceholder') : ''"
        :aria-label="$t('searchPlaceholder')"
        :disabled="!isReady"
        @update:model-value="emit('update:query', String($event))"
      />
      <UButton
        v-if="query"
        class="absolute right-0 top-1/2 isolate -translate-y-1/2 min-h-[48px] min-w-[48px] justify-center hover:bg-transparent active:bg-transparent before:pointer-events-none before:absolute before:inset-1 before:-z-10 before:rounded-md before:transition-colors hover:before:bg-elevated active:before:bg-elevated"
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
    <section v-if="!inputOnly && query.trim().length >= 2" :aria-label="$t('searchResults')" class="mt-2">
      <h2 class="px-1 text-sm font-semibold text-highlighted">{{ $t('searchResults') }}</h2>
      <p v-if="query.trim().length < 2" class="px-1 pt-2 text-sm text-muted">{{ $t('searchPlaceholder') }}</p>
    <ul v-if="results.length" class="mt-2 grid gap-1" :aria-label="$t('searchResults')">
      <li v-for="result in results" :key="`${result.latitude},${result.longitude}`">
        <UButton color="neutral" variant="ghost" class="min-h-[48px] w-full justify-start" @click="emit('select', result)">
          <span class="flex min-w-0 flex-col items-start text-left">
            <span class="font-medium">{{ result.name }}</span>
            <span class="text-xs text-muted">{{ [result.admin1, result.country].filter(Boolean).join(', ') }}</span>
          </span>
        </UButton>
      </li>
    </ul>
    <div v-if="errorMessage" class="flex items-center justify-between gap-2 px-1 pt-1 text-xs text-error" role="alert">
      <span>{{ $t(errorMessage) }}</span>
      <UButton color="error" variant="link" size="xs" @click="emit('retry')">
        {{ $t('retrySearch') }}
      </UButton>
    </div>
    <p v-else-if="hasSearched && query.trim().length >= 2 && !results.length" class="px-1 pt-1 text-xs text-muted" role="status">
      {{ $t('noLocationsFound') }}
    </p>
    </section>
  </div>
</template>
