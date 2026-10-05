<template>
  <git-desktop v-if="workbench === 'git'" />
  <div
    v-else
    class="editor-container"
    :class="{
      'drawio-open': currentFile?.isDrawing === true,
      'geogebra-open': currentFile?.isGeoGebra === true,
      'mindmap-open': currentFile?.isMindMap === true,
      'kdbx-open': currentFile?.isKdbx === true
    }"
  >
    <side-bar v-if="init" />

    <div class="editor-middle">
      <title-bar
        :project="projectTree"
        :pathname="pathname"
        :filename="filename"
        :active="windowActive"
        :word-count="drawioFile || geogebraFile || mindMapFile || currentFile?.isKdbx ? null : wordCount"
        :platform="platform"
        :is-saved="isSaved"
      />

      <div v-if="!init" class="editor-placeholder" />
      <div
        v-if="init"
        class="editor-tab-shell"
        :class="{ 'has-tab-scroll-controls': tabScrollState.show }"
      >
        <button
          v-if="tabScrollState.show"
          class="editor-tab-scroll-button editor-tab-scroll-button-left"
          type="button"
          :disabled="!tabScrollState.canLeft"
          @click="scrollEditorTabs('left')"
        >
          <el-icon :size="14">
            <ArrowLeft />
          </el-icon>
        </button>
        <tabs ref="tabsRef" @scroll-state-change="updateTabScrollState" />
        <button
          v-if="tabScrollState.show"
          class="editor-tab-scroll-button editor-tab-scroll-button-right"
          type="button"
          :disabled="!tabScrollState.canRight"
          @click="scrollEditorTabs('right')"
        >
          <el-icon :size="14">
            <ArrowRight />
          </el-icon>
        </button>
      </div>
      <recent
        v-if="!hasCurrentFile && init && !currentFile?.isDrawing && !currentFile?.isGeoGebra && !currentFile?.isMindMap && !currentFile?.isKdbx"
      />
      <editor-with-tabs
        v-if="hasCurrentFile && init && !currentFile?.isDrawing && !currentFile?.isGeoGebra && !currentFile?.isMindMap && !currentFile?.isKdbx"
        :markdown="markdown"
        :cursor="cursor"
        :muya-index-cursor="muyaIndexCursor"
        :source-code="sourceCode"
        :text-direction="textDirection"
        :platform="platform"
      />
      <!-- Keep Drawio mounted so its BrowserViews survive tab switches, but
           never let its absolute surface cover the Markdown editor. -->
      <drawio v-if="init" v-show="currentFile?.isDrawing === true" />
      <geogebra v-if="init" v-show="currentFile?.isGeoGebra === true" />
      <mind-map v-if="init" v-show="currentFile?.isMindMap === true" />
      <kdbx v-if="init && currentFile?.isKdbx === true" />
      <kdbx-create-dialog />
      <command-palette />
      <export-setting-dialog />
      <move-node-dialog />
      <rename />
      <import-modal />
    </div>
  </div>
  <about-dialog />
</template>

<script setup lang="ts">
import { computed, watch, nextTick, onMounted, onBeforeUnmount, ref } from 'vue'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { useMainStore } from '@/store'
import { storeToRefs } from 'pinia'
import { addStyles, addThemeStyle, addCustomStyle, type AddStylesOptions } from '@/util/theme'
import { getGeoGebraConfiguration } from '@/util/geogebraConfiguration'
import Recent from '@/components/recent/index.vue'
import EditorWithTabs from '@/components/editorWithTabs/index.vue'
import Tabs from '@/components/editorWithTabs/tabs.vue'
import TitleBar from '@/components/titleBar/index.vue'
import SideBar from '@/components/sideBar/index.vue'
import AboutDialog from '@/components/about/index.vue'
import CommandPalette from '@/components/commandPalette/index.vue'
import ExportSettingDialog from '@/components/exportSettings/index.vue'
import MoveNodeDialog from '@/components/moveNode/index.vue'
import Rename from '@/components/rename/index.vue'
import ImportModal from '@/components/import/index.vue'
import GitDesktop from '@/components/gitDesktop/index.vue'
import Drawio from '@/components/drawio/index.vue'
import Geogebra from '@/components/geogebra/index.vue'
import MindMap from '@/components/mindmap/index.vue'
import Kdbx from '@/components/kdbx/index.vue'
import KdbxCreateDialog from '@/components/kdbx/createDialog.vue'
import bus from '@/bus'
import { DEFAULT_STYLE } from '@/config'
import { useLayoutStore } from '@/store/layout'
import { useListenForMainStore } from '@/store/listenForMain'
import { usePreferencesStore } from '@/store/preferences'
import { useEditorStore } from '@/store/editor'
import { useCommandCenterStore } from '@/store/commandCenter'
import { useProjectStore } from '@/store/project'
import { useAutoUpdatesStore } from '@/store/autoUpdates'
import { useNotificationStore } from '@/store/notification'
import { useHostOverlayStore } from '@/store/overlay'
import { getDrawioConfiguration } from '@/util/drawioConfiguration'
import { getMindMapConfiguration } from '@/util/mindmapConfiguration'
import { isNoteAreaName, findNoteFolderByPath, getNoteNodeKind } from '@/util/noteWorkspace'
import type { GeoGebraMode } from '@shared/types/files'

