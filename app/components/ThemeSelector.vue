<script setup lang="ts">
type ThemePreference = 'system' | 'light' | 'dark'

interface ThemeOption {
  label: string
  value: ThemePreference
  icon: string
}

defineProps<{
  label: string
  options: ThemeOption[]
}>()

const model = defineModel<ThemePreference>({ required: true })
const inputName = useId()
</script>

<template>
  <fieldset class="grid min-w-0 grid-cols-3 gap-1 rounded-lg border border-default bg-elevated p-1">
    <legend class="sr-only">
      {{ label }}
    </legend>
    <label
      v-for="option in options"
      :key="option.value"
      class="group min-w-0 cursor-pointer rounded-md"
    >
      <input
        v-model="model"
        class="peer sr-only"
        type="radio"
        :name="inputName"
        :value="option.value"
      >
      <span class="flex min-h-11 items-center justify-center gap-1 rounded-md border border-transparent px-1 text-xs font-medium text-muted transition-colors group-hover:bg-default/70 peer-checked:border-primary/30 peer-checked:bg-default peer-checked:text-primary peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 dark:peer-focus-visible:ring-offset-slate-900">
        <UIcon :name="option.icon" class="size-4 shrink-0" aria-hidden="true" />
        <span class="truncate">{{ option.label }}</span>
      </span>
    </label>
  </fieldset>
</template>
