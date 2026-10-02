<script setup lang="ts">
import type { LocationResult } from '~/types/weather'

defineProps<{
  favorites: LocationResult[]
  isLocalizing: boolean
  errorMessage: string
}>()

const emit = defineEmits<{
  select: [location: LocationResult]
  remove: [location: LocationResult]
  retry: []
}>()
</script>

<template>
  <UPopover>
    <UTooltip :text="$t('favoriteCities')">
      <UButton icon="i-lucide-bookmark" color="neutral" variant="ghost" :aria-label="$t('favoriteCities')">
        <UBadge v-if="favorites.length" color="neutral" variant="subtle" size="sm">{{ favorites.length }}</UBadge>
      </UButton>
    </UTooltip>

    <template #content>
      <div class="w-[min(18rem,calc(100vw-2rem))] p-2">
        <p class="px-1 pb-2 text-xs font-medium uppercase tracking-wide text-muted">{{ $t('favoriteCities') }}</p>
        <p v-if="isLocalizing" role="status" class="px-1 pb-2 text-sm text-muted">{{ $t('loadingFavoriteNames') }}</p>
        <div v-if="errorMessage" class="px-1 pb-2">
          <p role="alert" class="text-sm text-error">{{ $t(errorMessage) }}</p>
          <UButton variant="link" size="sm" :disabled="isLocalizing" @click="emit('retry')">{{ $t('tryAgain') }}</UButton>
        </div>
        <p v-if="!favorites.length" class="px-1 pb-1 text-sm text-muted">{{ $t('noFavoritesYet') }}</p>
        <ul v-else class="flex flex-col gap-0.5">
          <li v-for="favorite in favorites" :key="`${favorite.latitude}-${favorite.longitude}`" class="group flex items-center gap-1 rounded-md hover:bg-elevated">
            <UButton
              variant="ghost"
              color="neutral"
              class="min-w-0 flex-1 justify-start"
              :ui="{ base: 'min-w-0' }"
              @click="emit('select', favorite)"
            >
              <span class="flex min-w-0 flex-col items-start text-left">
                <span class="truncate font-medium">{{ favorite.name }}</span>
                <span class="truncate text-xs text-muted">{{ [favorite.admin1, favorite.country].filter(Boolean).join(', ') }}</span>
              </span>
            </UButton>
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              color="neutral"
              size="sm"
              class="shrink-0"
              :aria-label="$t('removeFavorite', { value: favorite.name })"
              @click="emit('remove', favorite)"
            />
          </li>
        </ul>
      </div>
    </template>
  </UPopover>
</template>