const mainStore = useMainStore()
const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()
const projectStore = useProjectStore()
const listenForMainStore = useListenForMainStore()
const autoUpdateStore = useAutoUpdatesStore()
const commandCenterStore = useCommandCenterStore()
const notificationStore = useNotificationStore()
const hostOverlayStore = useHostOverlayStore()

const timer = ref<ReturnType<typeof setTimeout> | null>(null)
const workspacePrompted = ref(false)
const tabsRef = ref<{ scrollTabs: (direction: 'left' | 'right') => void } | null>(null)
const tabScrollState = ref({
  show: false,
  canLeft: false,
  canRight: false
})
const workbench = ref<'note' | 'git'>('note')
const drawioFile = ref<{ filePath: string; title: string } | null>(null)
const geogebraFile = ref<{ filePath: string; title: string; mode: GeoGebraMode } | null>(null)
const mindMapFile = ref<{ filePath: string; title: string } | null>(null)
const lastGestureScale = ref(1)

const { windowActive, platform, init } = storeToRefs(mainStore)
const { sourceCode, theme, customCss, textDirection, language } = storeToRefs(preferencesStore)
const { projectTree, moveDialogVisible } = storeToRefs(projectStore)
const { currentFile } = storeToRefs(editorStore)
const { hasOverlay } = storeToRefs(hostOverlayStore)

const pathname = computed(() => currentFile.value?.pathname)
const filename = computed(() => currentFile.value?.filename)
const isSaved = computed(() => currentFile.value?.isSaved)
// `markdown` is read by `<editor-with-tabs>` whose prop is `required: true`.
// In template space we render that subtree only when `hasCurrentFile` is set,
// but vue-tsc can't see through the v-if guard — coalesce to '' so the prop
// type is `string`. The `<editor-with-tabs>` mount is still gated.
const markdown = computed<string>(() => currentFile.value?.markdown ?? '')
const cursor = computed(() => currentFile.value?.cursor)
const wordCount = computed(() => currentFile.value?.wordCount)
// `muyaIndexCursor` is loosely typed as `unknown` on the editor store; the
// downstream prop expects `Object | undefined`. Cast at the boundary.
const muyaIndexCursor = computed<Record<string, unknown> | undefined>(
  () => currentFile.value?.muyaIndexCursor as Record<string, unknown> | undefined
)

const hasCurrentFile = computed<boolean>(() => {
  return (
    currentFile.value?.markdown !== undefined &&
    !currentFile.value?.isDrawing &&
    !currentFile.value?.isGeoGebra &&
    !currentFile.value?.isMindMap &&
    !currentFile.value?.isKdbx
  )
})

const workspaceSelectionRequired = computed<boolean>(() => {
  return (
    init.value &&
    preferencesStore.preferenceLoaded &&
    !preferencesStore.defaultDirectoryToOpen &&
    !projectTree.value
  )
})

const updateTabScrollState = (state: { show: boolean; canLeft: boolean; canRight: boolean }) => {
  tabScrollState.value = state
}

