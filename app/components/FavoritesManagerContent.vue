<script setup lang="ts">
import { nextTick, onBeforeUnmount } from 'vue'
import type { LocationResult } from '~/types/weather'
import { locationKey, sameLocation } from '~/utils/locations'
import { CURRENT_LOCATION_FALLBACK_NAME, LOCATING_LOCATION_NAME, LOADING_LOCATION_NAME } from '~/composables/useWeather'

const props = defineProps<{
  currentLocation: LocationResult
  hasCurrentLocation: boolean
  isCurrentFavorite: boolean
  favorites: LocationResult[]
  isLocalizing: boolean
  errorMessage: string
  isManaging: boolean
  undoName: string
}>()

const emit = defineEmits<{
  addCurrent: []
  select: [location: LocationResult]
  remove: [location: LocationResult]
  move: [location: LocationResult, toIndex: number]
  toggleManage: []
  retry: []
  undo: []
}>()

const { t } = useI18n()
const announcement = ref('')
const currentName = computed(() => {
  if (props.currentLocation.name === CURRENT_LOCATION_FALLBACK_NAME) return t('currentLocationFallback')
  if (props.currentLocation.name === LOCATING_LOCATION_NAME) return t('locatingYou')
  if (props.currentLocation.name === LOADING_LOCATION_NAME) return t('checkingYourLocation')
  return props.currentLocation.name
})

function announceMove(location: LocationResult, toIndex: number, focusDirection: 'up' | 'down') {
  emit('move', location, toIndex)
  announcement.value = t('favoriteMoved', { value: location.name, position: toIndex + 1 })
  void nextTick(() => {
    const row = [...document.querySelectorAll<HTMLElement>('[data-favorite-key]')]
      .find(candidate => candidate.dataset.favoriteKey === locationKey(location))
    row?.querySelector<HTMLButtonElement>(`[data-move-direction="${focusDirection}"]`)?.focus()
  })
}

function toggleManage() {
  if (props.isManaging) announcement.value = t('favoriteChangesSaved')
  emit('toggleManage')
}

function move(location: LocationResult, index: number, direction: -1 | 1) {
  announceMove(location, index + direction, direction === 1 ? 'up' : 'down')
}

const dragPreview = ref<{ key: string; pointerId: number; x: number; y: number; toIndex?: number }>()

function removeDragListeners() {
  window.removeEventListener('pointermove', updateDrag)
  window.removeEventListener('pointerup', finishDrag)
  window.removeEventListener('pointercancel', cancelDrag)
}

onBeforeUnmount(removeDragListeners)

