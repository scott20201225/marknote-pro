<template>
  <div class="normal-code-container">
    <div ref="containerRef" class="normal-code-editor" />
    <editor-search />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, markRaw, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import codeMirror from '../../codeMirror'
import EditorSearch from '../search/index.vue'
import { CodeMirrorSearchManager } from '../../codeMirror/cmSearch'
import { wordCount as getWordCount } from '@muyajs/core'
import bus from '../../bus'
import { oneDarkThemes, railscastsThemes } from '@/config'
import { CODE_AND_TEXT_EXTENSIONS_MAP } from '@/util/noteWorkspace'
import { getOptionsFromState } from '@/store/help'
import { debouncedSendBufferedState } from '@/store/bufferedState'
import type { IFileState } from '@shared/types/files'

type CMInstance = any

const props = defineProps<{
  file: IFileState
}>()

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

const containerRef = ref<HTMLDivElement | null>(null)
const editor = ref<CMInstance>(null)
const searchManager = ref<CodeMirrorSearchManager | null>(null)
let resizeObserver: ResizeObserver | null = null
let isInitialized = false
let cleanGeneration: number | undefined = undefined

const handleSearchValue = (payload: unknown) => {
  if (editorStore.currentFile?.id !== props.file.id || !searchManager.value) return
  const { value, opt } = payload as { value: string; opt: any }
  searchManager.value.search(value, opt)
}

const handleReplaceValue = (payload: unknown) => {
  if (editorStore.currentFile?.id !== props.file.id || !searchManager.value) return
  const { value, opt } = payload as { value: string; opt: any }
  searchManager.value.replace(value, opt)
}

const handleFindAction = (action: unknown) => {
  if (editorStore.currentFile?.id !== props.file.id || !searchManager.value) return
  const normalizedAction =
    action === 'next' ? 'next' : action === 'prev' || action === 'previous' ? 'previous' : null
  if (!normalizedAction) return
  searchManager.value.find(normalizedAction)
}

const { theme } = storeToRefs(preferencesStore)
const { currentFile } = storeToRefs(editorStore)

const getCodeMirrorModeForPath = (pathname?: string): { mode: string; mime?: string } => {
  if (!pathname) return { mode: 'null', mime: 'text/plain' }
  const base = pathname.split(/[/\\]/).pop() || ''
  const lower = base.toLowerCase()
  if (lower === '.env') return { mode: 'shell', mime: 'text/x-sh' }
  const dotIndex = lower.lastIndexOf('.')
  if (dotIndex === -1) return { mode: 'null', mime: 'text/plain' }
  const ext = lower.slice(dotIndex + 1)
  const mapped = CODE_AND_TEXT_EXTENSIONS_MAP[ext]
  if (!mapped) return { mode: 'null', mime: 'text/plain' }
  switch (mapped) {
    case 'text':
      return { mode: 'null', mime: 'text/plain' }
    case 'json':
      return { mode: 'javascript', mime: 'application/json' }
    case 'yaml':
      return { mode: 'yaml', mime: 'text/x-yaml' }
    case 'xml':
      return { mode: 'xml', mime: 'application/xml' }
    case 'toml':
      return { mode: 'toml', mime: 'text/x-toml' }
    case 'ini':
      return { mode: 'properties', mime: 'text/x-properties' }
    case 'shell':
      return { mode: 'shell', mime: 'text/x-sh' }
    case 'sql':
      return { mode: 'sql', mime: 'text/x-sql' }
    case 'powershell':
      return { mode: 'powershell', mime: 'application/x-powershell' }
    case 'html':
      return { mode: 'htmlmixed', mime: 'text/html' }
    case 'css':
      return { mode: 'css', mime: 'text/css' }
    case 'python':
      return { mode: 'python', mime: 'text/x-python' }
    case 'javascript':
      return ext === 'ts'
        ? { mode: 'javascript', mime: 'application/typescript' }
        : { mode: 'javascript', mime: 'text/javascript' }
    case 'typescript':
      return { mode: 'javascript', mime: 'application/typescript' }
    case 'bat':
      return { mode: 'shell', mime: 'text/x-sh' }
    default:
      return { mode: 'null', mime: 'text/plain' }
  }
}

const getThemeName = (currentTheme: string) => {
  if (railscastsThemes.includes(currentTheme)) {
    return 'railscasts'
  }
  if (oneDarkThemes.includes(currentTheme)) {
    return 'one-dark'
  }
  return 'default'
}

const handleUndo = () => {
  if (currentFile.value?.id === props.file.id && editor.value) {
    editor.value.execCommand('undo')
  }
}