const scrollEditorTabs = (direction: 'left' | 'right') => {
  tabsRef.value?.scrollTabs(direction)
}

const applyWindowZoomDelta = (direction: 'in' | 'out'): void => {
  window.electron.ipcRenderer.send('mt::window-zoom-delta', direction)
}

const hasZoomModifier = (event: KeyboardEvent | WheelEvent): boolean => {
  return platform.value === 'darwin' ? event.metaKey : event.ctrlKey
}

const handleWindowZoomWheel = (event: WheelEvent): void => {
  if (!hasZoomModifier(event) && !event.ctrlKey) return

  event.preventDefault()
  applyWindowZoomDelta(event.deltaY < 0 ? 'in' : 'out')
}

const handleWindowZoomGestureStart = (event: Event): void => {
  const gestureEvent = event as Event & { scale?: number }
  lastGestureScale.value = gestureEvent.scale ?? 1
}

const handleWindowZoomGestureChange = (event: Event): void => {
  const gestureEvent = event as Event & { scale?: number }
  const scale = gestureEvent.scale ?? 1
  const diff = scale - lastGestureScale.value
  if (Math.abs(diff) < 0.03) return

  event.preventDefault()
  applyWindowZoomDelta(diff > 0 ? 'in' : 'out')
  lastGestureScale.value = scale
}

const handleWorkbenchSwitch = (event: Event): void => {
  const target = (event as CustomEvent).detail
  if (target === 'note' || target === 'git') {
    workbench.value = target
    if (target !== 'note') {
      drawioFile.value = null
      geogebraFile.value = null
      mindMapFile.value = null
      window.electron.ipcRenderer.send('mt::drawio::hide')
      window.electron.ipcRenderer.send('mt::geogebra::hide')
      window.electron.ipcRenderer.send('mt::mindmap::hide')
    }
  }
}

const openDrawio = (_event: unknown, payload: { filePath: string; title: string }): void => {
  editorStore.OPEN_DRAWIO_TAB(payload)
  drawioFile.value = payload
}

const openGeoGebra = (
  _event: unknown,
  payload: { filePath: string; title: string; mode: GeoGebraMode }
): void => {
  editorStore.OPEN_GEOGEBRA_TAB(payload)
  geogebraFile.value = payload
}

const openMindMap = (_event: unknown, payload: { filePath: string; title: string }): void => {
  mindMapFile.value = payload
  editorStore.OPEN_MINDMAP_TAB(payload)
  if (payload?.filePath) {
    projectStore.SELECT_NOTE_PATH(window.path.dirname(payload.filePath))
  }
}

const openKdbx = (_event: unknown, payload: { filePath: string; title: string }): void => {
  editorStore.OPEN_KDBX_TAB(payload)
  if (payload.filePath) projectStore.SELECT_NOTE_PATH(window.path.dirname(payload.filePath))
}

const closeDrawio = (_event: unknown, payload?: { filePath?: string }): void => {
  if (payload?.filePath && payload.filePath !== currentFile.value?.pathname) return
  drawioFile.value = null
  if (currentFile.value?.isDrawing) {
    editorStore.FORCE_CLOSE_TAB(currentFile.value)
  }
}

const closeGeoGebra = (_event: unknown, payload?: { filePath?: string }): void => {
  if (payload?.filePath && payload.filePath !== currentFile.value?.pathname) return
  geogebraFile.value = null
  if (currentFile.value?.isGeoGebra) {
    editorStore.FORCE_CLOSE_TAB(currentFile.value)
  }
}

const closeMindMap = (_event: unknown, payload?: { filePath?: string }): void => {
  if (payload?.filePath && payload.filePath !== currentFile.value?.pathname) return
  mindMapFile.value = null
  if (currentFile.value?.isMindMap) {
    editorStore.FORCE_CLOSE_TAB(currentFile.value)
  }
}

// Watchers
watch(theme, (value, oldValue) => {
  if (value !== oldValue) {
    addThemeStyle(value)
  }
})

watch(customCss, (value, oldValue) => {
  if (value !== oldValue) {
    addCustomStyle({
      customCss: value
    })
  }
})

