import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useHostOverlayStore } from '@/store/overlay'
import bus from '@/bus'

describe('useHostOverlayStore (Host Overlay Coordination)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('initially has no active overlays', () => {
    const store = useHostOverlayStore()
    expect(store.hasOverlay).toBe(false)
    expect(store.activeOverlays.size).toBe(0)
  })

  it('updates hasOverlay state when showing and hiding overlays', () => {
    const store = useHostOverlayStore()

    store.showOverlay('about-dialog')
    expect(store.hasOverlay).toBe(true)
    expect(store.activeOverlays.has('about-dialog')).toBe(true)

    store.showOverlay('command-palette')
    expect(store.hasOverlay).toBe(true)
    expect(store.activeOverlays.size).toBe(2)

    store.hideOverlay('about-dialog')
    expect(store.hasOverlay).toBe(true)
    expect(store.activeOverlays.has('about-dialog')).toBe(false)

    store.hideOverlay('command-palette')
    expect(store.hasOverlay).toBe(false)
    expect(store.activeOverlays.size).toBe(0)
  })

  it('responds to host-overlay bus events', () => {
    const store = useHostOverlayStore()

    bus.emit('host-overlay:show', 'modal-overlay-123')
    expect(store.hasOverlay).toBe(true)
    expect(store.activeOverlays.has('modal-overlay-123')).toBe(true)

    bus.emit('host-overlay:hide', 'modal-overlay-123')
    expect(store.hasOverlay).toBe(false)
    expect(store.activeOverlays.size).toBe(0)
  })

  it('clears all active overlays on clearOverlays()', () => {
    const store = useHostOverlayStore()

    store.showOverlay('about-dialog')
    store.showOverlay('export-dialog')
    store.showOverlay('rename-dialog')
    expect(store.activeOverlays.size).toBe(3)
    expect(store.hasOverlay).toBe(true)

    store.clearOverlays()
    expect(store.activeOverlays.size).toBe(0)
    expect(store.hasOverlay).toBe(false)
  })
})
