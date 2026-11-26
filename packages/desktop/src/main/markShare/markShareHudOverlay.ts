import { BrowserWindow, nativeTheme } from 'electron'
import type { MarkShareOffer } from '../../shared/types/markShare'

export type MarkShareHudNoticeType = 'success' | 'warning' | 'error' | 'info'

export interface MarkShareHudMeta {
  isDark?: boolean
  labels?: {
    waitingConfirmSec?: string
    sasCode?: string
    cancelSend?: string
    stopTransfer?: string
  }
}

interface ActiveNoticeItem {
  id: string
  type: MarkShareHudNoticeType
  message: string
  timer: ReturnType<typeof setTimeout>
}

interface TransferHudHandlers {
  onCancel: (offerId: string) => void
  onStop: (offerId: string) => void
}

const hudWindows = new Set<BrowserWindow>()

export function isMarkShareHudWindow(win: BrowserWindow | null | undefined): boolean {
  return Boolean(win && hudWindows.has(win))
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const TRANSFER_HUD_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 100%;
    height: 100%;
    background: transparent;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    user-select: none;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 12px 12px;
    width: 100%;
  }
  .card {
    width: 100%;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(28, 32, 42, 0.94);
    color: #f3f4f6;
    border: 1px solid rgba(148, 163, 184, 0.28);
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28);
  }
  body.light .card {
    background: rgba(255, 255, 255, 0.96);
    color: #1f2937;
    border: 1px solid rgba(15, 23, 42, 0.14);
    box-shadow: 0 8px 22px rgba(15, 23, 42, 0.15);
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .peer {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    min-width: 0;
  }
  .os-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: #38bdf8;
  }
  .peer-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status {
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .status.pending { color: #f59e0b; }
  .status.transferring { color: #38bdf8; }
  .name {
    margin-top: 5px;
    font-size: 12px;
    opacity: 0.9;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .track {
    margin-top: 6px;
    height: 4px;
    border-radius: 4px;
    background: rgba(148, 163, 184, 0.24);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    transition: width 0.2s ease;
  }
  .fill.pending { background: #f59e0b; }
  .fill.transferring { background: #38bdf8; }
  .bottom {
    margin-top: 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
  }
  .bytes { opacity: 0.8; }
  .stop-btn {
    border: none;
    background: rgba(239, 68, 68, 0.16);
    color: #f87171;
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 11px;
    cursor: pointer;
    font-weight: 500;
  }
  body.light .stop-btn {
    background: rgba(239, 68, 68, 0.12);
    color: #dc2626;
  }
  .stop-btn:hover {
    background: rgba(239, 68, 68, 0.28);
  }
</style>
</head>
<body>
<div id="stack" class="stack"></div>
<script>
  let state = {
    isDark: true,
    items: [],
    labels: {
      waitingConfirmSec: '等待确认 {sec}s',
      sasCode: '安全校验码',
      cancelSend: '取消发送',
      stopTransfer: '停止传输'
    }
  };
  let tickTimer = null;

  function osSvg(osType) {
    if (osType === 'darwin') {
      return '<svg class="os-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.96 6.33c.67-.81 1.12-1.94 1-3.08-.96.04-2.13.64-2.82 1.45-.62.71-1.16 1.86-1.01 2.98 1.07.08 2.16-.54 2.83-1.35z"/></svg>';
    }
    if (osType === 'win32') {
      return '<svg class="os-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5.45L10.94 4.3v7.1H3V5.45zm0 13.1V12.6h7.94v7.15L3 18.55zm8.89-14.37L21 2.85v8.55h-9.11V4.18zm0 15.65V12.6H21v8.6l-9.11-1.37z"/></svg>';
    }
    return '<svg class="os-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3"/><path d="M12 15h5"/></svg>';
  }

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatSize(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
    return (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1) + ' ' + sizes[i];
  }

  function formatTemplate(tpl, sec) {
    return String(tpl || '等待确认 {sec}s').replace('{sec}', String(sec));
  }

  function getRemainSec(expiresAt) {
    if (!expiresAt) return 0;
    return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  }

  function getPercent(item) {
    if (!item.totalBytes || item.totalBytes <= 0) return 100;
    return Math.min(100, Math.round((item.transferredBytes / item.totalBytes) * 100));
  }

  function render() {
    document.body.className = state.isDark ? 'dark' : 'light';
    const root = document.getElementById('stack');
    if (!root) return;
    if (!Array.isArray(state.items) || state.items.length === 0) {
      root.innerHTML = '';
      if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
      }
      return;
    }
    const labels = state.labels || {};
    root.innerHTML = state.items.map(function (item) {
      const isPending = item.state === 'pending';
      const sec = getRemainSec(item.expiresAt);
      const pct = getPercent(item);
      const arrow = item.direction === 'send' ? '→' : '←';
      const statusText = isPending ? formatTemplate(labels.waitingConfirmSec, sec) : (pct + '%');
      const barWidth = isPending ? Math.min(100, (sec / 60) * 100) : pct;
      const bottomLeft = isPending
        ? (esc(labels.sasCode || '安全校验码') + ': <b>' + esc(item.sasCode) + '</b>')
        : (formatSize(item.transferredBytes) + ' / ' + formatSize(item.totalBytes));
      const actionType = isPending ? 'cancel' : 'stop';
      const btnText = isPending ? (labels.cancelSend || '取消发送') : (labels.stopTransfer || '停止传输');
      const peerName = item.peerDevice && item.peerDevice.deviceName ? item.peerDevice.deviceName : '';
      const osType = item.peerDevice && item.peerDevice.osType ? item.peerDevice.osType : 'linux';
      const fileTitle = item.currentFileName || item.rootLabel || '';

      return (
        '<div class="card">' +
          '<div class="top">' +
            '<div class="peer">' +
              osSvg(osType) +
              '<span class="peer-label">' + arrow + ' ' + esc(peerName) + '</span>' +
            '</div>' +
            '<span class="status ' + esc(item.state) + '">' + esc(statusText) + '</span>' +
          '</div>' +
          '<div class="name">' + esc(fileTitle) + '</div>' +
          '<div class="track"><div class="fill ' + esc(item.state) + '" style="width:' + barWidth + '%"></div></div>' +
          '<div class="bottom">' +
            '<span class="bytes">' + bottomLeft + '</span>' +
            '<button type="button" class="stop-btn" onclick="triggerAction(\\'' + actionType + '\\', \\'' + esc(item.offerId) + '\\')">' + esc(btnText) + '</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    const hasPending = state.items.some(function (i) { return i.state === 'pending'; });
    if (hasPending && !tickTimer) {
      tickTimer = setInterval(render, 500);
    } else if (!hasPending && tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  window.triggerAction = function (actionType, offerId) {
    window.location.href = 'markshare-hud://' + actionType + '/' + encodeURIComponent(offerId);
  };

  window.updateHud = function (next) {
    state = Object.assign({}, state, next || {});
    render();
  };
</script>
</body>
</html>`

const NOTICE_HUD_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 100%;
    height: 100%;
    background: transparent;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    user-select: none;
    pointer-events: none;
  }
  .notice-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 6px 12px 10px;
    width: 100%;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
    padding: 9px 15px;
    border-radius: 8px;
    font-size: 13px;
    line-height: 1.35;
    font-weight: 500;
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.24);
  }
  body.dark .pill.success { background: rgba(20, 44, 30, 0.96); color: #86efac; border: 1px solid rgba(74, 222, 128, 0.35); }
  body.dark .pill.warning { background: rgba(48, 35, 16, 0.96); color: #fcd34d; border: 1px solid rgba(251, 191, 36, 0.35); }
  body.dark .pill.error   { background: rgba(54, 22, 26, 0.96); color: #fca5a5; border: 1px solid rgba(248, 113, 113, 0.38); }
  body.dark .pill.info    { background: rgba(30, 36, 48, 0.96); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.32); }

  body.light .pill.success { background: #f0f9eb; color: #67c23a; border: 1px solid #e1f3d8; }
  body.light .pill.warning { background: #fdf6ec; color: #e6a23c; border: 1px solid #faecd8; }
  body.light .pill.error   { background: #fef0f0; color: #f56c6c; border: 1px solid #fde2e2; }
  body.light .pill.info    { background: #f4f4f5; color: #606266; border: 1px solid #e4e7ed; }

  .dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .pill.success .dot { background: #22c55e; color: #fff; }
  .pill.warning .dot { background: #f59e0b; color: #fff; }
  .pill.error   .dot { background: #ef4444; color: #fff; }
  .pill.info    .dot { background: #64748b; color: #fff; }

  .msg {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
</head>
<body>
<div id="notices" class="notice-stack"></div>
<script>
  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function badge(type) {
    if (type === 'success') return '✓';
    if (type === 'warning') return '!';
    if (type === 'error') return '✕';
    return 'i';
  }
  window.updateNotices = function (payload) {
    const isDark = payload && payload.isDark !== false;
    document.body.className = isDark ? 'dark' : 'light';
    const root = document.getElementById('notices');
    if (!root) return;
    const list = Array.isArray(payload && payload.items) ? payload.items : [];
    root.innerHTML = list.map(function (n) {
      return '<div class="pill ' + esc(n.type) + '"><span class="dot">' + badge(n.type) + '</span><span class="msg">' + esc(n.message) + '</span></div>';
    }).join('');
  };
</script>
</body>
</html>`

export class MarkShareHudOverlay {
  private readonly handlers: TransferHudHandlers
  private ownerWin: BrowserWindow | null = null
  private transferWin: BrowserWindow | null = null
  private noticeWin: BrowserWindow | null = null
  private transferReady = false
  private noticeReady = false

  private isDark = nativeTheme.shouldUseDarkColors
  private labels: Required<NonNullable<MarkShareHudMeta['labels']>> = {
    waitingConfirmSec: '等待确认 {sec}s',
    sasCode: '安全校验码',
    cancelSend: '取消发送',
    stopTransfer: '停止传输'
  }
  private activeTransfers: MarkShareOffer[] = []
  private notices: ActiveNoticeItem[] = []
  private noticeCounter = 0

  private readonly onOwnerBoundsOrState = (): void => {
    this.syncAllVisibilityAndBounds()
  }

  private readonly onOwnerHidden = (): void => {
    this.hideBothWindows()
  }

  private readonly onOwnerClosed = (): void => {
    this.detachOwnerListeners()
    this.ownerWin = null
    this.destroyHudWindows()
  }

  constructor(handlers: TransferHudHandlers) {
    this.handlers = handlers
  }

  public syncMeta(meta: MarkShareHudMeta): void {
    if (typeof meta.isDark === 'boolean') {
      this.isDark = meta.isDark
    }
    if (meta.labels) {
      this.labels = {
        waitingConfirmSec: meta.labels.waitingConfirmSec || this.labels.waitingConfirmSec,
        sasCode: meta.labels.sasCode || this.labels.sasCode,
        cancelSend: meta.labels.cancelSend || this.labels.cancelSend,
        stopTransfer: meta.labels.stopTransfer || this.labels.stopTransfer
      }
    }
    if (this.activeTransfers.length > 0) {
      this.flushTransferState()
    }
    if (this.notices.length > 0) {
      this.flushNoticeState()
    }
  }

  public updateTransfers(offers: MarkShareOffer[]): void {
    this.activeTransfers = offers.filter(
      (o) => o.state === 'transferring' || (o.direction === 'send' && o.state === 'pending')
    )
    if (this.activeTransfers.length === 0) {
      if (this.transferWin && !this.transferWin.isDestroyed()) {
        this.transferWin.hide()
      }
      return
    }

    const owner = this.ensureOwnerWindow()
    if (!owner) return
    const win = this.ensureTransferWindow(owner)
    this.syncTransferBounds(owner, win)
    this.flushTransferState()
    if (owner.isVisible() && !owner.isMinimized() && !win.isVisible()) {
      win.showInactive()
    }
  }

  public showOutcomeBanner(offer: MarkShareOffer): void {
    const peerName = offer.peerDevice?.deviceName || '对端设备'
    if (offer.state === 'completed') {
      this.showNotice(
        'success',
        offer.direction === 'send'
          ? `MarkShare 发送完成：${offer.rootLabel} → ${peerName}`
          : `MarkShare 接收完成：${offer.rootLabel}（已保存）`
      )
    } else if (offer.state === 'rejected') {
      if (offer.direction === 'send') {
        this.showNotice('warning', `${peerName} 拒绝接收「${offer.rootLabel}」`)
      }
    } else if (offer.state === 'expired') {
      this.showNotice(
        'warning',
        offer.direction === 'send'
          ? `等待 ${peerName} 确认超时（1 分钟未接受），传输已终止`
          : `来自 ${peerName} 的传输请求超时（1 分钟未确认），已自动中断`
      )
    } else if (offer.state === 'cancelled') {
      if (offer.direction === 'receive') {
        this.showNotice('info', `${peerName} 已取消发送「${offer.rootLabel}」`)
      }
    } else if (offer.state === 'stopped') {
      this.showNotice('info', `已停止传输「${offer.rootLabel}」`)
    } else if (offer.state === 'failed') {
      this.showNotice(
        'error',
        `传输「${offer.rootLabel}」失败${offer.errorMessage ? `：${offer.errorMessage}` : ''}`
      )
    }
  }

  public showNotice(type: MarkShareHudNoticeType, message: string): void {
    const cleanMsg = String(message || '').trim()
    if (!cleanMsg) return

    const id = `ms-notice-${++this.noticeCounter}`
    const durationMs = type === 'error' ? 4800 : 3800
    const timer = setTimeout(() => {
      this.dismissNotice(id)
    }, durationMs)

    this.notices.push({ id, type, message: cleanMsg, timer })
    while (this.notices.length > 3) {
      const dropped = this.notices.shift()
      if (dropped) clearTimeout(dropped.timer)
    }

    const owner = this.ensureOwnerWindow()
    if (!owner) return
    const win = this.ensureNoticeWindow(owner)
    this.syncNoticeBounds(owner, win)
    this.flushNoticeState()
    if (owner.isVisible() && !owner.isMinimized() && !win.isVisible()) {
      win.showInactive()
    }
  }

  public dispose(): void {
    for (const item of this.notices) {
      clearTimeout(item.timer)
    }
    this.notices = []
    this.activeTransfers = []
    this.detachOwnerListeners()
    this.ownerWin = null
    this.destroyHudWindows()
  }

  private dismissNotice(id: string): void {
    const idx = this.notices.findIndex((n) => n.id === id)
    if (idx < 0) return
    const [removed] = this.notices.splice(idx, 1)
    if (removed) clearTimeout(removed.timer)

    if (this.notices.length === 0) {
      if (this.noticeWin && !this.noticeWin.isDestroyed()) {
        this.noticeWin.hide()
      }
      return
    }
    if (this.ownerWin && !this.ownerWin.isDestroyed() && this.noticeWin && !this.noticeWin.isDestroyed()) {
      this.syncNoticeBounds(this.ownerWin, this.noticeWin)
    }
    this.flushNoticeState()
  }

  private resolveTargetOwnerWindow(): BrowserWindow | null {
    const candidates = BrowserWindow.getAllWindows().filter(
      (w) => !w.isDestroyed() && !isMarkShareHudWindow(w) && !w.getParentWindow()
    )
    if (candidates.length === 0) return null
    const focused = BrowserWindow.getFocusedWindow()
    if (focused && candidates.includes(focused) && focused.isVisible() && !focused.isMinimized()) {
      return focused
    }
    return candidates.find((w) => w.isVisible() && !w.isMinimized()) ?? candidates[0] ?? null
  }

  private ensureOwnerWindow(): BrowserWindow | null {
    const nextOwner = this.resolveTargetOwnerWindow()
    if (!nextOwner) return null
    if (this.ownerWin !== nextOwner) {
      this.detachOwnerListeners()
      this.destroyHudWindows()
      this.ownerWin = nextOwner
      nextOwner.on('move', this.onOwnerBoundsOrState)
      nextOwner.on('resize', this.onOwnerBoundsOrState)
      nextOwner.on('show', this.onOwnerBoundsOrState)
      nextOwner.on('restore', this.onOwnerBoundsOrState)
      nextOwner.on('minimize', this.onOwnerHidden)
      nextOwner.on('hide', this.onOwnerHidden)
      nextOwner.on('closed', this.onOwnerClosed)
    }
    return nextOwner
  }

  private detachOwnerListeners(): void {
    if (!this.ownerWin || this.ownerWin.isDestroyed()) return
    this.ownerWin.removeListener('move', this.onOwnerBoundsOrState)
    this.ownerWin.removeListener('resize', this.onOwnerBoundsOrState)
    this.ownerWin.removeListener('show', this.onOwnerBoundsOrState)
    this.ownerWin.removeListener('restore', this.onOwnerBoundsOrState)
    this.ownerWin.removeListener('minimize', this.onOwnerHidden)
    this.ownerWin.removeListener('hide', this.onOwnerHidden)
    this.ownerWin.removeListener('closed', this.onOwnerClosed)
  }

  private ensureTransferWindow(owner: BrowserWindow): BrowserWindow {
    if (this.transferWin && !this.transferWin.isDestroyed()) {
      return this.transferWin
    }
    this.transferReady = false
    const win = new BrowserWindow({
      parent: owner,
      width: 314,
      height: 128,
      transparent: true,
      frame: false,
      hasShadow: false,
      focusable: false,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    hudWindows.add(win)
    this.transferWin = win

    win.on('closed', () => {
      hudWindows.delete(win)
      if (this.transferWin === win) {
        this.transferWin = null
        this.transferReady = false
      }
    })

    win.webContents.on('will-navigate', (event, rawUrl) => {
      event.preventDefault()
      if (!rawUrl.startsWith('markshare-hud://')) return
      const rest = rawUrl.slice('markshare-hud://'.length)
      const slashIdx = rest.indexOf('/')
      if (slashIdx <= 0) return
      const action = rest.slice(0, slashIdx)
      const offerId = decodeURIComponent(rest.slice(slashIdx + 1))
      if (!offerId) return
      if (action === 'cancel') {
        this.handlers.onCancel(offerId)
      } else if (action === 'stop') {
        this.handlers.onStop(offerId)
      }
    })

    win.webContents.once('did-finish-load', () => {
      this.transferReady = true
      this.flushTransferState()
    })

    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(TRANSFER_HUD_HTML)}`)
    return win
  }

  private ensureNoticeWindow(owner: BrowserWindow): BrowserWindow {
    if (this.noticeWin && !this.noticeWin.isDestroyed()) {
      return this.noticeWin
    }
    this.noticeReady = false
    const win = new BrowserWindow({
      parent: owner,
      width: 540,
      height: 84,
      transparent: true,
      frame: false,
      hasShadow: false,
      focusable: false,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    win.setIgnoreMouseEvents(true)
    hudWindows.add(win)
    this.noticeWin = win

    win.on('closed', () => {
      hudWindows.delete(win)
      if (this.noticeWin === win) {
        this.noticeWin = null
        this.noticeReady = false
      }
    })

    win.webContents.once('did-finish-load', () => {
      this.noticeReady = true
      this.flushNoticeState()
    })

    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(NOTICE_HUD_HTML)}`)
    return win
  }

  private hideBothWindows(): void {
    if (this.transferWin && !this.transferWin.isDestroyed()) this.transferWin.hide()
    if (this.noticeWin && !this.noticeWin.isDestroyed()) this.noticeWin.hide()
  }

  private destroyHudWindows(): void {
    if (this.transferWin && !this.transferWin.isDestroyed()) {
      hudWindows.delete(this.transferWin)
      this.transferWin.destroy()
    }
    this.transferWin = null
    this.transferReady = false

    if (this.noticeWin && !this.noticeWin.isDestroyed()) {
      hudWindows.delete(this.noticeWin)
      this.noticeWin.destroy()
    }
    this.noticeWin = null
    this.noticeReady = false
  }

  private syncAllVisibilityAndBounds(): void {
    const owner = this.ownerWin
    if (!owner || owner.isDestroyed()) return
    if (!owner.isVisible() || owner.isMinimized()) {
      this.hideBothWindows()
      return
    }
    if (this.transferWin && !this.transferWin.isDestroyed() && this.activeTransfers.length > 0) {
      this.syncTransferBounds(owner, this.transferWin)
      if (!this.transferWin.isVisible()) this.transferWin.showInactive()
    }
    if (this.noticeWin && !this.noticeWin.isDestroyed() && this.notices.length > 0) {
      this.syncNoticeBounds(owner, this.noticeWin)
      if (!this.noticeWin.isVisible()) this.noticeWin.showInactive()
    }
  }

  private syncTransferBounds(owner: BrowserWindow, win: BrowserWindow): void {
    const rect = owner.getContentBounds()
    const count = Math.max(1, this.activeTransfers.length)
    const width = Math.min(314, Math.max(220, rect.width - 20))
    const height = Math.min(Math.max(120, rect.height - 80), count * 104 + Math.max(0, count - 1) * 8 + 20)
    const x = Math.round(rect.x + rect.width - width - 8)
    const y = Math.round(rect.y + rect.height - height - 8)
    win.setContentBounds({ x, y, width, height })
  }

  private syncNoticeBounds(owner: BrowserWindow, win: BrowserWindow): void {
    const rect = owner.getContentBounds()
    const count = Math.max(1, this.notices.length)
    const width = Math.min(540, Math.max(260, rect.width - 32))
    const height = Math.min(220, count * 52 + 24)
    const x = Math.round(rect.x + (rect.width - width) / 2)
    const y = Math.round(rect.y + 44)
    win.setContentBounds({ x, y, width, height })
  }

  private flushTransferState(): void {
    if (!this.transferWin || this.transferWin.isDestroyed() || !this.transferReady) return
    const payload = JSON.stringify({
      isDark: this.isDark,
      labels: this.labels,
      items: this.activeTransfers
    })
    void this.transferWin.webContents.executeJavaScript(`window.updateHud && window.updateHud(${payload});`).catch(() => {})
  }

  private flushNoticeState(): void {
    if (!this.noticeWin || this.noticeWin.isDestroyed() || !this.noticeReady) return
    const payload = JSON.stringify({
      isDark: this.isDark,
      items: this.notices.map((n) => ({ id: n.id, type: n.type, message: n.message }))
    })
    void this.noticeWin.webContents.executeJavaScript(`window.updateNotices && window.updateNotices(${payload});`).catch(() => {})
  }
}

export { escapeHtml }
