import type { WatchSource } from 'vue'

// Mirrors a boolean source but only turns on after `delay` ms, so fast refreshes never cause a visible dim/blink.
export function useDelayedFlag(source: WatchSource<boolean>, delay = 250) {
  const flag = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  function clear() {
    if (timer) clearTimeout(timer)
    timer = undefined
  }

  watch(source, (value) => {
    clear()
    if (!value) {
      flag.value = false
      return
    }
    if (import.meta.client) timer = setTimeout(() => { flag.value = true }, delay)
  }, { immediate: true })

  onBeforeUnmount(clear)

  return readonly(flag)
}