function startDrag(event: PointerEvent, location: LocationResult) {
  if (!props.isManaging || (event.pointerType === 'mouse' && event.button !== 0)) return
  event.preventDefault()
  const key = locationKey(location)
  const fromIndex = props.favorites.findIndex(item => locationKey(item) === key)
  if (fromIndex < 0) return
  dragPreview.value = { key, pointerId: event.pointerId, x: event.clientX, y: event.clientY, toIndex: fromIndex }
  window.addEventListener('pointermove', updateDrag)
  window.addEventListener('pointerup', finishDrag)
  window.addEventListener('pointercancel', cancelDrag)
  if (event.isTrusted) (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function updateDrag(event: PointerEvent) {
  const preview = dragPreview.value
  if (!preview || event.pointerId !== preview.pointerId) return
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-favorite-index]')
  const targetIndex = Number(target?.dataset.favoriteIndex)
  const targetRow = props.favorites[targetIndex]
  const draggedIndex = props.favorites.findIndex(item => locationKey(item) === preview.key)
  if (!target || !targetRow || draggedIndex < 0) {
    dragPreview.value = { ...preview, x: event.clientX, y: event.clientY, toIndex: undefined }
    return
  }
  const targetBox = target.getBoundingClientRect()
  const insertIndex = targetIndex + (event.clientY >= targetBox.top + targetBox.height / 2 ? 1 : 0)
  const toIndex = draggedIndex < insertIndex ? insertIndex - 1 : insertIndex
  dragPreview.value = { ...preview, x: event.clientX, y: event.clientY, toIndex }
}

function finishDrag(event: PointerEvent) {
  updateDrag(event)
  const preview = dragPreview.value
  if (!preview || event.pointerId !== preview.pointerId) return
  removeDragListeners()
  dragPreview.value = undefined
  const favorite = props.favorites.find(item => locationKey(item) === preview.key)
  const fromIndex = props.favorites.findIndex(item => locationKey(item) === preview.key)
  if (favorite && preview.toIndex !== undefined && fromIndex !== preview.toIndex) {
    announceMove(favorite, preview.toIndex, preview.toIndex > fromIndex ? 'up' : 'down')
  }
}

function cancelDrag(event: PointerEvent) {
  if (dragPreview.value && event.pointerId !== dragPreview.value.pointerId) return
  removeDragListeners()
  dragPreview.value = undefined
}
</script>

<template>
  <div class="max-h-[min(75vh,36rem)] w-full overflow-y-auto sm:w-[min(24rem,calc(100vw-2rem))]">
    <div v-if="$slots.search" class="border-b border-default p-3">
      <slot name="search" />
    </div>
    <section data-saved-cities tabindex="-1" class="outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary" :aria-label="$t('favoriteCities')">
    <header class="flex items-start justify-between gap-3 border-b border-default px-4 py-3">
      <div class="min-w-0">
        <h2 class="font-serif text-lg font-semibold text-highlighted">{{ $t('favoriteCities') }}</h2>
        <p class="mt-0.5 text-xs text-muted">{{ $t('favoriteManagerDescription') }}</p>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <UButton
          color="neutral"
          :variant="isManaging ? 'soft' : 'ghost'"
          size="sm"
          class="min-h-11"
          :icon="isManaging ? 'i-lucide-check' : 'i-lucide-bookmark'"
          @click="toggleManage"
        >
          {{ isManaging ? $t('doneManagingFavorites') : $t('manageFavorites') }}
        </UButton>
      </div>
    </header>

    <div class="p-3">
      <div v-if="hasCurrentLocation" class="mb-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <h3 class="truncate font-semibold text-highlighted">{{ currentName }}</h3>
            <p v-if="currentLocation.admin1 || currentLocation.country" class="mt-1 truncate text-xs text-muted">
              {{ [currentLocation.admin1, currentLocation.country].filter(Boolean).join(', ') }}
            </p>
          </div>
          <UBadge v-if="isCurrentFavorite" color="primary" variant="subtle">{{ $t('saved') }}</UBadge>
          <UButton
            v-else-if="!isManaging"
            icon="i-lucide-bookmark"
            color="primary"
            variant="soft"
            size="sm"
            class="min-h-11"
            :aria-label="$t('addFavorite', { value: currentName })"
            @click="emit('addCurrent')"
          >
            {{ $t('saveCity') }}
          </UButton>
        </div>
      </div>

      <div class="flex items-center justify-between px-1 pb-2">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">{{ $t('savedCities') }}</h3>
        <span class="text-xs tabular-nums text-muted">{{ favorites.length }}</span>
      </div>
      <p v-if="isManaging" class="px-1 pb-2 text-xs text-muted">{{ $t('favoriteMoveInstructions') }}</p>

      <p v-if="isLocalizing" role="status" class="px-1 pb-2 text-sm text-muted">{{ $t('loadingFavoriteNames') }}</p>
      <div v-if="errorMessage" class="mb-2 rounded-lg bg-error/5 px-2 py-2">
        <p role="alert" class="text-sm text-error">{{ $t(errorMessage) }}</p>
        <UButton color="error" variant="link" size="sm" :disabled="isLocalizing" @click="emit('retry')">
          {{ $t('tryAgain') }}
        </UButton>
      </div>
      <div v-if="undoName" class="mb-2 flex items-center justify-between gap-2 rounded-lg bg-elevated px-3 py-2">
        <p role="status" class="text-sm text-muted">{{ $t('favoriteRemoved', { value: undoName }) }}</p>
        <UButton variant="link" size="sm" class="min-h-11 shrink-0" @click="emit('undo')">{{ $t('undo') }}</UButton>
      </div>

      <p v-if="!favorites.length" class="rounded-lg bg-elevated/60 px-3 py-4 text-center text-sm text-muted">
        {{ $t('noFavoritesYet') }}
      </p>
      <ul v-else class="flex flex-col gap-1">
        <li
          v-for="(favorite, index) in favorites"
          :key="locationKey(favorite)"
          :data-favorite-key="locationKey(favorite)"
          :data-favorite-index="index"
          class="group relative flex min-w-0 items-center gap-1 rounded-xl border p-1 transition-colors"
          :class="[
            sameLocation(favorite, currentLocation) ? 'border-primary/30 bg-primary/5' : 'border-transparent hover:border-default hover:bg-elevated/70',
            dragPreview?.key === locationKey(favorite) ? 'opacity-40' : ''
          ]"
        >
          <span
            v-if="dragPreview && (dragPreview.toIndex === index || (dragPreview.toIndex === favorites.length && index === favorites.length - 1))"
            data-testid="favorite-drop-indicator"
            aria-hidden="true"
            class="pointer-events-none absolute inset-x-2 z-10 h-1 rounded-full bg-primary"
            :class="dragPreview.toIndex === favorites.length ? '-bottom-0.5' : '-top-0.5'"
          />
          <span
            v-if="isManaging"
            class="touch-none select-none cursor-grab px-1 text-muted active:cursor-grabbing"
            aria-hidden="true"
            data-testid="favorite-drag-handle"
            @pointerdown.stop="startDrag($event, favorite)"
          >
            <UIcon name="i-lucide-grip-vertical" class="size-4" />
          </span>
          <span v-if="isManaging" class="flex min-h-11 min-w-0 flex-1 flex-col justify-center px-2.5 text-left text-sm">
            <span class="truncate font-medium text-highlighted" data-favorite-name>{{ favorite.name }}</span>
            <span class="truncate text-xs text-muted">{{ [favorite.admin1, favorite.country].filter(Boolean).join(', ') }}</span>
          </span>
          <UButton
            v-else
            variant="ghost"
            color="neutral"
            class="min-w-0 flex-1 justify-start"
            :ui="{ base: 'min-h-11 min-w-0' }"
            :aria-label="$t('selectFavorite', { value: favorite.name, context: [favorite.admin1, favorite.country].filter(Boolean).join(', ') })"
            :aria-current="sameLocation(favorite, currentLocation) ? 'true' : undefined"
            @click="emit('select', favorite)"
          >
            <span class="flex min-w-0 flex-col items-start text-left">
              <span class="truncate font-medium text-highlighted" data-favorite-name>{{ favorite.name }}</span>
              <span class="truncate text-xs text-muted">{{ [favorite.admin1, favorite.country].filter(Boolean).join(', ') }}</span>
            </span>
          </UButton>
          <template v-if="isManaging">
            <div class="flex shrink-0 items-center">
              <UButton
                icon="i-lucide-arrow-up"
                color="neutral"
                variant="ghost"
                size="sm"
                class="min-h-11 min-w-11"
                :disabled="index === 0"
                data-move-direction="up"
                :aria-label="$t('moveFavoriteUp', { value: favorite.name })"
                @click="move(favorite, index, -1)"
              />
              <UButton
                icon="i-lucide-arrow-down"
                color="neutral"
                variant="ghost"
                size="sm"
                class="min-h-11 min-w-11"
                :disabled="index === favorites.length - 1"
                data-move-direction="down"
                :aria-label="$t('moveFavoriteDown', { value: favorite.name })"
                @click="move(favorite, index, 1)"
              />
              <UButton
                icon="i-lucide-x"
                color="error"
                variant="ghost"
                size="sm"
                class="min-h-11 min-w-11"
                :aria-label="$t('removeFavorite', { value: favorite.name })"
                @click="emit('remove', favorite)"
              />
            </div>
          </template>
          <span v-else class="mr-2 flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted">
            <span>{{ index + 1 }}</span>
            <span v-if="sameLocation(favorite, currentLocation)" class="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">{{ $t('currentlyDisplayed') }}</span>
          </span>
        </li>
      </ul>
      <Teleport to="body">
        <div
          v-if="dragPreview"
          data-testid="favorite-drag-preview"
          aria-hidden="true"
          class="pointer-events-none fixed z-[100] max-w-[min(20rem,calc(100vw-2rem))] -translate-y-1/2 rounded-lg border border-primary/40 bg-default px-3 py-2 font-medium text-highlighted shadow-lg"
          :style="{ left: `${dragPreview.x + 14}px`, top: `${dragPreview.y}px` }"
        >
          {{ favorites.find(favorite => locationKey(favorite) === dragPreview?.key)?.name }}
        </div>
      </Teleport>
      <p class="sr-only" aria-live="polite" aria-atomic="true">{{ announcement }}</p>
    </div>
    </section>
  </div>
</template>
