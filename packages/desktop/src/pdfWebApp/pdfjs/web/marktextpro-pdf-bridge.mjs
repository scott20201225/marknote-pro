/**
 * MarkTextPro PDF.js Bridge
 * Bridges PDFViewerApplication state & events with Electron main/renderer processes.
 */

function applyThemeColors(colors = {}, dark = false) {
  const root = document.documentElement
  if (dark) {
    root.classList.add('dark')
    root.setAttribute('data-theme', 'dark')
  } else {
    root.classList.remove('dark')
    root.removeAttribute('data-theme')
  }

  const editorBg = colors.editorBgColor || (dark ? '#1e1e1e' : '#f8f9fa')
  const sidebarBg = colors.sideBarBgColor || (dark ? '#252526' : '#f3f4f6')
  const sidebarHoverBg = colors.sideBarItemHoverBgColor || (dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)')
  const floatBg = colors.floatBgColor || (dark ? '#28282d' : '#ffffff')
  const floatHoverBg = colors.floatHoverColor || (dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)')
  const inputBg = colors.inputBgColor || (dark ? '#1e1e1e' : '#ffffff')
  const textColor = colors.editorColor || (dark ? '#cccccc' : '#333333')
  const borderColor = colors.tableBorderColor || colors.floatBorderColor || (dark ? '#3c3c3c' : '#e5e7eb')
  const themeColor = colors.themeColor || '#409eff'

  root.style.setProperty('--mt-editor-bg', editorBg)
  root.style.setProperty('--mt-sidebar-bg', sidebarBg)
  root.style.setProperty('--mt-sidebar-hover-bg', sidebarHoverBg)
  root.style.setProperty('--mt-float-bg', floatBg)
  root.style.setProperty('--mt-float-hover-bg', floatHoverBg)
  root.style.setProperty('--mt-input-bg', inputBg)
  root.style.setProperty('--mt-text-color', textColor)
  root.style.setProperty('--mt-border-color', borderColor)
  root.style.setProperty('--mt-theme-color', themeColor)
}

