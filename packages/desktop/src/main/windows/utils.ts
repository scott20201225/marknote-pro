import { screen } from 'electron'
import type {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  Event as ElectronEvent,
  Input,
  WebContents
} from 'electron'
import { isLinux } from '../config'

const MIN_ZOOM_FACTOR = 0.5
const MAX_ZOOM_FACTOR = 2.0
const ZOOM_STEP = 0.125
const PROGRAMMATIC_ZOOM_EVENT_SUPPRESS_MS = 220
const ZOOM_REQUEST_DEDUPE_MS = 35
const ZOOM_ANIMATION_DURATION_MS = 140
const ZOOM_ANIMATION_FRAME_MS = process.platform === 'win32' ? 24 : 16
const ZOOM_RENDERER_NOTIFY_DEBOUNCE_MS = 180
const programmaticZoomUntil = new WeakMap<WebContents, number>()
const zoomAnimationState = new WeakMap<WebContents, {
  target: number
  start: number
  startedAt: number
  timer?: NodeJS.Timeout
}>()
const lastZoomRequestAt = new Map<number, number>()
const pendingZoomRendererNotification = new Map<number, NodeJS.Timeout>()

interface SetZoomOptions {
  animated?: boolean
  notifyRenderer?: boolean
  deferRendererNotification?: boolean
}

const clampZoomFactor = (zoomFactor: number): number => {
  return Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, zoomFactor))
}

const getEffectiveZoomFactor = (webContents: WebContents): number => {
  return zoomAnimationState.get(webContents)?.target ?? webContents.getZoomFactor()
}

const cancelZoomAnimation = (webContents: WebContents): void => {
  const animation = zoomAnimationState.get(webContents)
  if (!animation) return
  if (animation.timer) {
    clearTimeout(animation.timer)
  }
  zoomAnimationState.delete(webContents)
}

const setProgrammaticZoomSuppression = (webContents: WebContents): void => {
  programmaticZoomUntil.set(webContents, Date.now() + PROGRAMMATIC_ZOOM_EVENT_SUPPRESS_MS)
}

const easeOutCubic = (progress: number): number => {
  return 1 - Math.pow(1 - progress, 3)
}

const runZoomAnimationFrame = (webContents: WebContents): void => {
  const animation = zoomAnimationState.get(webContents)
  if (!animation) return

  if (webContents.isDestroyed()) {
    cancelZoomAnimation(webContents)
    return
  }

  const elapsed = Date.now() - animation.startedAt
  const progress = Math.min(1, elapsed / ZOOM_ANIMATION_DURATION_MS)
  const nextZoom = animation.start + (animation.target - animation.start) * easeOutCubic(progress)
  setProgrammaticZoomSuppression(webContents)
  webContents.setZoomFactor(progress >= 1 ? animation.target : nextZoom)

  if (progress >= 1) {
    zoomAnimationState.delete(webContents)
    return
  }

  animation.timer = setTimeout(() => runZoomAnimationFrame(webContents), ZOOM_ANIMATION_FRAME_MS)
}

const scheduleZoomAnimationFrame = (webContents: WebContents): void => {
  const animation = zoomAnimationState.get(webContents)
  if (!animation) return
  animation.timer = setTimeout(() => runZoomAnimationFrame(webContents), ZOOM_ANIMATION_FRAME_MS)
}

const setWebContentsZoomFactor = (
  webContents: WebContents,
  zoomFactor: number,
  animated: boolean
): boolean => {
  if (webContents.isDestroyed()) return false
  const currentTarget = getEffectiveZoomFactor(webContents)
  if (Math.abs(currentTarget - zoomFactor) < 0.001) {
    return false
  }

  cancelZoomAnimation(webContents)

  if (!animated) {
    setProgrammaticZoomSuppression(webContents)
    webContents.setZoomFactor(zoomFactor)
    return true
  }

  const currentAnimation = zoomAnimationState.get(webContents)
  if (currentAnimation?.timer) {
    clearTimeout(currentAnimation.timer)
  }

  zoomAnimationState.set(webContents, {
    target: zoomFactor,
    start: webContents.getZoomFactor(),
    startedAt: Date.now()
  })
  setProgrammaticZoomSuppression(webContents)
  scheduleZoomAnimationFrame(webContents)

  return true
}

const notifyRendererWindowZoom = (
  win: BrowserWindow,
  zoomFactor: number,
  deferred: boolean
): void => {
  const existingTimer = pendingZoomRendererNotification.get(win.id)
  if (existingTimer) {
    clearTimeout(existingTimer)
    pendingZoomRendererNotification.delete(win.id)
  }

  const sendZoom = (): void => {
    pendingZoomRendererNotification.delete(win.id)
    if (!win.isDestroyed()) {
      win.webContents.send('mt::window-zoom', zoomFactor)
    }
  }

  if (!deferred) {
    sendZoom()
    return
  }

  pendingZoomRendererNotification.set(
    win.id,
    setTimeout(sendZoom, ZOOM_RENDERER_NOTIFY_DEBOUNCE_MS)
  )
}

