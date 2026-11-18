<template>
  <div class="terminal-canvas-container" ref="containerRef" @contextmenu.prevent="openContextMenu">
    <!-- Search Bar -->
    <div v-if="showSearch" class="terminal-search-bar">
      <el-input
        v-model="searchQuery"
        size="small"
        :placeholder="t('terminal.searchPlaceholder')"
        clearable
        @input="onSearchChange"
        @keyup.enter="findNext"
        @keyup.esc="closeSearch"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-button-group size="small">
        <el-button :icon="ArrowUp" :title="t('terminal.findPrev')" @click="findPrev" />
        <el-button :icon="ArrowDown" :title="t('terminal.findNext')" @click="findNext" />
      </el-button-group>
      <el-button size="small" :icon="Close" :title="t('terminal.closeSearch')" circle @click="closeSearch" />
    </div>

    <!-- xterm Canvas Element -->
    <div ref="xtermRef" class="terminal-xterm-host" />

    <!-- Disconnected Overlay -->
    <div v-if="session.status === 'disconnected' || session.status === 'error'" class="terminal-disconnected-overlay">
      <div class="disconnected-card">
        <div class="status-dot error" />
        <span class="status-msg">{{ t('terminal.disconnected') }} {{ session.error ? `(${session.error})` : '' }}</span>
        <el-button type="primary" size="small" @click="$emit('reconnect', session)">
          {{ t('terminal.reconnect') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { t } from '@/i18n'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { Search, ArrowUp, ArrowDown, Close } from '@element-plus/icons-vue'
import { useTerminalStore } from '@/store/terminal'
import { usePreferencesStore } from '@/store/preferences'
import { isOsx } from '@/util'
import { getAdaptiveTerminalTheme } from '@shared/terminalThemes'
import type { ITerminalSessionInfo } from '@shared/types/terminal'

const props = defineProps<{
  session: ITerminalSessionInfo
  isActive: boolean
}>()

const emit = defineEmits<{
  (e: 'reconnect', session: ITerminalSessionInfo): void
}>()

const terminalStore = useTerminalStore()
const preferencesStore = usePreferencesStore()

const containerRef = ref<HTMLDivElement | null>(null)
const xtermRef = ref<HTMLDivElement | null>(null)

let term: Terminal | null = null
let fitAddon: FitAddon | null = null
let searchAddon: SearchAddon | null = null
let unregisterDataListener: (() => void) | null = null
let resizeObserver: ResizeObserver | null = null

const showSearch = ref(false)
const searchQuery = ref('')

function buildXtermTheme(themeColors: ReturnType<typeof getAdaptiveTerminalTheme>) {
  return {
    background: themeColors.background,
    foreground: themeColors.foreground,
    cursor: themeColors.cursor || themeColors.foreground,
    cursorAccent: themeColors.cursorAccent || themeColors.background,
    selectionBackground: themeColors.selectionBackground || 'rgba(255, 255, 255, 0.25)',
    selectionForeground: themeColors.selectionForeground,
    black: themeColors.black,
    red: themeColors.red,
    green: themeColors.green,
    yellow: themeColors.yellow,
    blue: themeColors.blue,
    magenta: themeColors.magenta,
    cyan: themeColors.cyan,
    white: themeColors.white,
    brightBlack: themeColors.brightBlack,
    brightRed: themeColors.brightRed,
    brightGreen: themeColors.brightGreen,
    brightYellow: themeColors.brightYellow,
    brightBlue: themeColors.brightBlue,
    brightMagenta: themeColors.brightMagenta,
    brightCyan: themeColors.brightCyan,
    brightWhite: themeColors.brightWhite
  }
}

function applyTheme(): void {
  const appTheme = preferencesStore.theme || 'light'
  const themeColors = getAdaptiveTerminalTheme(appTheme)

  if (containerRef.value) {
    containerRef.value.style.backgroundColor = themeColors.background
  }

  if (term) {
    term.options.theme = buildXtermTheme(themeColors)
  }
}

function initTerminal(): void {
  if (!xtermRef.value) return

  const initialTheme = getAdaptiveTerminalTheme(preferencesStore.theme || 'light')
  if (containerRef.value) {
    containerRef.value.style.backgroundColor = initialTheme.background
  }

  term = new Terminal({
    fontFamily: terminalStore.fontFamily,
    fontSize: terminalStore.fontSize,
    cursorBlink: terminalStore.cursorBlink,
    scrollback: terminalStore.scrollback,
    allowProposedApi: true,
    convertEol: true,
    cursorStyle: 'block',
    theme: buildXtermTheme(initialTheme)
  })

  fitAddon = new FitAddon()
  searchAddon = new SearchAddon()

  term.loadAddon(fitAddon)
  term.loadAddon(searchAddon)

  term.open(xtermRef.value)

  // Try loading WebGL addon for GPU accelerated rendering
  try {
    const webglAddon = new WebglAddon()
    webglAddon.onContextLoss(() => {
      webglAddon.dispose()
    })
    term.loadAddon(webglAddon)
  } catch (e) {
    console.warn('WebGL terminal addon not supported, falling back to canvas', e)
  }

  applyTheme()

  // Handle user input
  term.onData((data) => {
    terminalStore.write(props.session.id, data)
  })

  // Support copy & paste shortcuts directly in xterm
  term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
    if (event.type !== 'keydown') return true
    const key = event.key.toLowerCase()
    const cmdOnly = event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
    const ctrlOnly = event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
    const ctrlShift = event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey

    // Copy: Cmd+C on macOS, Ctrl+Shift+C elsewhere. Plain Ctrl+C without a
    // selection is sent to the shell as SIGINT.
    if (key === 'c') {
      if (isOsx ? cmdOnly : ctrlShift) {
        const selection = term?.getSelection()
        if (selection) {
          window.electron.clipboard.writeText(selection)
        }
        return false
      }
      if (!isOsx && ctrlOnly) {
        if (term && term.hasSelection()) {
          const selection = term.getSelection()
          if (selection) {
            window.electron.clipboard.writeText(selection)
            term.clearSelection()
          }
        } else {
          // No selection -> send SIGINT (\x03) to exit process (e.g. tail -f, log view, ping, top)
          terminalStore.write(props.session.id, '\x03')
        }
        return false
      }
    }

    // Paste: Cmd+V on macOS, Ctrl+V / Ctrl+Shift+V elsewhere.
    if (key === 'v' && (isOsx ? cmdOnly : ctrlOnly || ctrlShift)) {
      void window.electron.clipboard.readText().then((text) => {
        if (text) {
          terminalStore.write(props.session.id, text)
        }
      })
      return false
    }

    // Select all: Cmd+A on macOS (plain Ctrl+A must reach the shell).
    if (isOsx && key === 'a' && cmdOnly) {
      term?.selectAll()
      return false
    }

    // Clear screen: Cmd+K on macOS (the context menu advertises it).
    if (isOsx && key === 'k' && cmdOnly) {
      term?.clear()
      return false
    }

    // Search: Cmd+F / Ctrl+F.
    if (key === 'f' && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
      showSearch.value = true
      return false
    }

    return true
  })

  // Handle resize
  term.onResize(({ cols, rows }) => {
    terminalStore.resize(props.session.id, cols, rows)
  })

  // Listen for backend data
  unregisterDataListener = terminalStore.registerDataListener(props.session.id, (data) => {
    if (term) {
      term.write(data)
    }
  })

  // Observe container size
  resizeObserver = new ResizeObserver(() => {
    if (props.isActive && fitAddon && term) {
      try {
        fitAddon.fit()
      } catch (err) {
        // ignore
      }
    }
  })
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value)
  }

  nextTick(() => {
    if (fitAddon && term) {
      fitAddon.fit()
      terminalStore.resize(props.session.id, term.cols, term.rows)
      term.focus()
    }
  })
}

