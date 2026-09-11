export function usePersistentState<T>(key: string, defaultValue: T) {
  const state = ref(defaultValue)

  onMounted(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored !== null) state.value = JSON.parse(stored) as T
    } catch {
      localStorage.removeItem(key)
    }
  })

  watch(state, (value) => {
    if (import.meta.client) localStorage.setItem(key, JSON.stringify(value))
  }, { deep: true })

  return state
}