watch(
  [language, theme, () => preferencesStore.preferenceLoaded],
  ([value, _theme, preferenceLoaded]) => {
    if (!preferenceLoaded || !value) return
    nextTick(() => {
      void window.electron.ipcRenderer.invoke('mt::geogebra::configure', getGeoGebraConfiguration())
      void window.electron.ipcRenderer.invoke('mt::mindmap::configure', getMindMapConfiguration())
    })
  }
)

watch([currentFile, () => preferencesStore.preferenceLoaded], ([file, preferenceLoaded]) => {
  window.electron.ipcRenderer.send('mt::drawio-menu-mode', !!file?.isDrawing)
  window.electron.ipcRenderer.send('mt::geogebra-menu-mode', !!file?.isGeoGebra)
  window.electron.ipcRenderer.send('mt::mindmap-menu-mode', !!file?.isMindMap)
  window.electron.ipcRenderer.send('mt::kdbx-menu-mode', !!file?.isKdbx)
  if (file?.isDrawing) {
    // Both editors use independent native BrowserViews. Remove GeoGebra
    // before attaching Draw.io so it can never cover the sidebar or canvas.
    geogebraFile.value = null
    window.electron.ipcRenderer.send('mt::geogebra::hide')
    mindMapFile.value = null
    window.electron.ipcRenderer.send('mt::mindmap::hide')
    // A restored drawing tab can become current before persisted preferences
    // finish loading. Wait for them so the first frame URL is never built from
    // the default language/theme.
    if (!preferenceLoaded) return
    if (drawioFile.value?.filePath !== file.pathname) {
      void window.electron.ipcRenderer.invoke(
        'mt::drawio::open',
        file.pathname,
        getDrawioConfiguration()
      )
    }
    return
  }

  if (file?.isGeoGebra) {
    // Mirror the Draw.io branch: native BrowserViews are not controlled by
    // Vue's v-show and must be explicitly removed before the other opens.
    drawioFile.value = null
    window.electron.ipcRenderer.send('mt::drawio::hide')
    mindMapFile.value = null
    window.electron.ipcRenderer.send('mt::mindmap::hide')
    if (!preferenceLoaded) return
    if (geogebraFile.value?.filePath !== file.pathname) {
      const openRequest = file.geoGebraMode
        ? window.electron.ipcRenderer.invoke(
            'mt::geogebra::open',
            file.pathname,
            file.geoGebraMode,
            getGeoGebraConfiguration()
          )
        : window.electron.ipcRenderer.invoke(
            'mt::geogebra::open',
            file.pathname,
            undefined,
            getGeoGebraConfiguration()
          )
      void openRequest
    }
    return
  }

  if (file?.isMindMap) {
    drawioFile.value = null
    window.electron.ipcRenderer.send('mt::drawio::hide')
    geogebraFile.value = null
    window.electron.ipcRenderer.send('mt::geogebra::hide')
    if (!preferenceLoaded) return
    if (mindMapFile.value?.filePath !== file.pathname) {
      void window.electron.ipcRenderer.invoke(
        'mt::mindmap::open',
        file.pathname,
        getMindMapConfiguration()
      )
    }
    return
  }

  if (file?.isKdbx) {
    drawioFile.value = null
    geogebraFile.value = null
    mindMapFile.value = null
    window.electron.ipcRenderer.send('mt::drawio::hide')
    window.electron.ipcRenderer.send('mt::geogebra::hide')
    window.electron.ipcRenderer.send('mt::mindmap::hide')
    void window.electron.ipcRenderer.invoke('mt::kdbx::open', file.pathname)
    return
  }

  // Native Draw.io/GeoGebra/MindMap BrowserViews are independent of v-show. Always
  // hide all overlays when the active tab becomes Markdown or empty.
  drawioFile.value = null
  window.electron.ipcRenderer.send('mt::drawio::hide')
  geogebraFile.value = null
  window.electron.ipcRenderer.send('mt::geogebra::hide')
  mindMapFile.value = null
  window.electron.ipcRenderer.send('mt::mindmap::hide')
})