async function openContextMenu(e: MouseEvent): Promise<void> {
  e.preventDefault()
  const selection = term?.getSelection()
  const hasSelection = Boolean(selection && selection.length > 0)
  const clipboardText = await window.electron.clipboard.readText()
  const hasClipboard = Boolean(clipboardText)

  const action = await window.electron.ipcRenderer.invoke('mt::terminal:show-context-menu', {
    hasSelection,
    hasClipboard
  })
  if (!action) return

  if (action === 'copy') {
    if (selection) {
      window.electron.clipboard.writeText(selection)
    }
  } else if (action === 'paste') {
    if (clipboardText) {
      terminalStore.write(props.session.id, clipboardText)
    }
  } else if (action === 'selectAll') {
    term?.selectAll()
  } else if (action === 'clear') {
    term?.clear()
  } else if (action === 'find') {
    showSearch.value = true
  }
}

function findNext(): void {
  if (searchAddon && searchQuery.value) {
    searchAddon.findNext(searchQuery.value)
  }
}

function findPrev(): void {
  if (searchAddon && searchQuery.value) {
    searchAddon.findPrevious(searchQuery.value)
  }
}

function onSearchChange(): void {
  if (searchAddon && searchQuery.value) {
    searchAddon.findNext(searchQuery.value, { incremental: true })
  }
}

