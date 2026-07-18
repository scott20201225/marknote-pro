import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// `listenForMain` pulls in the layout store, which transitively imports the
// preferences store and `@/config` (the latter reads `window.path.sep` at
// module load). Stub the contextBridge surfaces before the hoisted imports run
// so the store graph can load.
vi.hoisted(() => {
  const w = globalThis as unknown as { window?: { path?: { sep: string } } }
  w.window ??= {}
  w.window.path ??= { sep: '/' }
})

import { useListenForMainStore } from '@/store/listenForMain'
import { useLayoutStore } from '@/store/layout'
import bus from '@/bus'

// `EDITOR_EDIT_ACTION('findInFolder')` routes through `layoutStore.SET_LAYOUT`,
// which (because `showSideBar` is defined) reads `window.marknotepro.env`,
// fires `window.electron.ipcRenderer.send`, and persists the sidebar
// visibility preference (another `ipcRenderer.send`). The renderer i18n module
// (pulled in via the preferences store) also reads `window.electron.ipcRenderer`
// at import time. Provide spies for all of it.
const win = window as unknown as {
  electron?: { ipcRenderer: { on: Mock; send: Mock; invoke: Mock } }
  marknotepro?: { env: { windowId: number } }
}

describe('listenForMain store EDITOR_EDIT_ACTION', () => {
  beforeEach(() => {
    win.electron = {
      ipcRenderer: {
        on: vi.fn(),
        send: vi.fn(),
        invoke: vi.fn(() => Promise.resolve(false))
      }
    }
    win.marknotepro = { env: { windowId: 1 } }
    setActivePinia(createPinia())
  })

  afterEach(() => {
    delete win.electron
    delete win.marknotepro
    vi.clearAllMocks()
  })

  it("opens the search side panel for 'findInFolder'", () => {
    const layoutStore = useLayoutStore()
    expect(layoutStore.rightColumn).toBe('files')
    expect(layoutStore.showSideBar).toBe(false)

    useListenForMainStore().EDITOR_EDIT_ACTION('findInFolder')

    expect(layoutStore.rightColumn).toBe('search')
    expect(layoutStore.showSideBar).toBe(true)
  })

  it('does not mutate the layout for a non-findInFolder action', () => {
    const layoutStore = useLayoutStore()
    layoutStore.$patch({ rightColumn: 'files', showSideBar: false })

    useListenForMainStore().EDITOR_EDIT_ACTION('insertParagraph')

    expect(layoutStore.rightColumn).toBe('files')
    expect(layoutStore.showSideBar).toBe(false)
  })
})

describe('listenForMain store LISTEN_FOR_PARAGRAPH_INLINE_STYLE', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    win.electron = {
      ipcRenderer: {
        on: vi.fn(),
        send: vi.fn(),
        invoke: vi.fn(() => Promise.resolve(false))
      }
    }
    win.marknotepro = { env: { windowId: 1 } }
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
    delete win.electron
    delete win.marknotepro
    vi.clearAllMocks()
  })

  it('restores editor focus before dispatching a paragraph action from the main process', () => {
    const emitSpy = vi.spyOn(bus, 'emit')
    const store = useListenForMainStore()

    store.LISTEN_FOR_PARAGRAPH_INLINE_STYLE()

    const paragraphListener = win.electron!.ipcRenderer.on.mock.calls.find(
      ([channel]) => channel === 'mt::editor-paragraph-action'
    )?.[1] as ((_event: unknown, payload: { type: string }) => void) | undefined

    expect(paragraphListener).toBeTypeOf('function')

    paragraphListener?.(null, { type: 'list-indent' })

    expect(emitSpy).not.toHaveBeenCalled()

    vi.advanceTimersByTime(10)
    expect(emitSpy).toHaveBeenNthCalledWith(1, 'editor-focus')

    vi.advanceTimersByTime(140)
    expect(emitSpy).toHaveBeenNthCalledWith(2, 'paragraph', 'list-indent')
  })

  it('preserves the live selection for non-indent paragraph actions', () => {
    const emitSpy = vi.spyOn(bus, 'emit')
    const store = useListenForMainStore()

    store.LISTEN_FOR_PARAGRAPH_INLINE_STYLE()

    const paragraphListener = win.electron!.ipcRenderer.on.mock.calls.find(
      ([channel]) => channel === 'mt::editor-paragraph-action'
    )?.[1] as ((_event: unknown, payload: { type: string }) => void) | undefined

    paragraphListener?.(null, { type: 'ol-order' })

    expect(emitSpy).toHaveBeenCalledTimes(1)
    expect(emitSpy).toHaveBeenCalledWith('paragraph', 'ol-order')

    vi.advanceTimersByTime(200)
    expect(emitSpy).toHaveBeenCalledTimes(1)
  })
})
