import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import bus from '../bus'
import { debouncedSendBufferedState } from './bufferedState'

interface LayoutPartial {
  rightColumn?: string
  showSideBar?: boolean
  sideBarWidth?: number | string
}

interface SetLayoutOptions {
  scheduleBufferUpdate?: boolean
}

const normalizeSideBarWidth = (width: unknown): number => {
  const numericWidth = Number(width)
  return Number.isFinite(numericWidth) ? Math.max(numericWidth, 220) : 280
}

interface BufferedLayout {
  rightColumn: string | undefined
  showSideBar: boolean
  sideBarWidth: number
}

const createBufferedLayoutState = (state: unknown): BufferedLayout | null => {
  if (!state || typeof state !== 'object') return null
  const s = state as LayoutPartial

  // Pass through `rightColumn` (may be undefined). The pre-migration JS did
  // not coerce to 'files' here — RESTORE_BUFFERED_STATE then routes through
  // SET_LAYOUT which only assigns when the key is defined.
  return {
    rightColumn: s.rightColumn,
    showSideBar: true,
    sideBarWidth: normalizeSideBarWidth(s.sideBarWidth)
  }
}

const initialWidth = localStorage.getItem('side-bar-width')
const initialSideBarWidth = normalizeSideBarWidth(initialWidth)

export const useLayoutStore = defineStore('layout', () => {
  const rightColumn = ref<string>('files')
  const showSideBar = ref(true)
  const sideBarWidth = ref<number>(initialSideBarWidth)

  // Actual rendered sidebar width. `sideBarWidth` is the right-column width
  // (clamped to ≥220 by `normalizeSideBarWidth`); when `rightColumn` is empty
  // the sidebar collapses to its 45px icon strip. Consumers that need to
  // subtract the sidebar from viewport space must use this, not the raw ref.
  const effectiveSideBarWidth = computed<number>(() => {
    if (!rightColumn.value) return 45
    return Number(sideBarWidth.value)
  })

  function SET_LAYOUT(
    layout: LayoutPartial,
    { scheduleBufferUpdate = true }: SetLayoutOptions = {}
  ): void {
    // Match the pre-migration `Object.assign(this, layout)` semantics: assign
    // each known field as-is except sidebar visibility, which is now fixed to
    // visible. `SET_SIDE_BAR_WIDTH` owns sideBarWidth normalization.
    if (layout.rightColumn !== undefined) rightColumn.value = layout.rightColumn
    showSideBar.value = true
    if (layout.sideBarWidth !== undefined) sideBarWidth.value = layout.sideBarWidth as number
    if (scheduleBufferUpdate) {
      debouncedSendBufferedState()
    }
  }

  function CREATE_BUFFERED_STATE(): BufferedLayout | null {
    return createBufferedLayoutState({
      rightColumn: rightColumn.value,
      showSideBar: true,
      sideBarWidth: sideBarWidth.value
    })
  }

  function RESTORE_BUFFERED_STATE(state: unknown): void {
    const layout = createBufferedLayoutState(state)
    if (!layout) return

    SET_SIDE_BAR_WIDTH(layout.sideBarWidth, { scheduleBufferUpdate: false })
    SET_LAYOUT(
      {
        rightColumn: layout.rightColumn
      },
      { scheduleBufferUpdate: false }
    )
    DISPATCH_LAYOUT_MENU_ITEMS()
  }

  function TOGGLE_LAYOUT_ENTRY(entryName: string): void {
    void entryName
  }

  function SET_SIDE_BAR_WIDTH(
    width: number | string,
    { scheduleBufferUpdate = true }: SetLayoutOptions = {}
  ): void {
    const normalizedWidth = normalizeSideBarWidth(width)
    localStorage.setItem('side-bar-width', String(normalizedWidth))
    sideBarWidth.value = normalizedWidth
    if (scheduleBufferUpdate) {
      debouncedSendBufferedState()
    }
  }

  function LISTEN_FOR_LAYOUT(): void {
    window.electron.ipcRenderer.on('mt::set-view-layout', (_e, layout) => {
      const l = layout as unknown as LayoutPartial
      if (l.rightColumn) {
        SET_LAYOUT({
          ...l,
          rightColumn: l.rightColumn === rightColumn.value ? '' : l.rightColumn
        })
      } else {
        SET_LAYOUT(l)
      }
    })

    window.electron.ipcRenderer.on('mt::toggle-view-layout-entry', (_e, entryName) => {
      TOGGLE_LAYOUT_ENTRY(String(entryName))
    })

    bus.on('view:toggle-layout-entry', (entryName: unknown) => {
      TOGGLE_LAYOUT_ENTRY(String(entryName))
    })
  }

  function DISPATCH_LAYOUT_MENU_ITEMS(): void {
    // Sidebar visibility is fixed to always visible, so there is no menu state
    // to keep in sync here anymore.
  }

  function CHANGE_SIDE_BAR_WIDTH(width: number | string): void {
    SET_SIDE_BAR_WIDTH(width)
  }

  return {
    rightColumn,
    showSideBar,
    sideBarWidth,
    effectiveSideBarWidth,
    SET_LAYOUT,
    CREATE_BUFFERED_STATE,
    RESTORE_BUFFERED_STATE,
    TOGGLE_LAYOUT_ENTRY,
    SET_SIDE_BAR_WIDTH,
    LISTEN_FOR_LAYOUT,
    DISPATCH_LAYOUT_MENU_ITEMS,
    CHANGE_SIDE_BAR_WIDTH
  }
})
