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
    const isCopy =
      (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key === 'c') ||
      (event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey && (event.key === 'C' || event.key === 'c'))
    if (isCopy && event.type === 'keydown') {
      const selection = term?.getSelection()
      if (selection) {
        window.electron.clipboard.writeText(selection)
        return false
      }
    }

    const isPaste =
      (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key === 'v') ||
      (event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey && (event.key === 'V' || event.key === 'v'))
    if (isPaste && event.type === 'keydown') {
      const text = window.electron.clipboard.readText()
      if (text) {
        terminalStore.write(props.session.id, text)
        return false
      }
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

function openContextMenu(_e: MouseEvent): void {
  // Can trigger Electron popup context menu or clipboard actions
  const selection = term?.getSelection()
  if (selection) {
    window.electron.clipboard.writeText(selection)
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
    if (active && fitAddon && term) {
      nextTick(() => {
        try {
          fitAddon?.fit()
          term?.focus()
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

onMounted(() => {
  initTerminal()

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
