<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { LocationResult } from '~/types/weather'
import { moveItem, sameLocation } from '~/utils/locations'

const props = defineProps<{
  favorites: LocationResult[]
  currentLocation: LocationResult
  hasCurrentLocation: boolean
  isCurrentFavorite: boolean
  isLocalizing: boolean
  errorMessage: string
}>()

const emit = defineEmits<{
  select: [location: LocationResult]
  add: [location: LocationResult]
  save: [favorites: LocationResult[]]
  retry: []
  close: []
}>()

const isOpen = ref(false)
const isReady = useAppReady()
const isDesktop = ref(false)
const isManaging = ref(false)
// Edits stay in this draft until Done; closing the panel discards them.
const draft = ref<LocationResult[]>()
const draftRemoved = ref<LocationResult[]>([])
const lastRemoval = ref<{ location: LocationResult; index: number }>()
const triggerWrapper = ref<HTMLElement>()
const panelId = useId()
const panel = ref<HTMLElement>()
const savedCitiesButton = ref<{ $el: HTMLButtonElement }>()
let shouldReturnFocus = false
let mediaQuery: MediaQueryList | undefined

function updateBreakpoint(event: MediaQueryList | MediaQueryListEvent) {
  if (isDesktop.value !== event.matches) isOpen.value = false
  isDesktop.value = event.matches
}

async function openSavedCities() {
  if (!isReady.value) return
  shouldReturnFocus = false
  isOpen.value = true
  await nextTick()
  panel.value?.querySelector<HTMLElement>('[data-saved-cities]')?.focus()
}

function interactOutside(event: CustomEvent<{ originalEvent: Event }>) {
  const target = event.detail.originalEvent.target
  if (target instanceof Node && savedCitiesButton.value?.$el.contains(target)) event.preventDefault()
}

function returnDesktopFocus(event: Event) {
  event.preventDefault()
  const activeElement = document.activeElement
  const returnFocus = shouldReturnFocus || !activeElement || activeElement === document.body || panel.value?.contains(activeElement)
  shouldReturnFocus = false
  if (!returnFocus) return
  savedCitiesButton.value?.$el.focus()
}

function selectLocation(location: LocationResult) {
  emit('select', location)
  shouldReturnFocus = isDesktop.value
  isOpen.value = false
}

function closeWithFocusReturn() {
  if (isOpen.value) return
  stopManaging()
  emit('close')
  if (isDesktop.value) return
  void nextTick(() => {
    const activeElement = document.activeElement
    if (activeElement && activeElement !== document.body && !triggerWrapper.value?.contains(activeElement)) return
    triggerWrapper.value?.querySelector('button')?.focus()
  })
}

watch(isOpen, closeWithFocusReturn)
onMounted(() => {
  mediaQuery = window.matchMedia('(min-width: 1024px)')
  updateBreakpoint(mediaQuery)
  mediaQuery.addEventListener('change', updateBreakpoint)
})
onBeforeUnmount(() => mediaQuery?.removeEventListener('change', updateBreakpoint))

const managedFavorites = computed(() => {
  const edits = draft.value
  if (!edits) return props.favorites
  const kept = edits
    .map(location => props.favorites.find(favorite => sameLocation(favorite, location)))
    .filter((favorite): favorite is LocationResult => favorite !== undefined)
  const added = props.favorites.filter(favorite =>
    !edits.some(location => sameLocation(location, favorite))
    && !draftRemoved.value.some(location => sameLocation(location, favorite)))
  return [...added, ...kept]
})

const managerProps = () => ({
  currentLocation: props.currentLocation,
  hasCurrentLocation: props.hasCurrentLocation,
  isCurrentFavorite: draft.value
    ? managedFavorites.value.some(favorite => sameLocation(favorite, props.currentLocation))
    : props.isCurrentFavorite,
  favorites: managedFavorites.value,
  isLocalizing: props.isLocalizing,
  errorMessage: props.errorMessage,
  isManaging: isManaging.value,
  undoName: lastRemoval.value?.location.name ?? ''
})

function stopManaging() {
  isManaging.value = false
  draft.value = undefined
  draftRemoved.value = []
  lastRemoval.value = undefined
}