function initBridge() {
  const params = new URLSearchParams(window.location.search)
  let isDark = params.get('dark') === '1'
  if (!isDark && params.get('dark') !== '0') {
    isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  let initialColors = {}
  try {
    const rawColors = params.get('colors')
    if (rawColors) initialColors = JSON.parse(rawColors)
  } catch (e) {
    console.warn('Failed to parse initial colors from URL', e)
  }
  applyThemeColors(initialColors, isDark)

  const ipc = window.electron?.ipcRenderer
  let isModified = false
  let isSavingLocked = false
  let saveCooldownTimer = null

  const notifyStateChange = (reason = '') => {
    if (!ipc || !window.PDFViewerApplication?.pdfViewer) return
    const app = window.PDFViewerApplication
    const page = app.page || 1
    const scale = app.pdfViewer.currentScaleValue || 'auto'
    const rotation = app.pagesRotation || 0
    const sidebarView = app.pdfSidebar?.visibleView || 0
    const uiManager = app.pdfViewer?._layerProperties?.annotationEditorUIManager
    const actionState = uiManager?.actionState || {}

    ipc.send('mt::pdf::internal-state-changed', {
      page,
      scale,
      rotation,
      sidebarView,
      modified: isModified,
      actionId: actionState.currentActionId ?? null,
      savedActionId: actionState.savedActionId ?? null,
      reason
    })
  }

  const getDocumentModified = () => {
    const app = window.PDFViewerApplication
    if (!app) return false
    const uiManager = app.pdfViewer?._layerProperties?.annotationEditorUIManager
    if (uiManager && typeof uiManager.isModified === 'function') {
      return uiManager.isModified()
    }
    if (typeof app._hasChanges === 'function') {
      return app._hasChanges()
    }
    return false
  }

  const checkModified = (reason = '') => {
    if (isSavingLocked) return
    const hasChanges = getDocumentModified()
    if (hasChanges !== isModified) {
      isModified = hasChanges
      notifyStateChange(reason)
    }
  }

  window.__marktextproOnPdfModified = () => {
    checkModified('onPdfModified')
  }

  // Active polling every 300ms guarantees ink strokes, keystrokes, highlights, and deletions are caught
  setInterval(() => {
    checkModified('interval')
  }, 300)

  // Intercept Cmd+S / Ctrl+S in capture phase to guarantee PDF save is called even when PDF view is focused
  window.addEventListener(
    'keydown',
    (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        e.stopPropagation()
        ipc?.send('mt::pdf::request-save')
      }
    },
    true
  )

  // Hook into PDF.js event bus once ready
  const setupEventBus = () => {
    const app = window.PDFViewerApplication
    if (!app || !app.eventBus) {
      setTimeout(setupEventBus, 100)
      return
    }

    if (app.pdfLinkService) {
      app.pdfLinkService._ignoreDestinationZoom = true
    }

    const bus = app.eventBus
    bus.on('pagechanging', () => notifyStateChange('pagechanging'))
    bus.on('scalechanging', () => notifyStateChange('scalechanging'))
    bus.on('rotationchanging', () => notifyStateChange('rotationchanging'))
    bus.on('sidebarviewchanged', () => notifyStateChange('sidebarviewchanged'))

    const onDocLoaded = () => {
      if (app.pdfLinkService) {
        app.pdfLinkService._ignoreDestinationZoom = true
      }
      isModified = getDocumentModified()
      notifyStateChange('docLoaded')
    }

    bus.on('documentloaded', onDocLoaded)
    bus.on('pagesloaded', onDocLoaded)
    bus.on('annotationeditormodechanged', () => checkModified('modechanged'))
    bus.on('annotationeditorstateschanged', () => checkModified('stateschanged'))
    bus.on('editingstateschanged', () => checkModified('editingstateschanged'))
    bus.on('annotationeditorparamschanged', () => checkModified('paramschanged'))

    window.addEventListener('pointerup', () => setTimeout(() => checkModified('pointerup'), 50))
    window.addEventListener('keyup', () => setTimeout(() => checkModified('keyup'), 50))
    window.addEventListener('change', () => setTimeout(() => checkModified('change'), 50))
    window.addEventListener('input', () => setTimeout(() => checkModified('input'), 50))
  }

  window.marktextproSavePdfDocument = async function () {
    const app = window.PDFViewerApplication
    if (!app?.pdfDocument) {
      throw new Error('No PDF document loaded to save')
    }
    try {
      const uiManager = app.pdfViewer?._layerProperties?.annotationEditorUIManager
      uiManager?.endCurrentEditing?.()
      const data = await app.pdfDocument.saveDocument(app.externalServices?.printToPDF)
      uiManager?.setSaved?.()
      isModified = false
      isSavingLocked = true
      notifyStateChange('saved-locally')
      if (saveCooldownTimer) clearTimeout(saveCooldownTimer)
      saveCooldownTimer = setTimeout(() => {
        isSavingLocked = false
      }, 1000)
      return Array.from(data)
    } catch (err) {
      isSavingLocked = false
      console.error('saveDocument failed:', err)
      throw err
    }
  }

  setupEventBus()

  if (ipc) {
    ipc.on('mt::pdf::saved', () => {
      const app = window.PDFViewerApplication
      const uiManager = app?.pdfViewer?._layerProperties?.annotationEditorUIManager
      uiManager?.setSaved?.()
      isModified = false
      notifyStateChange('saved-acknowledged')
    })
    ipc.on('mt::pdf::theme', (_event, payload) => {
      if (payload) {
        applyThemeColors(payload.colors, payload.dark)
        if (payload.language) {
          const applyLanguage = async () => {
            const app = window.PDFViewerApplication
            if (!app) return
            try {
              if (app.initializedPromise) {
                await app.initializedPromise
              }
              if (typeof app.setLanguage === 'function') {
                await app.setLanguage(payload.language)
              }
            } catch (err) {
              console.warn('PDF bridge setLanguage error:', err)
            }
          }
          void applyLanguage()
        }
      }
    })
    // Proactively request latest theme from main process
    ipc.send('mt::pdf::request-theme')
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBridge)
} else {
  initBridge()
}