const handleRedo = () => {
  if (currentFile.value?.id === props.file.id && editor.value) {
    editor.value.execCommand('redo')
  }
}

const handleSelectAll = () => {
  if (currentFile.value?.id === props.file.id && editor.value) {
    editor.value.execCommand('selectAll')
  }
}

watch(
  () => props.file.markdown,
  (newMarkdown) => {
    if (editor.value && typeof newMarkdown === 'string' && newMarkdown !== editor.value.getValue()) {
      editor.value.setValue(newMarkdown)
      searchManager.value?.refresh()
    }
  }
)

onMounted(() => {
  const container = containerRef.value
  if (!container || !props.file) return

  const modeSpec = getCodeMirrorModeForPath(props.file.pathname)
  const initialValue = props.file.markdown ?? ''

  const codeMirrorConfig: Record<string, unknown> = {
    value: initialValue,
    lineNumbers: true,
    autofocus: true,
    lineWrapping: true,
    styleActiveLine: true,
    viewportMargin: 50,
    indentUnit: 2,
    tabSize: 2,
    theme: getThemeName(theme.value),
    extraKeys: {
      'Cmd-F': () => bus.emit('find', 'find'),
      'Ctrl-F': () => bus.emit('find', 'find'),
      'Cmd-Alt-F': () => bus.emit('replace', 'replace'),
      'Ctrl-H': () => bus.emit('replace', 'replace'),
      'Shift-Cmd-F': () => bus.emit('findInFolder', 'findInFolder'),
      'Shift-Ctrl-F': () => bus.emit('findInFolder', 'findInFolder'),
      'Cmd-G': () => bus.emit('findNext', 'findNext'),
      'Ctrl-G': () => bus.emit('findNext', 'findNext'),
      'Shift-Cmd-G': () => bus.emit('findPrev', 'findPrev'),
      'Shift-Ctrl-G': () => bus.emit('findPrev', 'findPrev'),
      Esc: (cm: any) => {
        bus.emit('search-blur')
        cm.focus()
      }
    }
  }

  const cm = markRaw(codeMirror(container, codeMirrorConfig))
  editor.value = cm

  // Set mode
  if (modeSpec.mode !== 'null') {
    codeMirror.autoLoadMode(cm, modeSpec.mode)
  }
  cm.setOption('mode', modeSpec.mime || modeSpec.mode)

  // Restore undo/redo history if exists
  if (props.file.codeMirrorState?.history) {
    try {
      cm.getDoc().setHistory(props.file.codeMirrorState.history)
    } catch (e) {
      console.warn('Failed to restore CodeMirror history:', e)
    }
  }

  // Restore clean state tracking
  if (props.file.isSaved) {
    cleanGeneration = cm.getDoc().changeGeneration(true)
    if (props.file.codeMirrorState) {
      props.file.codeMirrorState.cleanGeneration = cleanGeneration
    }
  } else if (typeof props.file.codeMirrorState?.cleanGeneration === 'number') {
    cleanGeneration = props.file.codeMirrorState.cleanGeneration
  }

  // Restore cursor and scroll
  if (props.file.cursor) {
    try {
      cm.setCursor(props.file.cursor)
    } catch {
      // ignore
    }
  }
  if (typeof props.file.scrollTop === 'number') {
    const scroller = cm.getScrollerElement?.()
    if (scroller) {
      scroller.scrollTop = props.file.scrollTop
    }
  }

  cm.on('contextmenu', (_cm: CMInstance, event: Event) => {
    event.preventDefault()
    event.stopPropagation()
  })

  cm.on('change', (_instance: CMInstance, changeObj: any) => {
    if (!isInitialized) return
    if (changeObj && changeObj.origin === 'setValue') return

    const value = cm.getValue()
    props.file.markdown = value

    const isClean = cleanGeneration != null ? cm.getDoc().isClean(cleanGeneration) : false
    if (isClean) {
      props.file.isSaved = true
      if (props.file.codeMirrorState) {
        props.file.codeMirrorState.isSaved = true
        props.file.codeMirrorState.text = value
      }
    } else {
      props.file.isSaved = false
      if (props.file.codeMirrorState) {
        props.file.codeMirrorState.isSaved = false
        props.file.codeMirrorState.text = value
      }
      // Auto save trigger
      if (preferencesStore.autoSave && props.file.pathname) {
        editorStore.HANDLE_AUTO_SAVE({
          id: props.file.id,
          filename: props.file.filename,
          pathname: props.file.pathname,
          markdown: value,
          options: getOptionsFromState(props.file)
        })
      }
    }

    const wc = getWordCount(value)
    props.file.wordCount = {
      paragraph: wc.paragraph,
      word: wc.word,
      character: wc.character,
      all: wc.all
    }

    debouncedSendBufferedState()
  })

  cm.on('cursorActivity', (instance: CMInstance) => {
    if (!isInitialized) return
    const cur = instance.getCursor()
    props.file.cursor = cur
    const scroller = instance.getScrollerElement?.()
    if (scroller) {
      props.file.scrollTop = scroller.scrollTop
    }
    if (props.file.codeMirrorState) {
      props.file.codeMirrorState.cursor = cur
      if (scroller) {
        props.file.codeMirrorState.scrollTop = scroller.scrollTop
      }
    }
  })

  cm.on('scroll', (instance: CMInstance) => {
    if (!isInitialized) return
    const scroller = instance.getScrollerElement?.()
    if (scroller) {
      props.file.scrollTop = scroller.scrollTop
      if (props.file.codeMirrorState) {
        props.file.codeMirrorState.scrollTop = scroller.scrollTop
      }
    }
  })

  // Watch for external save (e.g. Cmd+S or auto-save completed)
  watch(
    () => props.file.isSaved,
    (saved) => {
      if (saved && editor.value) {
        cleanGeneration = editor.value.getDoc().changeGeneration(true)
        if (props.file.codeMirrorState) {
          props.file.codeMirrorState.cleanGeneration = cleanGeneration
          props.file.codeMirrorState.isSaved = true
        }
      }
    }
  )

  watch(
    theme,
    (newTheme) => {
      if (!editor.value) return
      editor.value.setOption('theme', getThemeName(newTheme))
    }
  )

  searchManager.value = new CodeMirrorSearchManager(cm, editorStore)

  bus.on('undo', handleUndo)
  bus.on('redo', handleRedo)
  bus.on('selectAll', handleSelectAll)
  bus.on('searchValue', handleSearchValue)
  bus.on('replaceValue', handleReplaceValue)
  bus.on('find-action', handleFindAction)

  // Auto refresh on container resize
  if (window.ResizeObserver) {
    resizeObserver = new ResizeObserver(() => {
      if (editor.value) {
        editor.value.refresh()
      }
    })
    resizeObserver.observe(container)
  }

  nextTick(() => {
    cm.refresh()
    cm.focus()
    isInitialized = true
  })
})