// Native BrowserViews always sit above the renderer's DOM. Temporarily remove
// them while any host overlay (dialog, modal, notification popup) is open,
// then let the active editor restore itself with its own measured bounds
// after all overlays are dismissed.
watch(
  moveDialogVisible,
  (visible) => {
    if (visible) hostOverlayStore.showOverlay('move-node-dialog')
    else hostOverlayStore.hideOverlay('move-node-dialog')
  },
  { immediate: true }
)

let overlaySnapshotToken = 0

watch(hasOverlay, async (visible, wasVisible) => {
  const currentToken = ++overlaySnapshotToken
  if (visible) {
    let snapshot: string | null = null
    let surfaceSelector = ''
    if (workbench.value === 'git') {
      surfaceSelector = '.github-desktop-surface'
      snapshot = await window.electron.ipcRenderer
        .invoke('mt::github-desktop::capture-snapshot')
        .catch(() => null)
    } else if (currentFile.value?.isMindMap) {
      surfaceSelector = '.mindmap-surface'
      snapshot = await window.electron.ipcRenderer
        .invoke('mt::mindmap::capture-snapshot')
        .catch(() => null)
    } else if (currentFile.value?.isGeoGebra) {
      surfaceSelector = '.geogebra-surface'
      snapshot = await window.electron.ipcRenderer
        .invoke('mt::geogebra::capture-snapshot')
        .catch(() => null)
    } else if (currentFile.value?.isDrawing) {
      surfaceSelector = '.drawio-surface'
      snapshot = await window.electron.ipcRenderer
        .invoke('mt::drawio::capture-snapshot')
        .catch(() => null)
    }

    if (currentToken !== overlaySnapshotToken || !hostOverlayStore.hasOverlay) {
      return
    }

    if (snapshot && surfaceSelector) {
      const surface = document.querySelector<HTMLElement>(surfaceSelector)
      if (surface) {
        surface.style.backgroundImage = `url(${snapshot})`
        surface.style.backgroundPosition = 'top left'
        surface.style.backgroundSize = '100% 100%'
        surface.style.backgroundRepeat = 'no-repeat'
      }
    }

    window.electron.ipcRenderer.send('mt::drawio::hide')
    window.electron.ipcRenderer.send('mt::geogebra::hide')
    window.electron.ipcRenderer.send('mt::mindmap::hide')
    window.electron.ipcRenderer.send('mt::github-desktop::hide')
    return
  }
  if (wasVisible) {
    nextTick(() => {
      window.dispatchEvent(new Event('marknotepro:resume-native-editor'))
      window.dispatchEvent(new Event('marktextpro:resume-native-editor'))
      window.requestAnimationFrame(() => {
        const surfaces = document.querySelectorAll<HTMLElement>(
          '.mindmap-surface, .geogebra-surface, .drawio-surface, .github-desktop-surface'
        )
        surfaces.forEach((el) => {
          el.style.backgroundImage = ''
        })
      })
    })
  }
})

watch(
  workspaceSelectionRequired,
  (required) => {
    if (!required) {
      workspacePrompted.value = false
      return
    }

    if (workspacePrompted.value) return
    workspacePrompted.value = true
    nextTick(() => {
      projectStore.ASK_FOR_OPEN_PROJECT()
    })
  },
  { immediate: true }
)

