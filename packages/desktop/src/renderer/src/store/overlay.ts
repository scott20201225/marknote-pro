import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import bus from '../bus'

export const useHostOverlayStore = defineStore('hostOverlay', () => {
  const activeOverlays = ref<Set<string>>(new Set())
  const hasOverlay = computed(() => activeOverlays.value.size > 0)

  function showOverlay(id: string): void {
    if (!id || activeOverlays.value.has(id)) return
    const next = new Set(activeOverlays.value)
    next.add(id)
    activeOverlays.value = next
  }

  function hideOverlay(id: string): void {
    if (!id || !activeOverlays.value.has(id)) return
    const next = new Set(activeOverlays.value)
    next.delete(id)
    activeOverlays.value = next
  }

  function clearOverlays(): void {
    if (activeOverlays.value.size === 0) return
    activeOverlays.value = new Set()
  }

  bus.on('host-overlay:show', (id: unknown) => {
    if (typeof id === 'string') showOverlay(id)
  })

  bus.on('host-overlay:hide', (id: unknown) => {
    if (typeof id === 'string') hideOverlay(id)
  })

  return {
    activeOverlays,
    hasOverlay,
    showOverlay,
    hideOverlay,
    clearOverlays
  }
})