function toggleManage() {
  if (!isManaging.value) {
    draft.value = [...props.favorites]
    isManaging.value = true
    return
  }
  const changed = managedFavorites.value.length !== props.favorites.length
    || managedFavorites.value.some((favorite, index) => !sameLocation(favorite, props.favorites[index]!))
  if (changed) emit('save', managedFavorites.value)
  stopManaging()
}

function moveDraft(location: LocationResult, toIndex: number) {
  const index = managedFavorites.value.findIndex(favorite => sameLocation(favorite, location))
  draft.value = moveItem(managedFavorites.value, index, toIndex)
}

function removeDraft(location: LocationResult) {
  const index = managedFavorites.value.findIndex(favorite => sameLocation(favorite, location))
  if (index < 0) return
  const removed = managedFavorites.value[index]!
  draft.value = managedFavorites.value.filter((_, candidate) => candidate !== index)
  draftRemoved.value = [...draftRemoved.value, removed]
  lastRemoval.value = { location: removed, index }
}

function undoDraftRemoval() {
  const removal = lastRemoval.value
  if (!removal) return
  const restored = [...managedFavorites.value]
  restored.splice(Math.min(removal.index, restored.length), 0, removal.location)
  draft.value = restored
  draftRemoved.value = draftRemoved.value.filter(location => !sameLocation(location, removal.location))
  lastRemoval.value = undefined
}

function managerListeners() {
  return {
    addCurrent: () => emit('add', props.currentLocation),
    select: selectLocation,
    remove: removeDraft,
    move: moveDraft,
    toggleManage,
    retry: () => emit('retry'),
    undo: undoDraftRemoval
  }
}

const desktopContent = {
  side: 'bottom' as const,
  align: 'end' as const,
  sideOffset: 8,
  onOpenAutoFocus: (event: Event) => event.preventDefault(),
  onCloseAutoFocus: returnDesktopFocus,
  onEscapeKeyDown: () => { shouldReturnFocus = true },
  onInteractOutside: interactOutside
}
</script>

<template>
  <div ref="triggerWrapper">
    <UPopover v-if="isDesktop" v-model:open="isOpen" :reference="savedCitiesButton?.$el" :content="desktopContent">
      <template #anchor>
        <div class="flex w-full items-center">
          <div class="min-w-0 flex-1">
            <slot name="desktop-search" :select-location="selectLocation" />
          </div>
          <UButton
            ref="savedCitiesButton"
            icon="i-lucide-bookmark"
            color="primary"
            variant="soft"
            class="min-h-[48px] shrink-0 rounded-l-none"
            :disabled="!isReady"
            :aria-label="$t('savedCities')"
            :aria-expanded="isOpen"
            :aria-controls="panelId"
            aria-haspopup="dialog"
            @click="openSavedCities"
          >
            {{ $t('savedCities') }}
            <UBadge color="primary" variant="subtle" size="sm">{{ favorites.length }}</UBadge>
          </UButton>
        </div>
      </template>
      <template #content>
        <div :id="panelId" ref="panel">
          <FavoritesManagerContent v-bind="managerProps()" v-on="managerListeners()" />
        </div>
      </template>
    </UPopover>

    <UDrawer v-else v-model:open="isOpen" :title="$t('locations')" direction="bottom" :handle="true">
      <UButton
        icon="i-lucide-search"
        color="primary"
        variant="soft"
        class="min-h-[48px] w-full justify-start"
        :aria-label="$t('locations')"
        :disabled="!isReady"
        :aria-expanded="isOpen"
        :aria-haspopup="'dialog'"
      >
        <span class="min-w-0 flex-1 truncate text-left">{{ $t('locations') }}</span>
        <UBadge v-if="favorites.length" color="primary" variant="subtle" size="sm">{{ favorites.length }}</UBadge>
      </UButton>
      <template #content>
        <FavoritesManagerContent v-bind="managerProps()" v-on="managerListeners()">
          <template #search><slot name="search" :select-location="selectLocation" /></template>
        </FavoritesManagerContent>
      </template>
    </UDrawer>
  </div>
</template>