const setupDragDropHandler = (): void => {
  window.addEventListener(
    'dragover',
    (e: DragEvent) => {
      if (!e.dataTransfer || !e.dataTransfer.types.length) return

      if (e.dataTransfer.types.indexOf('Files') >= 0) {
        if (
          e.dataTransfer.items.length === 1 &&
          e.dataTransfer.items[0]!.type.indexOf('image') > -1
        ) {
          // Do nothing
        } else {
          e.preventDefault()
          if (timer.value) {
            clearTimeout(timer.value)
          }
          timer.value = setTimeout(() => {
            bus.emit('importDialog', false)
          }, 300)
          bus.emit('importDialog', true)
        }
        e.dataTransfer.dropEffect = 'copy'
      } else if (e.dataTransfer.types.indexOf('text/uri-list') >= 0) {
        // A web-link / web-image drag (e.g. an <img> dragged from a browser).
        // The muya editor's own dragover/drop handlers accept these and insert
        // an image block, so leave the drop enabled — forcing dropEffect='none'
        // here would clobber the editor's 'copy' and suppress the drop event.
      } else {
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'none'
      }
    },
    false
  )
}
onMounted(() => {
  window.addEventListener('marknotepro:switch-workbench', handleWorkbenchSwitch)
  window.electron.ipcRenderer.on('mt::drawio::opened', openDrawio)
  window.electron.ipcRenderer.on('mt::drawio::closed', closeDrawio)
  window.electron.ipcRenderer.on('mt::geogebra::opened', openGeoGebra)
  window.electron.ipcRenderer.on('mt::geogebra::closed', closeGeoGebra)
  window.electron.ipcRenderer.on('mt::mindmap::opened', openMindMap)
  window.electron.ipcRenderer.on('mt::kdbx::opened', openKdbx)
  window.electron.ipcRenderer.on('mt::mindmap::closed', closeMindMap)
  window.electron.ipcRenderer.on('mt::drawio::autosave-changed', (_event, enabled) => {
    window.electron.ipcRenderer.send('mt::drawio-autosave-changed', enabled)
  })
  window.electron.ipcRenderer.send('mt::drawio-menu-mode', !!currentFile.value?.isDrawing)
  window.electron.ipcRenderer.send('mt::geogebra-menu-mode', !!currentFile.value?.isGeoGebra)
  window.electron.ipcRenderer.send('mt::mindmap-menu-mode', !!currentFile.value?.isMindMap)
  window.electron.ipcRenderer.send('mt::kdbx-menu-mode', !!currentFile.value?.isKdbx)
  window.addEventListener('wheel', handleWindowZoomWheel, { capture: true, passive: false })
  window.addEventListener('gesturestart', handleWindowZoomGestureStart)
  window.addEventListener('gesturechange', handleWindowZoomGestureChange)

  if (window.marknotepro?.initialState) {
    preferencesStore.SET_USER_PREFERENCE(window.marknotepro.initialState)
  }

  ;(window as unknown as { getTargetPartitionDir?: () => string | null }).getTargetPartitionDir = () => {
    const rootPath = projectStore.projectTree?.pathname
      ? window.path.normalize(projectStore.projectTree.pathname)
      : null
    if (!rootPath) return null

    const isAreaPath = (targetPath: string | null | undefined): boolean => {
      if (!targetPath) return false
      const normalized = window.path.normalize(targetPath)
      if (normalized === rootPath) return false
      const isChild =
        typeof window.fileUtils?.isChildOfDirectory === 'function'
          ? window.fileUtils.isChildOfDirectory(rootPath, normalized)
          : normalized.startsWith(rootPath) && normalized !== rootPath
      if (!isChild) return false

      const folder = findNoteFolderByPath(projectStore.projectTree, normalized)
      if (folder) {
        return getNoteNodeKind(folder, rootPath) === 'area'
      }
      return isNoteAreaName(window.path.basename(normalized))
    }

    // 1. 优先检查侧边栏当前激活项（用户点击的目录或文件）
    const activeItem = projectStore.activeItem
    if (activeItem?.pathname) {
      const activePath = window.path.normalize(activeItem.pathname)
      if (activeItem.isDirectory) {
        if (isAreaPath(activePath)) return activePath
        // 用户明确点击了非分区目录（如根目录、分区组、附件等），视为未选定分区
        return null
      } else {
        const parentDir = window.path.dirname(activePath)
        if (isAreaPath(parentDir)) return parentDir
        return null
      }
    }

    // 2. 检查当前选中的笔记/分区路径
    const selectedPath = projectStore.selectedNotePath
    if (selectedPath) {
      const normalizedSelected = window.path.normalize(selectedPath)
      if (isAreaPath(normalizedSelected)) return normalizedSelected
      const parentDir = window.path.dirname(normalizedSelected)
      if (isAreaPath(parentDir)) return parentDir
      return null
    }

    // 3. 回退检查当前打开的思维导图/文档所在目录是否属于分区
    if (currentFile.value?.pathname) {
      const parentDir = window.path.dirname(window.path.normalize(currentFile.value.pathname))
      if (isAreaPath(parentDir)) return parentDir
    }

    return null
  }

  // Register critical window/editor IPC listeners first so the renderer can't
  // miss bootstrap/close events while slower async init work is still pending.
  mainStore.LISTEN_WIN_STATUS()
  layoutStore.LISTEN_FOR_LAYOUT()
  listenForMainStore.LISTEN_FOR_EDIT()
  preferencesStore.LISTEN_FOR_VIEW()
  listenForMainStore.LISTEN_FOR_SHOW_DIALOG()
  listenForMainStore.LISTEN_FOR_PARAGRAPH_INLINE_STYLE()
  projectStore.LISTEN_FOR_UPDATE_PROJECT()
  projectStore.LISTEN_FOR_LOAD_PROJECT()
  projectStore.LISTEN_FOR_SIDEBAR_CONTEXT_MENU()
  autoUpdateStore.LISTEN_FOR_UPDATE()
  preferencesStore.ASK_FOR_USER_PREFERENCE()
  preferencesStore.LISTEN_TOGGLE_VIEW()
  editorStore.LISTEN_SCREEN_SHOT()
  editorStore.LISTEN_FOR_CLOSE()
  editorStore.LISTEN_FOR_DRAWIO_STATE()
  editorStore.LISTEN_FOR_GEOGEBRA_STATE()
  editorStore.LISTEN_FOR_MINDMAP_STATE()
  editorStore.LISTEN_FOR_KDBX_STATE()
  editorStore.LISTEN_FOR_SAVE_AS()
  editorStore.LISTEN_FOR_MOVE_TO()
  editorStore.LISTEN_FOR_SAVE()
  editorStore.LISTEN_FOR_SET_PATHNAME()
  editorStore.LISTEN_FOR_BOOTSTRAP_WINDOW()
  editorStore.LISTEN_FOR_SAVE_CLOSE()
  editorStore.LISTEN_FOR_RENAME()
  editorStore.LISTEN_FOR_SET_LINE_ENDING()
  editorStore.LISTEN_FOR_SET_ENCODING()
  editorStore.LISTEN_FOR_SET_FINAL_NEWLINE()
  editorStore.LISTEN_FOR_NEW_TAB()
  editorStore.LISTEN_FOR_CLOSE_TAB()
  editorStore.LISTEN_FOR_TAB_CYCLE()
  editorStore.LISTEN_FOR_SWITCH_TABS()
  editorStore.LISTEN_FOR_PRINT_SERVICE_CLEARUP()
  editorStore.LISTEN_FOR_EXPORT_SUCCESS()
  editorStore.LISTEN_FOR_FILE_CHANGE()
  editorStore.LISTEN_WINDOW_ZOOM()
  editorStore.LISTEN_FOR_RELOAD_IMAGES()
  editorStore.LISTEN_FOR_CONTEXT_MENU()
  editorStore.LISTEN_FOR_STATE_REPLACE()

  // module: notification
  notificationStore.listenForNotification()

  setupDragDropHandler()

  void commandCenterStore.LISTEN_COMMAND_CENTER_BUS().catch((error) => {
    console.error('Failed to initialize command center', error)
  })

  nextTick(() => {
    // `initialState` from bootstrap carries nullable URL params (string|null);
    // `addStyles` requires non-null `theme` / `codeFontFamily` strings.
    // Coalesce against DEFAULT_STYLE for every nullable field.
    const init = window.marknotepro?.initialState
    const style: AddStylesOptions = {
      theme: init?.theme ?? DEFAULT_STYLE.theme,
      codeFontFamily: init?.codeFontFamily ?? DEFAULT_STYLE.codeFontFamily,
      codeFontSize: init?.codeFontSize ?? DEFAULT_STYLE.codeFontSize,
      hideScrollbar: init?.hideScrollbar ?? DEFAULT_STYLE.hideScrollbar
    }
    addStyles(style)
  })

  const checkDomOverlays = (): void => {
    const hasVisibleElOverlay = Array.from(document.querySelectorAll<HTMLElement>('.el-overlay')).some((el) => {
      return el.style.display !== 'none' && !el.classList.contains('is-hidden')
    })
    if (hasVisibleElOverlay) {
      hostOverlayStore.showOverlay('dom-safety-overlay')
    } else {
      hostOverlayStore.hideOverlay('dom-safety-overlay')
    }
  }

  let domOverlayRaf = 0
  const scheduleCheckDomOverlays = (): void => {
    if (domOverlayRaf) return
    domOverlayRaf = window.requestAnimationFrame(() => {
      domOverlayRaf = 0
      checkDomOverlays()
    })
  }

  const domOverlayObserver = new MutationObserver(scheduleCheckDomOverlays)
  domOverlayObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class']
  })

  cleanups.push(() => {
    if (domOverlayRaf) window.cancelAnimationFrame(domOverlayRaf)
    domOverlayObserver.disconnect()
  })
})

