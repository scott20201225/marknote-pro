import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import bus from '../bus'
import { debouncedSendBufferedState } from './bufferedState'
import { usePreferencesStore } from './preferences'

interface LayoutPartial {
  rightColumn?: string
  showSideBar?: boolean
  sideBarWidth?: number | string
  noteNavigationMode?: 'tree' | 'tree-list'
  noteListWidth?: number | string
}

interface SetLayoutOptions {
  scheduleBufferUpdate?: boolean
  persistPreference?: boolean
}

const normalizeSideBarWidth = (width: unknown): number => {
  const numericWidth = Number(width)
  return Number.isFinite(numericWidth) ? Math.max(numericWidth, 220) : 280
}

const normalizeNoteListWidth = (width: unknown): number => {
  const numericWidth = Number(width)
  return Number.isFinite(numericWidth) ? Math.max(numericWidth, 220) : 300
}

interface BufferedLayout {
  rightColumn: string | undefined
  showSideBar: boolean
  sideBarWidth: number
  noteNavigationMode: 'tree' | 'tree-list'
  noteListWidth: number
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
    sideBarWidth: normalizeSideBarWidth(s.sideBarWidth),
    noteNavigationMode: s.noteNavigationMode === 'tree-list' ? 'tree-list' : 'tree',
    noteListWidth: normalizeNoteListWidth(s.noteListWidth)
  }
}

const initialWidth = localStorage.getItem('side-bar-width')
const initialSideBarWidth = normalizeSideBarWidth(initialWidth)
const initialNoteListWidth = normalizeNoteListWidth(localStorage.getItem('note-list-width'))

export const useLayoutStore = defineStore('layout', () => {
  const preferencesStore = usePreferencesStore()
  const rightColumn = ref<string>('files')
  const showSideBar = ref(true)
  const sideBarWidth = ref<number>(initialSideBarWidth)
  const noteNavigationMode = ref<'tree' | 'tree-list'>(
    preferencesStore.noteNavigationMode === 'tree-list' ? 'tree-list' : 'tree'
  )
  const noteListWidth = ref<number>(initialNoteListWidth)

  watch(
    () => [preferencesStore.preferenceLoaded, preferencesStore.noteNavigationMode] as const,
    ([loaded, mode]) => {
      if (!loaded) return
      const normalizedMode = mode === 'tree-list' ? 'tree-list' : 'tree'
      if (noteNavigationMode.value !== normalizedMode) {
        SET_NOTE_NAVIGATION_MODE(normalizedMode, {
          scheduleBufferUpdate: false,
          persistPreference: false
        })
      }
    },
    { immediate: true }
  )

  // Actual rendered sidebar width. `sideBarWidth` is the right-column width
  // (clamped to ≥220 by `normalizeSideBarWidth`); when `rightColumn` is empty
  // the sidebar collapses to its 45px icon strip. Consumers that need to
  // subtract the sidebar from viewport space must use this, not the raw ref.
  const effectiveSideBarWidth = computed<number>(() => {
    if (!rightColumn.value) return 45
    const baseWidth = Number(sideBarWidth.value)
    if (rightColumn.value === 'files' && noteNavigationMode.value === 'tree-list') {
      return baseWidth + Number(noteListWidth.value) + 4
    }
    return baseWidth
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
    if (layout.noteNavigationMode !== undefined) noteNavigationMode.value = layout.noteNavigationMode
    if (layout.noteListWidth !== undefined) noteListWidth.value = layout.noteListWidth as number
    if (scheduleBufferUpdate) {
      debouncedSendBufferedState()
    }
  }

  function CREATE_BUFFERED_STATE(): BufferedLayout | null {
    return createBufferedLayoutState({
      rightColumn: rightColumn.value,
      showSideBar: true,
      sideBarWidth: sideBarWidth.value,
      noteNavigationMode: noteNavigationMode.value,
      noteListWidth: noteListWidth.value
    })
  }

  function RESTORE_BUFFERED_STATE(state: unknown): void {
    const layout = createBufferedLayoutState(state)
    if (!layout) return

    SET_SIDE_BAR_WIDTH(layout.sideBarWidth, { scheduleBufferUpdate: false })
    SET_LAYOUT(
      {
        rightColumn: layout.rightColumn,
        noteListWidth: layout.noteListWidth
      },
      { scheduleBufferUpdate: false }
    )
    noteNavigationMode.value = layout.noteNavigationMode
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

  function SET_NOTE_LIST_WIDTH(
    width: number | string,
    { scheduleBufferUpdate = true }: SetLayoutOptions = {}
  ): void {
    const normalizedWidth = normalizeNoteListWidth(width)
    localStorage.setItem('note-list-width', String(normalizedWidth))
    noteListWidth.value = normalizedWidth
    if (scheduleBufferUpdate) {
      debouncedSendBufferedState()
    }
  }

  function SET_NOTE_NAVIGATION_MODE(
    mode: 'tree' | 'tree-list',
    { scheduleBufferUpdate = true, persistPreference = true }: SetLayoutOptions = {}
  ): void {
    noteNavigationMode.value = mode
    if (persistPreference && preferencesStore.noteNavigationMode !== mode) {
      preferencesStore.SET_SINGLE_PREFERENCE({ type: 'noteNavigationMode', value: mode })
    }
    if (scheduleBufferUpdate) {
      debouncedSendBufferedState()
    }
  }

  return {
    rightColumn,
    showSideBar,
    sideBarWidth,
    noteNavigationMode,
    noteListWidth,
    effectiveSideBarWidth,
    SET_LAYOUT,
    CREATE_BUFFERED_STATE,
    RESTORE_BUFFERED_STATE,
    TOGGLE_LAYOUT_ENTRY,
    SET_SIDE_BAR_WIDTH,
    LISTEN_FOR_LAYOUT,
    DISPATCH_LAYOUT_MENU_ITEMS,
    CHANGE_SIDE_BAR_WIDTH,
    SET_NOTE_NAVIGATION_MODE,
    SET_NOTE_LIST_WIDTH
  }
})