onBeforeUnmount(() => {
  bus.off('undo', handleUndo)
  bus.off('redo', handleRedo)
  bus.off('selectAll', handleSelectAll)
  bus.off('searchValue', handleSearchValue)
  bus.off('replaceValue', handleReplaceValue)
  bus.off('find-action', handleFindAction)

  searchManager.value?.destroy()
  searchManager.value = null

  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  if (editor.value) {
    const cm = editor.value
    const val = cm.getValue()
    props.file.markdown = val
    const cur = cm.getCursor()
    props.file.cursor = cur
    const scroller = cm.getScrollerElement?.()
    if (scroller) {
      props.file.scrollTop = scroller.scrollTop
    }
    if (props.file.codeMirrorState) {
      props.file.codeMirrorState.text = val
      props.file.codeMirrorState.cursor = cur
      if (scroller) {
        props.file.codeMirrorState.scrollTop = scroller.scrollTop
      }
      props.file.codeMirrorState.history = cm.getDoc().getHistory()
      props.file.codeMirrorState.cleanGeneration = cleanGeneration
      props.file.codeMirrorState.isSaved = props.file.isSaved
    }
    editor.value = null
  }
})
</script>

<style>
.normal-code-container {
  position: relative;
  width: 100%;
  height: calc(100vh - var(--titleBarHeight));
  box-sizing: border-box;
  overflow: hidden;
  background: var(--editorBgColor);
  flex: 1;
  display: flex;
  flex-direction: column;
}

.normal-code-editor {
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--editorBgColor);
  color: var(--editorColor);
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
}

.normal-code-editor .CodeMirror {
  height: 100%;
  font-family: var(--codeFontFamily, monospace);
  font-size: var(--codeFontSize, 14px);
  line-height: 1.6;
  background: transparent;
  flex: 1;
}

.normal-code-editor .CodeMirror-gutters {
  border-right: 1px solid var(--borderColor, #333);
  background-color: var(--sideBarBgColor, transparent);
}

.normal-code-editor .CodeMirror-linenumber {
  padding: 0 8px;
  color: var(--sideBarTitleColor, #888);
}
</style>