const cleanups: Array<() => void> = []

onBeforeUnmount(() => {
  cleanups.forEach((fn) => fn())
  window.removeEventListener('marknotepro:switch-workbench', handleWorkbenchSwitch)
  window.electron.ipcRenderer.removeAllListeners('mt::drawio::opened')
  window.electron.ipcRenderer.removeAllListeners('mt::drawio::closed')
  window.electron.ipcRenderer.removeAllListeners('mt::geogebra::opened')
  window.electron.ipcRenderer.removeAllListeners('mt::geogebra::closed')
  window.electron.ipcRenderer.removeAllListeners('mt::mindmap::opened')
  window.electron.ipcRenderer.removeAllListeners('mt::kdbx::opened')
  window.electron.ipcRenderer.removeAllListeners('mt::mindmap::closed')
  window.electron.ipcRenderer.removeAllListeners('mt::drawio::autosave-changed')
  window.electron.ipcRenderer.removeAllListeners('mt::drawio::state')
  window.electron.ipcRenderer.removeAllListeners('mt::geogebra::state')
  window.electron.ipcRenderer.removeAllListeners('mt::mindmap::state')
  window.electron.ipcRenderer.removeAllListeners('mt::kdbx::state')
  window.removeEventListener('wheel', handleWindowZoomWheel, true)
  window.removeEventListener('gesturestart', handleWindowZoomGestureStart)
  window.removeEventListener('gesturechange', handleWindowZoomGestureChange)
  ;(window as unknown as { getTargetPartitionDir?: () => string | null }).getTargetPartitionDir = undefined
})
</script>