export const shouldIgnoreZoomChanged = (webContents: WebContents): boolean => {
  return Date.now() < (programmaticZoomUntil.get(webContents) ?? 0)
}

const shouldIgnoreDuplicateZoomRequest = (win: BrowserWindow): boolean => {
  const now = Date.now()
  const lastRequestAt = lastZoomRequestAt.get(win.id) ?? 0
  lastZoomRequestAt.set(win.id, now)
  return now - lastRequestAt < ZOOM_REQUEST_DEDUPE_MS
}

const isZoomModifierPressed = (input: Input): boolean => {
  return process.platform === 'darwin' ? input.meta : input.control
}

export const handleWindowZoomShortcut = (
  win: BrowserWindow | null | undefined,
  event: ElectronEvent,
  input: Input
): void => {
  if (!win || input.type !== 'keyDown' || !input.shift || !isZoomModifierPressed(input)) {
    return
  }

  if (input.key === '=' || input.key === '+') {
    event.preventDefault()
    zoomIn(win)
  } else if (input.key === '-' || input.key === '_') {
    event.preventDefault()
    zoomOut(win)
  }
}

export const setWindowZoomFactor = (
  win: BrowserWindow | null | undefined,
  zoomFactor: number,
  options: SetZoomOptions = {}
): number | undefined => {
  if (!win || win.isDestroyed()) return undefined

  const nextZoom = clampZoomFactor(zoomFactor)
  const {
    animated = true,
    notifyRenderer = true,
    deferRendererNotification = animated
  } = options
  const { webContents } = win
  let changed = false

  changed = setWebContentsZoomFactor(webContents, nextZoom, animated) || changed
  for (const view of win.getBrowserViews()) {
    changed = setWebContentsZoomFactor(view.webContents, nextZoom, animated) || changed
  }

  if (changed && notifyRenderer) {
    notifyRendererWindowZoom(win, nextZoom, deferRendererNotification)
  }
  return nextZoom
}

export const zoomIn = (win: BrowserWindow | null | undefined): void => {
  if (!win || win.isDestroyed() || shouldIgnoreDuplicateZoomRequest(win)) return
  const zoom = getEffectiveZoomFactor(win.webContents)
  setWindowZoomFactor(win, zoom + ZOOM_STEP)
}

export const zoomOut = (win: BrowserWindow | null | undefined): void => {
  if (!win || win.isDestroyed() || shouldIgnoreDuplicateZoomRequest(win)) return
  const zoom = getEffectiveZoomFactor(win.webContents)
  setWindowZoomFactor(win, zoom - ZOOM_STEP)
}

export const centerWindowOptions = (
  options: BrowserWindowConstructorOptions & {
    width: number
    height: number
    x?: number
    y?: number
  }
): void => {
  // "workArea" doesn't work on Linux
  const { bounds, workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const screenArea = isLinux ? bounds : workArea
  const { width, height } = options
  options.x = Math.ceil(screenArea.x + (screenArea.width - width) / 2)
  options.y = Math.ceil(screenArea.y + (screenArea.height - height) / 2)
}

export interface WindowStateLike {
  x?: number
  y?: number
  width: number
  height: number
}

export const ensureWindowPosition = (
  windowState: WindowStateLike
): { x: number; y: number; width: number; height: number } => {
  // "workArea" doesn't work on Linux
  const { bounds, workArea } = screen.getPrimaryDisplay()
  const screenArea = isLinux ? bounds : workArea

  let { x, y, width, height } = windowState
  let center = false
  if (x === undefined || y === undefined) {
    center = true

    // First app start; check whether window size is larger than screen size
    if (screenArea.width < width) width = screenArea.width
    if (screenArea.height < height) height = screenArea.height
  } else {
    center = !screen
      .getAllDisplays()
      .map(
        (display) =>
          x! >= display.bounds.x &&
          x! <= display.bounds.x + display.bounds.width &&
          y! >= display.bounds.y &&
          y! <= display.bounds.y + display.bounds.height
      )
      .some((display) => display)
  }
  if (center) {
    x = Math.ceil(screenArea.x + (screenArea.width - width) / 2)
    y = Math.ceil(screenArea.y + (screenArea.height - height) / 2)
  }
  return {
    x: x as number,
    y: y as number,
    width,
    height
  }
}