function closeSearch(): void {
  showSearch.value = false
  searchQuery.value = ''
  if (searchAddon) {
    searchAddon.clearDecorations()
  }
  term?.focus()
}

// Watch active state to fit and focus
watch(
  () => props.isActive,
  (active) => {
    if (!active) {
      notifyTerminalFocus(false)
      return
    }
    if (active && fitAddon && term) {
      nextTick(() => {
        try {
          fitAddon?.fit()
          term?.focus()
          if (containerRef.value?.contains(document.activeElement)) {
            notifyTerminalFocus(true)
          }
        } catch {
          // ignore
        }
      })
    }
  }
)

// Watch app theme changes
watch(
  () => preferencesStore.theme,
  () => {
    applyTheme()
  }
)

// Watch font & preferences changes
watch(
  () => [terminalStore.fontFamily, terminalStore.fontSize, terminalStore.cursorBlink, terminalStore.scrollback],
  () => {
    if (!term) return
    term.options.fontFamily = terminalStore.fontFamily
    term.options.fontSize = terminalStore.fontSize
    term.options.cursorBlink = terminalStore.cursorBlink
    term.options.scrollback = terminalStore.scrollback
    fitAddon?.fit()
  }
)

let themeObserver: MutationObserver | null = null

// Tell the main process whether the terminal itself owns keyboard focus. The
// menu accelerators are released only while this is true, so shortcuts keep
// working when focus is in the sidebar, a dialog, or another editor view.
const notifyTerminalFocus = (focused: boolean): void => {
  window.electron.ipcRenderer.send('mt::terminal-focus-mode', focused)
}
const onTerminalFocusIn = (): void => {
  if (props.isActive) notifyTerminalFocus(true)
}
const onTerminalFocusOut = (event: FocusEvent): void => {
  const next = event.relatedTarget as Node | null
  if (!containerRef.value?.contains(next)) notifyTerminalFocus(false)
}

onMounted(() => {
  initTerminal()

  const container = containerRef.value
  if (container) {
    container.addEventListener('focusin', onTerminalFocusIn)
    container.addEventListener('focusout', onTerminalFocusOut)
  }

  // Also observe stylesheet mutations so any dynamic theme switch triggers applyTheme
  const agTheme = document.querySelector('#ag-theme')
  if (agTheme) {
    themeObserver = new MutationObserver(() => {
      applyTheme()
    })
    themeObserver.observe(agTheme, { childList: true, characterData: true, subtree: true })
  }
})

onBeforeUnmount(() => {
  const container = containerRef.value
  if (container) {
    container.removeEventListener('focusin', onTerminalFocusIn)
    container.removeEventListener('focusout', onTerminalFocusOut)
  }
  notifyTerminalFocus(false)
  if (themeObserver) {
    themeObserver.disconnect()
    themeObserver = null
  }
  if (unregisterDataListener) {
    unregisterDataListener()
    unregisterDataListener = null
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (term) {
    term.dispose()
    term = null
  }
})

defineExpose({
  focus: () => term?.focus(),
  fit: () => fitAddon?.fit(),
  toggleSearch: () => {
    showSearch.value = !showSearch.value
  },
  clear: () => term?.clear()
})
</script>

<style scoped>
.terminal-canvas-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background-color: var(--editorBgColor, #1e1e1e);
}

.terminal-xterm-host {
  flex: 1;
  width: 100%;
  height: 100%;
  padding: 6px 10px;
  box-sizing: border-box;
  background-color: transparent;
}

.terminal-search-bar {
  position: absolute;
  top: 8px;
  right: 20px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--floatBgColor, #2d3139);
  border: 1px solid var(--floatBorderColor, #4b5263);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.terminal-search-bar :deep(.el-input) {
  width: 200px;
}

.terminal-disconnected-overlay {
  position: absolute;
  bottom: 16px;
  right: 20px;
  z-index: 10;
  pointer-events: auto;
}

.disconnected-card {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: var(--floatBgColor, #2d3139);
  border: 1px solid var(--floatBorderColor, #4b5263);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.status-dot.error {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f56c6c;
  box-shadow: 0 0 6px #f56c6c;
  flex-shrink: 0;
}

.status-msg {
  color: var(--editorColor, #e0e0e0);
  font-size: 13px;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