<style scoped>
.editor-placeholder,
.editor-container {
  display: flex;
  flex-direction: row;
  position: absolute;
  width: 100vw;
  height: 100vh;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}
.editor-container .hide {
  z-index: -1;
  opacity: 0;
  position: absolute;
  left: -10000px;
}
.editor-placeholder {
  background: var(--editorBgColor);
}
.editor-middle {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  max-width: 100%;
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  & > .editor {
    flex: 1;
  }
}

.editor-tab-shell {
  display: grid;
  grid-template-columns: 0 minmax(0, 1fr) 0;
  flex: 0 0 28px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  height: 28px;
  user-select: none;
  overflow: hidden;
  background: var(--editorBgColor);
  box-shadow: 0px 0px 9px 2px rgba(0, 0, 0, 0.1);
}

/* BrowserView cannot paint behind the native title row. */
.editor-container.drawio-open .editor-middle,
.editor-container.geogebra-open .editor-middle,
.editor-container.mindmap-open .editor-middle {
  background: var(--editorBgColor);
}

.editor-tab-shell.has-tab-scroll-controls {
  grid-template-columns: 24px minmax(0, 1fr) 24px;
}

.editor-tab-shell :deep(.editor-tabs) {
  grid-column: 2;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-shadow: none;
}

.editor-tab-scroll-button {
  width: 24px;
  height: 28px;
  padding: 0;
  border: none;
  background: var(--editorBgColor);
  color: var(--editorColor50);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 2;
}

.editor-tab-scroll-button-left {
  grid-column: 1;
  border-right: 1px solid var(--borderColor);
}

.editor-tab-scroll-button-right {
  grid-column: 3;
  border-left: 1px solid var(--borderColor);
}

.editor-tab-scroll-button:hover:not(:disabled) {
  color: var(--focusColor);
  background: var(--floatBgColor);
}

.editor-tab-scroll-button:disabled {
  color: var(--editorColor10);
  cursor: default;
}
</style>
