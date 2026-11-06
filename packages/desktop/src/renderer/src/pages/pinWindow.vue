<template>
  <div
    :class="[
      'pin-window-container',
      isDarkTheme ? 'theme-dark' : 'theme-light',
      isOsx ? 'platform-mac' : 'platform-other'
    ]"
    :style="{ opacity: windowOpacity }"
    @mousedown="onMouseDown"
    @wheel="onWheel"
    @dblclick="onDoubleClick"
    @contextmenu.prevent="openContextMenu"
    @mouseenter="onMouseEnter"
    tabindex="0"
  >
    <!-- 8 Directional Resize Handles for Manual Sizing -->
    <div class="resize-handle handle-t" @mousedown.stop="onResizeStart('t', $event)"></div>
    <div class="resize-handle handle-b" @mousedown.stop="onResizeStart('b', $event)"></div>
    <div class="resize-handle handle-l" @mousedown.stop="onResizeStart('l', $event)"></div>
    <div class="resize-handle handle-r" @mousedown.stop="onResizeStart('r', $event)"></div>
    <div class="resize-handle handle-tl" @mousedown.stop="onResizeStart('tl', $event)"></div>
    <div class="resize-handle handle-tr" @mousedown.stop="onResizeStart('tr', $event)"></div>
    <div class="resize-handle handle-bl" @mousedown.stop="onResizeStart('bl', $event)"></div>
    <div class="resize-handle handle-br" @mousedown.stop="onResizeStart('br', $event)"></div>

    <!-- Hover Action Bar -->
    <div class="hover-toolbar" @mousedown.stop>
      <span class="zoom-badge">{{ Math.round(zoomLevel * 100) }}%</span>
      <button class="mini-btn zoom-btn" :title="tr('zoomReset')" @click.stop="resetZoom">1:1</button>
      <button
        v-if="payload?.type === 'image'"
        class="mini-btn edit-btn"
        :class="{ active: isEditing }"
        :title="isEditing ? tr('exitEdit') : tr('editImage')"
        @click.stop="toggleEditMode"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2">
          <path d="M12 20h9"></path>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
        </svg>
      </button>
      <button
        class="mini-btn"
        :class="{ 'btn-success': copiedFeedback }"
        :title="tr('copyImage') + (isOsx ? ' (⌘C)' : ' (Ctrl+C)')"
        @click.stop="copyPin"
      >
        <svg v-if="copiedFeedback" viewBox="0 0 24 24" width="13" height="13" stroke="#22c55e" fill="none" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <svg v-else viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>
      <button class="mini-btn" :title="tr('saveImage') + (isOsx ? ' (⌘S)' : ' (Ctrl+S)')" @click.stop="savePin">
        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      </button>
      <button class="mini-btn close" :title="tr('closePin')" @click.stop="closePin" @mousedown.stop>
        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <!-- Toast Feedback on Copy -->
    <transition name="toast-fade">
      <div v-if="copiedFeedback" class="pin-copy-toast" @mousedown.stop>
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="#22c55e" fill="none" stroke-width="2.5" style="margin-right: 6px;">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>{{ tr('copied') }}</span>
      </div>
    </transition>

    <!-- Pinned Image View & Editing Toolbar -->
    <template v-if="payload?.type === 'image'">
      <div class="pinned-image-view" :class="{ 'is-editing': isEditing }">
        <img
          ref="pinnedImgRef"
          :src="getImageSrc(payload.content)"
          class="pinned-img"
          alt="Pinned Image"
          draggable="false"
          @load="onImageLoad"
        />
        <!-- Overlaid annotation canvas during editing -->
        <canvas
          v-show="isEditing"
          ref="annotationCanvasRef"
          class="pin-annotation-canvas"
          :style="{ cursor: annotationCursor }"
          @mousedown.stop="onCanvasMouseDown"
          @mousemove="onCanvasMouseMove"
          @mouseup="onCanvasMouseUp"
        ></canvas>

        <!-- Active Text / Tag Editing Box during editing -->
        <div
          v-if="isEditing && textInputState.active"
          :class="['lark-active-textbox pin-active-textbox', { 'is-tag-bubble': textInputState.isTag }]"
          :style="activeEditorPositionStyle"
          @mousedown.stop
          @mouseup.stop
          @click.stop
        >
          <template v-if="!textInputState.isTag">
            <div class="textbox-handle nw"></div>
            <div class="textbox-handle ne"></div>
            <div class="textbox-handle se"></div>
            <div class="textbox-handle sw"></div>
          </template>

          <!-- If it's a Step Note, display the non-editable step badge on the left -->
          <div
            v-if="textInputState.isStepNote"
            class="step-badge-inline"
            :style="{ backgroundColor: activeColor }"
          >
            {{ textInputState.stepNumber }}
          </div>

          <textarea
            ref="textInputRef"
            v-model="textInputState.text"
            :class="['lark-textarea', textInputState.isTag ? 'tag-bubble-input' : textStyle]"
            :style="textareaComputedStyle"
            :placeholder="textInputState.isStepNote ? tr('stepNotePlaceholder') : (textInputState.isTag ? tr('tagPlaceholder') : tr('textPlaceholder'))"
            rows="1"
            autofocus
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            @input="autoResizeTextarea"
            @compositionstart="onCompositionStart"
            @compositionend="onCompositionEnd"
            @keydown="onTextareaKeydown"
            @mousedown.stop
            @mouseup.stop
            @click.stop
          ></textarea>
        </div>
      </div>

    </template>

    <!-- Pinned Text / Code Card View -->
    <div
      v-else-if="payload?.type === 'text'"
      class="pinned-text-view"
      :style="{ transform: `scale(${zoomLevel})` }"
    >
      <div class="text-card-header">
        <div class="mac-traffic-dots">
          <span class="dot dot-close" :title="tr('closePin')" @click.stop="closePin"></span>
          <span class="dot dot-copy" :title="tr('copyCode')" @click.stop="copyPin"></span>
          <span class="dot dot-ontop" :class="{ active: isAlwaysOnTop }" :title="tr('alwaysOnTop')" @click.stop="toggleAlwaysOnTop"></span>
        </div>
        <span class="text-card-badge">📌 {{ payload.title || '代码 / 文本贴图' }}</span>
        <button class="header-action-btn" :title="tr('copyCode')" @click.stop="copyPin">{{ tr('copyCode') }}</button>
      </div>
      <div class="text-card-body">
        <pre class="text-content"><code>{{ payload.content }}</code></pre>
      </div>
    </div>

    <!-- Custom Right-Click Context Menu -->
    <div
      v-if="contextMenuVisible"
      class="custom-context-menu"
      :style="{ left: `${contextMenuX}px`, top: `${contextMenuY}px` }"
      @mousedown.stop
    >
      <div v-if="payload?.type === 'image'" class="menu-item" @click="toggleEditMode">
        {{ isEditing ? tr('exitEdit') : tr('editImage') }}
      </div>
      <div class="menu-item" @click="copyPin">{{ tr('copyImage') }}</div>
      <div class="menu-item" @click="savePin">{{ tr('saveAs') }}</div>
      <div class="menu-divider"></div>
      <div class="menu-item" @click="setZoom(0.5)">{{ tr('zoom50') }}</div>
      <div class="menu-item" @click="resetZoom">{{ tr('zoom100') }}</div>
      <div class="menu-item" @click="setZoom(1.5)">{{ tr('zoom150') }}</div>
      <div class="menu-item" @click="setZoom(2.0)">{{ tr('zoom200') }}</div>
      <div class="menu-divider"></div>
      <div class="menu-item" @click="toggleAlwaysOnTop">
        {{ isAlwaysOnTop ? `✓ ${tr('alwaysOnTop')}` : tr('alwaysOnTop') }}
      </div>
      <div class="menu-divider"></div>
      <div class="menu-item danger" @click="closePin">{{ tr('closePin') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import type { PinWindowPayload } from '@shared/types/clipboard'
import { isDarkThemeId } from '../../../common/theme'

const isDarkTheme = ref(false)
const currentLang = ref('zh-CN')

const pinI18n: Record<string, Record<string, string>> = {
  'zh-CN': {
    zoomReset: '恢复 100% (1:1)',
    copyImage: '复制图片',
    saveImage: '保存图片',
    closePin: '关闭贴图 (Esc)',
    saveAs: '另存为...',
    zoom50: '缩放至 50%',
    zoom100: '恢复 100% (1:1)',
    zoom150: '缩放至 150%',
    zoom200: '缩放至 200%',
    alwaysOnTop: '置顶显示',
    copyCode: '复制代码',
    loading: '加载贴图中...',
    copied: '已复制到剪贴板',
    editImage: '编辑贴图',
    exitEdit: '退出编辑',
    rect: '矩形 (R)',
    circle: '圆形 (C)',
    line: '直线 (L)',
    arrow: '箭头 (A)',
    pencil: '画笔 (P)',
    text: '文字 (T)',
    mosaic: '马赛克 (M)',
    undo: '撤销 (⌘Z)',
    save: '保存 (⌘S)',
    cancel: '取消 (Esc)',
    confirm: '完成 (Enter)',
    textPlaceholder: '点击输入文字...',
    tag: '标签 (G)',
    tagPlaceholder: '点击输入标签...',
    tagDirection: '切换标签方向',
    step: '序号 (S)',
    stepNote: '序号说明',
    stepReset: '重置',
    stepResetTooltip: '重置序号为 1',
    stepNotePlaceholder: '点击输入说明...',
    highlight: '高亮矩形 (H)',
    marker: '荧光笔',
    mosaicPixel: '像素马赛克',
    mosaicBlur: '高斯模糊',
    mosaicBrush: '画笔涂抹',
    mosaicRect: '矩形框选',
    mosaicIntensity: '模糊强度'
  },
  'zh-TW': {
    zoomReset: '恢復 100% (1:1)',
    copyImage: '複製圖片',
    saveImage: '儲存圖片',
    closePin: '關閉貼圖 (Esc)',
    saveAs: '另存為...',
    zoom50: '縮放至 50%',
    zoom100: '恢復 100% (1:1)',
    zoom150: '縮放至 150%',
    zoom200: '縮放至 200%',
    alwaysOnTop: '置頂顯示',
    copyCode: '複製代碼',
    loading: '載入貼圖中...',
    copied: '已複製至剪貼簿',
    editImage: '編輯貼圖',
    exitEdit: '退出編輯',
    rect: '矩形 (R)',
    circle: '圓形 (C)',
    line: '直線 (L)',
    arrow: '箭頭 (A)',
    pencil: '畫筆 (P)',
    text: '文字 (T)',
    mosaic: '馬賽克 (M)',
    undo: '復原 (⌘Z)',
    save: '儲存 (⌘S)',
    cancel: '取消 (Esc)',
    confirm: '完成 (Enter)',
    textPlaceholder: '點擊輸入文字...',
    tag: '標籤 (G)',
    tagPlaceholder: '點擊輸入標籤...',
    tagDirection: '切換標籤方向',
    step: '序號 (S)',
    stepNote: '序號說明',
    stepReset: '重設',
    stepResetTooltip: '重設序號為 1',
    stepNotePlaceholder: '點擊輸入說明...',
    highlight: '高亮矩形 (H)',
    marker: '螢光筆',
    mosaicPixel: '像素馬賽克',
    mosaicBlur: '高斯模糊',
    mosaicBrush: '畫筆塗抹',
    mosaicRect: '矩形框選',
    mosaicIntensity: '模糊強度'
  },
  en: {
    zoomReset: 'Reset 100% (1:1)',
    copyImage: 'Copy Image',
    saveImage: 'Save Image',
    closePin: 'Close Pin (Esc)',
    saveAs: 'Save As...',
    zoom50: 'Zoom to 50%',
    zoom100: 'Reset 100% (1:1)',
    zoom150: 'Zoom to 150%',
    zoom200: 'Zoom to 200%',
    alwaysOnTop: 'Always on Top',
    copyCode: 'Copy Code',
    loading: 'Loading pin...',
    copied: 'Copied to clipboard',
    editImage: 'Edit Pin',
    exitEdit: 'Exit Edit',
    rect: 'Rectangle (R)',
    circle: 'Circle (C)',
    line: 'Line (L)',
    arrow: 'Arrow (A)',
    pencil: 'Pencil (P)',
    text: 'Text (T)',
    mosaic: 'Mosaic (M)',
    undo: 'Undo (⌘Z)',
    save: 'Save (⌘S)',
    cancel: 'Cancel (Esc)',
    confirm: 'Done (Enter)',
    textPlaceholder: 'Type text here...',
    tag: 'Tag (G)',
    tagPlaceholder: 'Type tag here...',
    tagDirection: 'Toggle Tag Direction',
    step: 'Step (S)',
    stepNote: 'Step Note',
    stepReset: 'Reset',
    stepResetTooltip: 'Reset counter to 1',
    stepNotePlaceholder: 'Type note here...',
    highlight: 'Highlight (H)',
    marker: 'Highlighter',
    mosaicPixel: 'Pixel Mosaic',
    mosaicBlur: 'Blur Mosaic',
    mosaicBrush: 'Brush Smear',
    mosaicRect: 'Rect Frame',
    mosaicIntensity: 'Intensity'
  },
  ja: {
    zoomReset: '100%に戻す (1:1)',
    copyImage: '画像をコピー',
    saveImage: '画像を保存',
    closePin: 'ピン留めを閉じる (Esc)',
    saveAs: '名前を付けて保存...',
    zoom50: '50%に縮小',
    zoom100: '100%に戻す (1:1)',
    zoom150: '150%に拡大',
    zoom200: '200%に拡大',
    alwaysOnTop: '常に最前面に表示',
    copyCode: 'コードをコピー',
    loading: '読み込み中...',
    copied: 'クリップボードにコピーしました',
    editImage: 'ピン留めを編集',
    exitEdit: '編集を終了',
    rect: '矩形 (R)',
    circle: '円形 (C)',
    line: '直線 (L)',
    arrow: '矢印 (A)',
    pencil: '鉛筆 (P)',
    text: 'テキスト (T)',
    mosaic: 'モザイク (M)',
    undo: '元に戻す (⌘Z)',
    save: '保存 (⌘S)',
    cancel: 'キャンセル (Esc)',
    confirm: '完了 (Enter)',
    textPlaceholder: 'テキストを入力...',
    tag: 'タグ (G)',
    tagPlaceholder: 'タグを入力...',
    tagDirection: '方向を切り替え'
  },
  ko: {
    zoomReset: '100% 초기화 (1:1)',
    copyImage: '이미지 복사',
    saveImage: '이미지 저장',
    closePin: '고정 닫기 (Esc)',
    saveAs: '다른 이름으로 저장...',
    zoom50: '50% 축소',
    zoom100: '100% 초기화 (1:1)',
    zoom150: '150% 확대',
    zoom200: '200% 확대',
    alwaysOnTop: '항상 위에 표시',
    copyCode: '코드 복사',
    loading: '로딩 중...',
    copied: '클립보드에 복사되었습니다',
    editImage: '고정 편집',
    exitEdit: '편집 종료',
    rect: '직사각형 (R)',
    circle: '원형 (C)',
    line: '직선 (L)',
    arrow: '화살표 (A)',
    pencil: '펜 (P)',
    text: '텍스트 (T)',
    mosaic: '모자이크 (M)',
    undo: '실행 취소 (⌘Z)',
    save: '저장 (⌘S)',
    cancel: '취소 (Esc)',
    confirm: '완료 (Enter)',
    textPlaceholder: '텍스트 입력...',
    tag: '태그 (G)',
    tagPlaceholder: '태그 입력...',
    tagDirection: '태그 방향 전환'
  },
  de: {
    zoomReset: 'Auf 100% zurücksetzen (1:1)',
    copyImage: 'Bild kopieren',
    saveImage: 'Bild speichern',
    closePin: 'Schließen (Esc)',
    saveAs: 'Speichern unter...',
    zoom50: 'Auf 50% zoomen',
    zoom100: 'Auf 100% zurücksetzen (1:1)',
    zoom150: 'Auf 150% zoomen',
    zoom200: 'Auf 200% zoomen',
    alwaysOnTop: 'Immer im Vordergrund',
    copyCode: 'Code kopieren',
    loading: 'Laden...',
    copied: 'In die Zwischenablage kopiert',
    editImage: 'Pin bearbeiten',
    exitEdit: 'Bearbeitung beenden',
    rect: 'Rechteck (R)',
    circle: 'Kreis (C)',
    line: 'Linie (L)',
    arrow: 'Pfeil (A)',
    pencil: 'Stift (P)',
    text: 'Text (T)',
    mosaic: 'Mosaik (M)',
    undo: 'Rückgängig (⌘Z)',
    save: 'Speichern (⌘S)',
    cancel: 'Abbrechen (Esc)',
    confirm: 'Fertig (Enter)',
    textPlaceholder: 'Text eingeben...',
    tag: 'Tag (G)',
    tagPlaceholder: 'Tag eingeben...',
    tagDirection: 'Richtung ändern'
  },
  fr: {
    zoomReset: 'Réinitialiser 100% (1:1)',
    copyImage: 'Copier l\'image',
    saveImage: 'Enregistrer l\'image',
    closePin: 'Fermer (Esc)',
    saveAs: 'Enregistrer sous...',
    zoom50: 'Zoomer à 50%',
    zoom100: 'Réinitialiser 100% (1:1)',
    zoom150: 'Zoomer à 150%',
    zoom200: 'Zoomer à 200%',
    alwaysOnTop: 'Toujours au premier plan',
    copyCode: 'Copier le code',
    loading: 'Chargement...',
    copied: 'Copié dans le presse-papiers',
    editImage: 'Modifier l\'épingle',
    exitEdit: 'Quitter',
    rect: 'Rectangle (R)',
    circle: 'Cercle (C)',
    line: 'Ligne (L)',
    arrow: 'Flèche (A)',
    pencil: 'Crayon (P)',
    text: 'Texte (T)',
    mosaic: 'Mosaïque (M)',
    undo: 'Annuler (⌘Z)',
    save: 'Enregistrer (⌘S)',
    cancel: 'Annuler (Esc)',
    confirm: 'Terminé (Enter)',
    textPlaceholder: 'Saisissez du texte...',
    tag: 'Étiquette (G)',
    tagPlaceholder: 'Entrez l\'étiquette...',
    tagDirection: 'Changer de direction'
  },
  es: {
    zoomReset: 'Restablecer 100% (1:1)',
    copyImage: 'Copiar imagen',
    saveImage: 'Guardar imagen',
    closePin: 'Cerrar (Esc)',
    saveAs: 'Guardar como...',
    zoom50: 'Zoom al 50%',
    zoom100: 'Restablecer 100% (1:1)',
    zoom150: 'Zoom al 150%',
    zoom200: 'Zoom al 200%',
    alwaysOnTop: 'Siempre al frente',
    copyCode: 'Copiar código',
    loading: 'Cargando...',
    copied: 'Copiado al portapapeles',
    editImage: 'Editar fijado',
    exitEdit: 'Salir de edición',
    rect: 'Rectángulo (R)',
    circle: 'Círculo (C)',
    line: 'Línea (L)',
    arrow: 'Flecha (A)',
    pencil: 'Lápiz (P)',
    text: 'Texto (T)',
    mosaic: 'Mosaico (M)',
    undo: 'Deshacer (⌘Z)',
    save: 'Guardar (⌘S)',
    cancel: 'Cancelar (Esc)',
    confirm: 'Listo (Enter)',
    textPlaceholder: 'Escribe aquí...',
    tag: 'Etiqueta (G)',
    tagPlaceholder: 'Ingrese etiqueta...',
    tagDirection: 'Cambiar dirección'
  }
}

const tr = (key: string): string => {
  const dict = pinI18n[currentLang.value] || pinI18n['zh-CN']
  return dict[key] || pinI18n['zh-CN'][key] || key
}

const detectTheme = (): void => {
  const urlTheme = new URLSearchParams(window.location.search).get('theme')
  const localTheme =
    urlTheme || localStorage.getItem('theme') || localStorage.getItem('current-theme')
  if (localTheme) {
    isDarkTheme.value = isDarkThemeId(localTheme)
    return
  }
  isDarkTheme.value = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
}

const detectLanguage = (): void => {
  const localLang = localStorage.getItem('current-language')
  if (localLang) {
    currentLang.value = localLang
    return
  }
  const navLang = navigator.language
  if (navLang.startsWith('zh')) {
    currentLang.value = navLang.includes('TW') || navLang.includes('HK') ? 'zh-TW' : 'zh-CN'
  } else if (navLang.startsWith('ja')) currentLang.value = 'ja'
  else if (navLang.startsWith('ko')) currentLang.value = 'ko'
  else if (navLang.startsWith('de')) currentLang.value = 'de'
  else if (navLang.startsWith('fr')) currentLang.value = 'fr'
  else if (navLang.startsWith('es')) currentLang.value = 'es'
  else currentLang.value = 'en'
}

const payload = ref<PinWindowPayload | null>(null)
const pinId = ref('')
const zoomLevel = ref(1.0)
const windowOpacity = ref(1.0)
const isAlwaysOnTop = ref(true)
const copiedFeedback = ref(false)
let copiedTimer: NodeJS.Timeout | null = null
const isOsx =
  (window as unknown as { marktextpro?: { isOsx?: boolean }; marknotepro?: { isOsx?: boolean } }).marktextpro?.isOsx ??
  (window as unknown as { marktextpro?: { isOsx?: boolean }; marknotepro?: { isOsx?: boolean } }).marknotepro?.isOsx ??
  /Mac|iPod|iPhone|iPad/.test(navigator.platform)

// Drag tracking
let isDragging = false
const isWindowDragging = ref(false)
const isSpacePressed = ref(false)
let startScreenX = 0
let startScreenY = 0

// Context Menu
const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)

// -------------------------------------------------------------
// Pin Secondary Annotation Editing State & Logic
// -------------------------------------------------------------
type ToolType =
  | 'rect'
  | 'circle'
  | 'line'
  | 'arrow'
  | 'pencil'
  | 'text'
  | 'mosaic'
  | 'tag'
  | 'step'
  | 'stepNote'
  | 'highlight'
  | 'marker'
  | 'watermark'
  | 'none'
type TextStyle = 'transparent' | 'bordered' | 'filled'
type TagDirection = 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left'

interface Annotation {
  id: string
  tool: 'rect' | 'circle' | 'line' | 'arrow' | 'pencil' | 'text' | 'mosaic' | 'tag' | 'step' | 'stepNote' | 'highlight' | 'marker'
  color: string
  strokeWidth: number
  startX: number
  startY: number
  endX: number
  endY: number
  text?: string
  textStyle?: TextStyle
  fontSize?: number
  tagDirection?: TagDirection
  stepNumber?: number
  points?: Array<{ x: number; y: number }>
  mosaicMode?: 'brush' | 'rect'
  mosaicStyle?: 'pixel' | 'blur'
  mosaicBlockSize?: number
  box?: { x: number; y: number; width: number; height: number }
}

const isEditing = ref(false)
const activeTool = ref<ToolType>('none')
const strokeWidth = ref(4)
const textStyle = ref<TextStyle>('transparent')
const fontSizeVal = ref(16)
const tagDirection = ref<TagDirection>('top-right')
const stepCounter = ref(1)
const mosaicStyle = ref<'pixel' | 'blur'>('pixel')
const mosaicMode = ref<'brush' | 'rect'>('brush')
const mosaicIntensity = ref(50)

const larkPalette = [
  { hex: '#f64b45', border: 'transparent' },
  { hex: '#ffc60c', border: 'transparent' },
  { hex: '#34be4b', border: 'transparent' },
  { hex: '#336df4', border: 'transparent' },
  { hex: '#1f2329', border: 'transparent' },
  { hex: '#8f959e', border: 'transparent' },
  { hex: '#ffffff', border: 'rgba(0,0,0,0.18)' }
]
const activeColor = ref('#f64b45')

const cycleTagDirection = (): void => {
  const dirs: TagDirection[] = ['top-right', 'bottom-right', 'bottom-left', 'top-left']
  const idx = dirs.indexOf(tagDirection.value)
  tagDirection.value = dirs[(idx + 1) % dirs.length]
  renderCanvas()
}

interface TagLayout {
  dotX: number
  dotY: number
  dotRadius: number
  bubbleX: number
  bubbleY: number
  bubbleWidth: number
  bubbleHeight: number
  notchPoints: {
    tip: { x: number; y: number }
    p1: { x: number; y: number }
    p2: { x: number; y: number }
  }
}

const computeTagLayout = (
  startX: number,
  startY: number,
  dir: string,
  contentWidth: number,
  fontSize: number
): TagLayout => {
  const dotRadius = 4.5
  const padX = 10
  const padY = 5
  const bubbleHeight = Math.max(28, fontSize + padY * 2)
  const bubbleWidth = Math.max(42, contentWidth + padX * 2)
  const gap = 5
  const notchLen = 7
  const notchHalfBase = 5

  let bubbleX = 0
  let bubbleY = 0
  let tipX = 0
  let tipY = 0
  let p1X = 0
  let p1Y = 0
  let p2X = 0
  let p2Y = 0

  if (dir === 'bottom-right') {
    tipX = startX
    tipY = startY + gap
    bubbleX = startX - bubbleWidth / 2
    bubbleY = tipY + notchLen
    p1X = startX - notchHalfBase
    p1Y = bubbleY
    p2X = startX + notchHalfBase
    p2Y = bubbleY
  } else if (dir === 'bottom-left') {
    tipX = startX - gap
    tipY = startY
    bubbleX = tipX - notchLen - bubbleWidth
    bubbleY = startY - bubbleHeight / 2
    p1X = bubbleX + bubbleWidth
    p1Y = startY - notchHalfBase
    p2X = bubbleX + bubbleWidth
    p2Y = startY + notchHalfBase
  } else if (dir === 'top-left') {
    tipX = startX
    tipY = startY - gap
    bubbleX = startX - bubbleWidth / 2
    bubbleY = tipY - notchLen - bubbleHeight
    p1X = startX - notchHalfBase
    p1Y = bubbleY + bubbleHeight
    p2X = startX + notchHalfBase
    p2Y = bubbleY + bubbleHeight
  } else {
    // 'top-right' (default)
    tipX = startX + gap
    tipY = startY
    bubbleX = tipX + notchLen
    bubbleY = startY - bubbleHeight / 2
    p1X = bubbleX
    p1Y = startY - notchHalfBase
    p2X = bubbleX
    p2Y = startY + notchHalfBase
  }

  return {
    dotX: startX,
    dotY: startY,
    dotRadius,
    bubbleX,
    bubbleY,
    bubbleWidth,
    bubbleHeight,
    notchPoints: {
      tip: { x: tipX, y: tipY },
      p1: { x: p1X, y: p1Y },
      p2: { x: p2X, y: p2Y }
    }
  }
}

const pinnedImgRef = ref<HTMLImageElement | null>(null)
const annotationCanvasRef = ref<HTMLCanvasElement | null>(null)
const textInputRef = ref<HTMLTextAreaElement | null>(null)

const annotations = ref<Annotation[]>([])
const currentAnnotation = ref<Annotation | null>(null)
const historyStack = ref<Annotation[][]>([])
const historyIndex = ref(-1)

const isWatermarkActive = ref(false)
const watermarkText = ref('')
const watermarkColor = ref('#8f959e')

let originalBoundsBeforeEdit: { x: number; y: number; width: number; height: number } | null = null
let pixelMosaicCanvas: HTMLCanvasElement | null = null
let blurMosaicCanvas: HTMLCanvasElement | null = null
let isDrawingAnnotation = false
let imgResizeObserver: ResizeObserver | null = null

const textInputState = ref<{
  active: boolean
  editingId: string | null
  isTag: boolean
  isStepNote: boolean
  stepNumber: number
  x: number
  y: number
  text: string
}>({
  active: false,
  editingId: null,
  isTag: false,
  isStepNote: false,
  stepNumber: 1,
  x: 0,
  y: 0,
  text: ''
})
const isComposing = ref(false)

const isLightActiveColor = computed(() => {
  return activeColor.value === '#ffffff' || activeColor.value === '#ffc60c'
})

const activeTagLayout = computed(() => {
  if (!textInputState.value.active || !textInputState.value.isTag) return null
  const text = textInputState.value.text || ''
  const fSize = fontSizeVal.value
  const charWidth = fSize * 0.72
  const textW = Math.max(28, Math.ceil(text.length * charWidth))
  return computeTagLayout(
    textInputState.value.x,
    textInputState.value.y,
    tagDirection.value,
    textW,
    fSize
  )
})

const activeEditorPositionStyle = computed(() => {
  if (!textInputState.value.active) return {}
  if (textInputState.value.isTag && activeTagLayout.value) {
    return {
      left: `${activeTagLayout.value.bubbleX}px`,
      top: `${activeTagLayout.value.bubbleY}px`
    }
  }
  return {
    left: `${textInputState.value.x}px`,
    top: `${textInputState.value.y}px`
  }
})

const textareaComputedStyle = computed(() => {
  if (textInputState.value.isTag) {
    return {
      color: activeColor.value,
      backgroundColor: 'transparent',
      fontSize: `${fontSizeVal.value}px`,
      lineHeight: '1.35',
      caretColor: activeColor.value
    }
  }
  return {
    color: textStyle.value === 'filled' ? (isLightActiveColor.value ? '#0f172a' : '#ffffff') : activeColor.value,
    backgroundColor:
      textStyle.value === 'filled'
        ? activeColor.value
        : textStyle.value === 'bordered'
          ? (isDarkTheme.value ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.88)')
          : 'transparent',
    fontSize: `${fontSizeVal.value}px`,
    lineHeight: '1.35',
    caretColor: textStyle.value === 'filled' ? (isLightActiveColor.value ? '#0f172a' : '#ffffff') : activeColor.value
  }
})

const annotationCursor = computed(() => {
  if (!isEditing.value) return 'default'
  if (isWindowDragging.value) return 'grabbing'
  if (isSpacePressed.value || activeTool.value === 'none') return 'grab'
  if (activeTool.value === 'text' || activeTool.value === 'tag' || activeTool.value === 'stepNote') return 'text'
  return 'crosshair'
})

const buildMosaicCaches = (img: HTMLImageElement): void => {
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  if (!w || !h) return

  const bSize = Math.max(4, Math.round((mosaicIntensity.value / 100) * 20 + 4))

  // 1. Pixelated Mosaic
  pixelMosaicCanvas = document.createElement('canvas')
  pixelMosaicCanvas.width = w
  pixelMosaicCanvas.height = h
  const pCtx = pixelMosaicCanvas.getContext('2d')
  if (pCtx) {
    const sw = Math.max(1, Math.floor(w / bSize))
    const sh = Math.max(1, Math.floor(h / bSize))
    const sCanvas = document.createElement('canvas')
    sCanvas.width = sw
    sCanvas.height = sh
    const sCtx = sCanvas.getContext('2d')
    if (sCtx) {
      sCtx.drawImage(img, 0, 0, sw, sh)
      pCtx.imageSmoothingEnabled = false
      pCtx.drawImage(sCanvas, 0, 0, sw, sh, 0, 0, w, h)
    }
  }

  // 2. Blur Mosaic
  blurMosaicCanvas = document.createElement('canvas')
  blurMosaicCanvas.width = w
  blurMosaicCanvas.height = h
  const bCtx = blurMosaicCanvas.getContext('2d')
  if (bCtx) {
    const blurRadius = Math.max(2, Math.round((mosaicIntensity.value / 100) * 12 + 2))
    bCtx.filter = `blur(${blurRadius}px)`
    bCtx.drawImage(img, 0, 0, w, h)
  }
}

const initEditCanvas = (): void => {
  const canvas = annotationCanvasRef.value
  const img = pinnedImgRef.value
  if (!canvas || !img) return

  const rect = img.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(rect.width * dpr)
  canvas.height = Math.round(rect.height * dpr)
  canvas.style.width = `${rect.width}px`
  canvas.style.height = `${rect.height}px`

  buildMosaicCaches(img)

  if (imgResizeObserver) {
    imgResizeObserver.disconnect()
  }
  imgResizeObserver = new ResizeObserver(() => {
    if (isEditing.value) {
      updateCanvasSize()
    }
  })
  imgResizeObserver.observe(img)

  renderCanvas()
}

const updateCanvasSize = (): void => {
  const canvas = annotationCanvasRef.value
  const img = pinnedImgRef.value
  if (!canvas || !img) return
  const rect = img.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(rect.width * dpr)
  canvas.height = Math.round(rect.height * dpr)
  canvas.style.width = `${rect.width}px`
  canvas.style.height = `${rect.height}px`
  renderCanvas()
}

const drawArrow = (
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  strokeW: number
): void => {
  const headLen = Math.max(10, strokeW * 3.2)
  const angle = Math.atan2(toY - fromY, toX - fromX)
  ctx.beginPath()
  ctx.moveTo(fromX, fromY)
  ctx.lineTo(toX, toY)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(toX, toY)
  ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fill()
}

const drawTagAnnotation = (ctx: CanvasRenderingContext2D, ann: Annotation): void => {
  if (ann.id === textInputState.value.editingId) {
    return
  }

  const fontSize = ann.fontSize || 14
  ctx.save()
  ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
  const textMetrics = ctx.measureText(ann.text || '')
  const textWidth = Math.ceil(textMetrics.width)

  const layout = computeTagLayout(
    ann.startX,
    ann.startY,
    ann.tagDirection || 'top-right',
    textWidth,
    fontSize
  )

  ann.box = {
    x: Math.min(layout.dotX - layout.dotRadius, layout.bubbleX),
    y: Math.min(layout.dotY - layout.dotRadius, layout.bubbleY),
    width: Math.max(layout.dotX + layout.dotRadius, layout.bubbleX + layout.bubbleWidth) - Math.min(layout.dotX - layout.dotRadius, layout.bubbleX),
    height: Math.max(layout.dotY + layout.dotRadius, layout.bubbleY + layout.bubbleHeight) - Math.min(layout.dotY - layout.dotRadius, layout.bubbleY)
  }

  // 1. Anchor point (colored dot with white border)
  ctx.beginPath()
  ctx.arc(layout.dotX, layout.dotY, layout.dotRadius, 0, Math.PI * 2)
  ctx.fillStyle = ann.color
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()

  const tagBg = isDarkTheme.value ? '#2b2f3a' : '#ffffff'

  // 2. Triangular Notch
  ctx.beginPath()
  ctx.moveTo(layout.notchPoints.tip.x, layout.notchPoints.tip.y)
  ctx.lineTo(layout.notchPoints.p1.x, layout.notchPoints.p1.y)
  ctx.lineTo(layout.notchPoints.p2.x, layout.notchPoints.p2.y)
  ctx.closePath()
  ctx.fillStyle = tagBg
  ctx.fill()
  if (!isDarkTheme.value) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // 3. Rounded Rect Callout Bubble
  ctx.beginPath()
  ctx.roundRect(layout.bubbleX, layout.bubbleY, layout.bubbleWidth, layout.bubbleHeight, 6)
  ctx.fillStyle = tagBg
  ctx.shadowColor = isDarkTheme.value ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.12)'
  ctx.shadowBlur = 8
  ctx.shadowOffsetY = 2
  ctx.fill()
  ctx.shadowColor = 'transparent'

  if (!isDarkTheme.value) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // 4. Colored text (matches selected color!)
  ctx.fillStyle = ann.color || '#f64b45'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(ann.text || '', layout.bubbleX + layout.bubbleWidth / 2, layout.bubbleY + layout.bubbleHeight / 2)
  ctx.restore()
}

const drawSingleAnnotation = (ctx: CanvasRenderingContext2D, ann: Annotation): void => {
  ctx.save()
  ctx.strokeStyle = ann.color
  ctx.fillStyle = ann.color
  ctx.lineWidth = ann.strokeWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (ann.tool === 'rect') {
    const x = Math.min(ann.startX, ann.endX)
    const y = Math.min(ann.startY, ann.endY)
    const w = Math.abs(ann.endX - ann.startX)
    const h = Math.abs(ann.endY - ann.startY)
    ctx.strokeRect(x, y, w, h)
  } else if (ann.tool === 'circle') {
    const cx = (ann.startX + ann.endX) / 2
    const cy = (ann.startY + ann.endY) / 2
    const rx = Math.abs(ann.endX - ann.startX) / 2
    const ry = Math.abs(ann.endY - ann.startY) / 2
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
  } else if (ann.tool === 'line') {
    ctx.beginPath()
    ctx.moveTo(ann.startX, ann.startY)
    ctx.lineTo(ann.endX, ann.endY)
    ctx.stroke()
  } else if (ann.tool === 'arrow') {
    drawArrow(ctx, ann.startX, ann.startY, ann.endX, ann.endY, ann.strokeWidth)
  } else if (ann.tool === 'pencil' && ann.points && ann.points.length > 0) {
    ctx.lineWidth = ann.strokeWidth
    ctx.beginPath()
    ctx.moveTo(ann.points[0].x, ann.points[0].y)
    for (let i = 1; i < ann.points.length; i++) {
      ctx.lineTo(ann.points[i].x, ann.points[i].y)
    }
    ctx.stroke()
  } else if (ann.tool === 'highlight') {
    ctx.save()
    ctx.globalAlpha = 0.38
    ctx.fillStyle = ann.color
    const rx = Math.min(ann.startX, ann.endX)
    const ry = Math.min(ann.startY, ann.endY)
    const rw = Math.abs(ann.endX - ann.startX)
    const rh = Math.abs(ann.endY - ann.startY)
    ctx.fillRect(rx, ry, rw, rh)
    ctx.restore()
  } else if (ann.tool === 'marker') {
    ctx.save()
    ctx.globalAlpha = 0.38
    ctx.strokeStyle = ann.color
    if (ann.points && ann.points.length > 0) {
      ctx.lineWidth = ann.strokeWidth * 6
      ctx.lineCap = 'square'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(ann.points[0].x, ann.points[0].y)
      for (let i = 1; i < ann.points.length; i++) {
        ctx.lineTo(ann.points[i].x, ann.points[i].y)
      }
      ctx.stroke()
    } else {
      ctx.fillStyle = ann.color
      const rx = Math.min(ann.startX, ann.endX)
      const ry = Math.min(ann.startY, ann.endY)
      const rw = Math.abs(ann.endX - ann.startX)
      const rh = Math.abs(ann.endY - ann.startY)
      ctx.fillRect(rx, ry, rw, rh)
    }
    ctx.restore()
  } else if (ann.tool === 'mosaic') {
    const isBrush = ann.mosaicMode === 'brush'
    const sourceCanvas = ann.mosaicStyle === 'blur' ? blurMosaicCanvas : pixelMosaicCanvas
    if (sourceCanvas && pinnedImgRef.value) {
      const canvas = annotationCanvasRef.value
      const w = canvas ? parseFloat(canvas.style.width) || canvas.width : 500
      const h = canvas ? parseFloat(canvas.style.height) || canvas.height : 400

      if (isBrush && ann.points && ann.points.length > 0) {
        const maskCanvas = document.createElement('canvas')
        maskCanvas.width = Math.round(w)
        maskCanvas.height = Math.round(h)
        const mCtx = maskCanvas.getContext('2d')
        if (mCtx) {
          mCtx.lineCap = 'round'
          mCtx.lineJoin = 'round'
          mCtx.lineWidth = 28
          mCtx.strokeStyle = '#000000'
          mCtx.fillStyle = '#000000'
          mCtx.beginPath()
          mCtx.moveTo(ann.points[0].x, ann.points[0].y)
          for (let i = 1; i < ann.points.length; i++) {
            mCtx.lineTo(ann.points[i].x, ann.points[i].y)
          }
          mCtx.stroke()
          for (const p of ann.points) {
            mCtx.beginPath()
            mCtx.arc(p.x, p.y, 14, 0, Math.PI * 2)
            mCtx.fill()
          }
          mCtx.globalCompositeOperation = 'source-in'
          mCtx.drawImage(sourceCanvas, 0, 0, w, h)
          ctx.drawImage(maskCanvas, 0, 0, w, h)
        }
      } else {
        ctx.save()
        ctx.beginPath()
        const rx = Math.min(ann.startX, ann.endX)
        const ry = Math.min(ann.startY, ann.endY)
        const rw = Math.abs(ann.endX - ann.startX)
        const rh = Math.abs(ann.endY - ann.startY)
        ctx.rect(rx, ry, rw, rh)
        ctx.clip()
        ctx.drawImage(sourceCanvas, 0, 0, w, h)
        ctx.restore()
      }
    }
  } else if ((ann.tool === 'text' || ann.tool === 'stepNote') && ann.text) {
    if (ann.id === textInputState.value.editingId) {
      ctx.restore()
      return
    }

    const fSize = ann.fontSize || 16
    ctx.font = `bold ${fSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'

    const lines = ann.text.split('\n')
    const lineHeight = fSize * 1.35
    let maxW = 0
    for (const line of lines) {
      const w = ctx.measureText(line).width
      if (w > maxW) maxW = w
    }

    const padX = 6
    const padY = 3
    const isStep = ann.tool === 'stepNote'
    const badgeDiameter = 22
    const badgeR = 11
    const badgeGap = 6
    const badgeW = isStep ? badgeDiameter + badgeGap : 0
    const totalHeight = lines.length * lineHeight
    const contentH = Math.max(isStep ? badgeDiameter : 0, totalHeight)

    ann.box = {
      x: ann.startX,
      y: ann.startY,
      width: maxW + padX * 2 + badgeW,
      height: contentH + padY * 2
    }

    if (ann.textStyle === 'filled') {
      ctx.save()
      ctx.fillStyle = ann.color
      ctx.beginPath()
      ctx.roundRect(ann.box.x, ann.box.y, ann.box.width, ann.box.height, 4)
      ctx.fill()
      ctx.restore()
    } else if (ann.textStyle === 'bordered') {
      ctx.save()
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
      ctx.beginPath()
      ctx.roundRect(ann.box.x, ann.box.y, ann.box.width, ann.box.height, 4)
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = ann.color
      ctx.stroke()
      ctx.restore()
    }

    const badgeCx = ann.startX + padX + badgeR
    const badgeCy = ann.startY + padY + Math.max(badgeR, Math.round(contentH / 2))

    if (isStep && ann.stepNumber) {
      ctx.save()
      ctx.fillStyle = ann.color
      ctx.beginPath()
      ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(ann.stepNumber), badgeCx, badgeCy)
      ctx.restore()
    }

    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    const textStartX = ann.startX + padX + badgeW
    const textCenterY = isStep && contentH === badgeDiameter ? badgeCy : ann.startY + padY + Math.round(contentH / 2)
    const firstLineCenterY = textCenterY - ((lines.length - 1) * lineHeight) / 2

    lines.forEach((line, i) => {
      const lineY = firstLineCenterY + i * lineHeight
      if (ann.textStyle === 'filled') {
        const isLight = ann.color === '#ffffff' || ann.color === '#ffc60a'
        ctx.fillStyle = isLight ? '#0f172a' : '#ffffff'
      } else {
        ctx.fillStyle = ann.color
      }
      ctx.fillText(line, textStartX, lineY)
    })
  } else if (ann.tool === 'tag' && ann.text) {
    if (ann.id === textInputState.value.editingId) {
      ctx.restore()
      return
    }
    drawTagAnnotation(ctx, ann)
  } else if (ann.tool === 'step') {
    const radius = 11
    ctx.beginPath()
    ctx.arc(ann.startX, ann.startY, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(ann.stepNumber || 1), ann.startX, ann.startY)
  }

  ctx.restore()
}

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  return m
    ? {
        r: parseInt(m[1], 16),
        g: parseInt(m[2], 16),
        b: parseInt(m[3], 16)
      }
    : null
}

const drawWatermark = (
  ctx: CanvasRenderingContext2D,
  bounds: { x: number; y: number; width: number; height: number }
): void => {
  if (!isWatermarkActive.value) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height)
  ctx.clip()

  const hex = watermarkColor.value || '#8f959e'
  const rgb = hexToRgb(hex) || { r: 143, g: 149, b: 158 }
  const isWhite = rgb.r > 240 && rgb.g > 240 && rgb.b > 240

  if (isWhite) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
    ctx.shadowBlur = 3
    ctx.shadowOffsetX = 1
    ctx.shadowOffsetY = 1
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
  } else {
    ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.32)`
  }
  ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const text = watermarkText.value || '内部资料'
  const stepX = 180
  const stepY = 110

  for (let x = bounds.x - 100; x < bounds.x + bounds.width + 100; x += stepX) {
    for (let y = bounds.y - 100; y < bounds.y + bounds.height + 100; y += stepY) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate((-25 * Math.PI) / 180)
      ctx.fillText(text, 0, 0)
      ctx.restore()
    }
  }
  ctx.restore()
}

const renderCanvas = (): void => {
  const canvas = annotationCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.save()
  ctx.scale(dpr, dpr)

  for (const ann of annotations.value) {
    drawSingleAnnotation(ctx, ann)
  }
  if (currentAnnotation.value) {
    drawSingleAnnotation(ctx, currentAnnotation.value)
  }

  if (isWatermarkActive.value) {
    drawWatermark(ctx, {
      x: 0,
      y: 0,
      width: canvas.width / dpr,
      height: canvas.height / dpr
    })
  }

  // Live Tag Anchor and Notch while actively typing in tag editor
  if (textInputState.value.active && textInputState.value.isTag && activeTagLayout.value) {
    const l = activeTagLayout.value
    ctx.save()
    ctx.beginPath()
    ctx.arc(l.dotX, l.dotY, l.dotRadius, 0, Math.PI * 2)
    ctx.fillStyle = activeColor.value
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(l.notchPoints.tip.x, l.notchPoints.tip.y)
    ctx.lineTo(l.notchPoints.p1.x, l.notchPoints.p1.y)
    ctx.lineTo(l.notchPoints.p2.x, l.notchPoints.p2.y)
    ctx.closePath()
    ctx.fillStyle = isDarkTheme.value ? '#2b2f3a' : '#ffffff'
    ctx.fill()
    if (!isDarkTheme.value) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)'
      ctx.lineWidth = 1
      ctx.stroke()
    }
    ctx.restore()
  }

  ctx.restore()
}

const onCanvasMouseDown = (e: MouseEvent): void => {
  // The root handler owns window dragging. Keep canvas interactions local so
  // opening a text/tag editor is not immediately committed by that handler.
  e.stopPropagation()
  if (!isEditing.value) return
  if (e.button !== 0 && e.button !== 1) return

  if (textInputState.value.active) {
    commitTextInput()
  }

  // In edit mode: if no tool is selected ('none') or Space is pressed, drag the window
  if (e.button === 1 || isSpacePressed.value || activeTool.value === 'none') {
    if (e.button === 0 || e.button === 1) {
      e.preventDefault()
      e.stopPropagation()
      isDragging = true
      isWindowDragging.value = true
      startScreenX = e.screenX
      startScreenY = e.screenY
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    }
    return
  }

  if (e.button !== 0) return

  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  if (activeTool.value === 'text') {
    openTextEditor(x, y, null, false, false, 1)
    return
  }

  if (activeTool.value === 'tag') {
    openTextEditor(x, y, null, true, false, 1)
    return
  }

  if (activeTool.value === 'stepNote') {
    openTextEditor(x, y, null, false, true, stepCounter.value)
    return
  }

  if (activeTool.value === 'step') {
    pushAnnotation({
      id: `pin_ann_${Date.now()}`,
      tool: 'step',
      color: activeColor.value,
      strokeWidth: strokeWidth.value,
      startX: x,
      startY: y,
      endX: x,
      endY: y,
      stepNumber: stepCounter.value++
    })
    renderCanvas()
    return
  }

  isDrawingAnnotation = true
  const annId = `ann_${Date.now()}`

  if (activeTool.value === 'pencil') {
    currentAnnotation.value = {
      id: annId,
      tool: 'pencil',
      color: activeColor.value,
      strokeWidth: strokeWidth.value,
      startX: x,
      startY: y,
      endX: x,
      endY: y,
      points: [{ x, y }]
    }
  } else if (activeTool.value === 'marker') {
    currentAnnotation.value = {
      id: annId,
      tool: 'marker',
      color: activeColor.value,
      strokeWidth: strokeWidth.value,
      startX: x,
      startY: y,
      endX: x,
      endY: y,
      points: [{ x, y }]
    }
  } else if (activeTool.value === 'highlight') {
    currentAnnotation.value = {
      id: annId,
      tool: 'highlight',
      color: activeColor.value,
      strokeWidth: strokeWidth.value,
      startX: x,
      startY: y,
      endX: x,
      endY: y
    }
  } else if (activeTool.value === 'mosaic') {
    currentAnnotation.value = {
      id: annId,
      tool: 'mosaic',
      color: 'transparent',
      strokeWidth: 1,
      startX: x,
      startY: y,
      endX: x,
      endY: y,
      mosaicMode: mosaicMode.value,
      mosaicStyle: mosaicStyle.value,
      mosaicBlockSize: Math.max(4, Math.round((mosaicIntensity.value / 100) * 20 + 4)),
      points: mosaicMode.value === 'brush' ? [{ x, y }] : undefined
    }
  } else {
    currentAnnotation.value = {
      id: annId,
      tool: activeTool.value as any,
      color: activeColor.value,
      strokeWidth: strokeWidth.value,
      startX: x,
      startY: y,
      endX: x,
      endY: y
    }
  }
  renderCanvas()
}

const onCanvasMouseMove = (e: MouseEvent): void => {
  if (isDragging) {
    return
  }
  if (!isDrawingAnnotation || !currentAnnotation.value) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  const ann = currentAnnotation.value
  ann.endX = x
  ann.endY = y

  if ((ann.tool === 'pencil' || ann.tool === 'marker' || (ann.tool === 'mosaic' && ann.mosaicMode === 'brush')) && ann.points) {
    ann.points.push({ x, y })
  }
  renderCanvas()
}

const onCanvasMouseUp = (): void => {
  if (isDragging || isWindowDragging.value) {
    onMouseUp()
  }
  if (!isDrawingAnnotation || !currentAnnotation.value) return
  isDrawingAnnotation = false

  const ann = currentAnnotation.value
  currentAnnotation.value = null

  const dist = Math.hypot(ann.endX - ann.startX, ann.endY - ann.startY)
  if (dist > 3 || (ann.points && ann.points.length > 2)) {
    pushAnnotation(ann)
  }
  renderCanvas()
}

const openTextEditor = (
  x: number,
  y: number,
  existingId?: string | null,
  isTag = false,
  isStep = false,
  stepNum = 1
): void => {
  let initialText = ''
  if (existingId) {
    const existing = annotations.value.find((a) => a.id === existingId)
    if (existing) {
      initialText = existing.text || ''
      x = existing.startX
      y = existing.startY
      if (existing.tool === 'tag') {
        isTag = true
        if (existing.tagDirection) {
          tagDirection.value = existing.tagDirection
        }
      } else if (existing.tool === 'stepNote') {
        isStep = true
        stepNum = existing.stepNumber || 1
      }
    }
  }

  textInputState.value = {
    active: true,
    editingId: existingId || null,
    isTag,
    isStepNote: isStep,
    stepNumber: stepNum,
    x,
    y,
    text: initialText
  }

  window.electron.ipcRenderer.send('mt::pin-text-mode', true, pinId.value)

  const focusInput = () => {
    const el = textInputRef.value
    if (el) {
      el.focus({ preventScroll: true })
      const len = el.value.length
      el.setSelectionRange(len, len)
      autoResizeTextarea()
    }
  }
  nextTick(focusInput)
  requestAnimationFrame(focusInput)
  setTimeout(focusInput, 60)
}

const onCompositionStart = (): void => {
  isComposing.value = true
}

const onCompositionEnd = (): void => {
  isComposing.value = false
  autoResizeTextarea()
}

const autoResizeTextarea = (): void => {
  const el = textInputRef.value
  if (!el) return
  el.style.width = 'auto'
  el.style.height = 'auto'
  const fSize = fontSizeVal.value
  el.style.width = `${Math.max(textInputState.value.isTag ? 40 : 60, el.scrollWidth + 12)}px`
  el.style.height = `${Math.max(Math.round(fSize * 1.4), el.scrollHeight)}px`
  if (textInputState.value.isTag) {
    renderCanvas()
  }
}

const onTextareaKeydown = (e: KeyboardEvent): void => {
  if (isComposing.value || e.isComposing) return

  if (e.key === 'Escape') {
    e.preventDefault()
    cancelTextInput()
    return
  }

  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    commitTextInput()
    return
  }

  nextTick(() => {
    autoResizeTextarea()
  })
}

const commitTextInput = (): void => {
  if (!textInputState.value.active) return

  const rawText = textInputState.value.text.trim()
  const isTag = textInputState.value.isTag
  const isStep = textInputState.value.isStepNote
  const stepNum = textInputState.value.stepNumber

  if (!rawText) {
    if (textInputState.value.editingId) {
      annotations.value = annotations.value.filter((a) => a.id !== textInputState.value.editingId)
      pushHistorySnapshot()
    }
  } else {
    if (textInputState.value.editingId) {
      const target = annotations.value.find((a) => a.id === textInputState.value.editingId)
      if (target) {
        target.text = textInputState.value.text
        target.color = activeColor.value
        target.strokeWidth = strokeWidth.value
        target.textStyle = textStyle.value
        target.fontSize = fontSizeVal.value
        if (target.tool === 'tag') {
          target.tagDirection = tagDirection.value
        }
        pushHistorySnapshot()
      }
    } else {
      pushAnnotation({
        id: `pin_ann_${Date.now()}`,
        tool: isTag ? 'tag' : isStep ? 'stepNote' : 'text',
        color: activeColor.value,
        strokeWidth: strokeWidth.value,
        startX: textInputState.value.x,
        startY: textInputState.value.y,
        endX: textInputState.value.x,
        endY: textInputState.value.y,
        text: textInputState.value.text,
        textStyle: textStyle.value,
        fontSize: fontSizeVal.value,
        tagDirection: isTag ? tagDirection.value : undefined,
        stepNumber: isStep ? stepNum : undefined
      })
      if (isStep) {
        stepCounter.value = Math.max(stepCounter.value, stepNum + 1)
      }
    }
  }

  textInputState.value.active = false
  textInputState.value.editingId = null
  textInputState.value.isTag = false
  textInputState.value.isStepNote = false
  textInputState.value.text = ''
  window.electron.ipcRenderer.send('mt::pin-text-mode', false, pinId.value)
  renderCanvas()
}

const cancelTextInput = (): void => {
  textInputState.value.active = false
  textInputState.value.editingId = null
  textInputState.value.isTag = false
  textInputState.value.isStepNote = false
  textInputState.value.text = ''
  window.electron.ipcRenderer.send('mt::pin-text-mode', false, pinId.value)
  renderCanvas()
}

const pushAnnotation = (ann: Annotation): void => {
  annotations.value.push(ann)
  pushHistorySnapshot()
}

const pushHistorySnapshot = (): void => {
  if (historyIndex.value < historyStack.value.length - 1) {
    historyStack.value = historyStack.value.slice(0, historyIndex.value + 1)
  }
  historyStack.value.push(JSON.parse(JSON.stringify(annotations.value)))
  historyIndex.value = historyStack.value.length - 1
  syncToolbarState()
}

let isUndoing = false
const undo = (): void => {
  if (isUndoing) return
  isUndoing = true
  try {
    if (textInputState.value.active) {
      cancelTextInput()
      return
    }
    if (historyIndex.value > 0) {
      historyIndex.value--
      annotations.value = JSON.parse(JSON.stringify(historyStack.value[historyIndex.value]))
      renderCanvas()
    } else if (historyIndex.value === 0) {
      historyIndex.value = -1
      annotations.value = []
      renderCanvas()
    }
    syncToolbarState()
  } finally {
    isUndoing = false
  }
}

const syncToolbarState = (): void => {
  if (!isEditing.value) return
  window.electron.ipcRenderer.send('mt::pin-edit-state-sync', {
    pinId: pinId.value,
    state: {
      activeTool: activeTool.value,
      activeColor: activeColor.value,
      strokeWidth: strokeWidth.value,
      textStyle: textStyle.value,
      fontSize: fontSizeVal.value,
      mosaicStyle: mosaicStyle.value,
      mosaicMode: mosaicMode.value,
      mosaicIntensity: mosaicIntensity.value,
      tagDirection: tagDirection.value,
      stepCount: stepCounter.value,
      isWatermarkActive: isWatermarkActive.value,
      watermarkText: watermarkText.value,
      watermarkColor: watermarkColor.value,
      isDarkTheme: isDarkTheme.value,
      canUndo: annotations.value.length > 0 || historyIndex.value >= 0
    }
  })
}

const handleToolbarAction = (action: string, actPayload?: any): void => {
  switch (action) {
    case 'setTool':
      setTool(actPayload?.tool || actPayload)
      break
    case 'setColor':
      activeColor.value = actPayload?.color || actPayload
      break
    case 'setStrokeWidth':
      strokeWidth.value = actPayload?.strokeWidth || actPayload
      break
    case 'setTextStyle':
      textStyle.value = actPayload?.textStyle || actPayload
      break
    case 'setFontSize':
      fontSizeVal.value = actPayload?.fontSize || actPayload
      break
    case 'setMosaicStyle':
      mosaicStyle.value = actPayload?.mosaicStyle || actPayload
      break
    case 'setMosaicMode':
      mosaicMode.value = actPayload?.mosaicMode || actPayload
      break
    case 'setMosaicIntensity':
      mosaicIntensity.value = actPayload?.intensity || actPayload?.mosaicIntensity || actPayload
      break
    case 'cycleTagDirection':
      cycleTagDirection()
      break
    case 'resetStep':
      stepCounter.value = 1
      break
    case 'toggleWatermark':
      if (!watermarkText.value) {
        watermarkText.value = '内部资料'
      }
      isWatermarkActive.value = !isWatermarkActive.value
      if (isWatermarkActive.value) {
        activeTool.value = 'watermark'
      } else if (activeTool.value === 'watermark') {
        activeTool.value = 'none'
      }
      renderCanvas()
      break
    case 'setWatermarkText':
      watermarkText.value = actPayload?.watermarkText || actPayload?.text || ''
      isWatermarkActive.value = true
      renderCanvas()
      break
    case 'setWatermarkColor':
      watermarkColor.value = actPayload?.color || actPayload
      renderCanvas()
      syncToolbarState()
      break
    case 'undo':
      undo()
      break
    case 'save':
      saveEdit()
      break
    case 'cancel':
      cancelEdit()
      break
    case 'confirm':
      confirmEdit()
      break
  }
  syncToolbarState()
}

const toggleEditMode = async (): Promise<void> => {
  if (isEditing.value) {
    cancelEdit()
  } else {
    isEditing.value = true
    activeTool.value = 'none'
    annotations.value = []
    historyIndex.value = -1
    historyStack.value = []
    isWatermarkActive.value = false
    watermarkText.value = ''

    nextTick(() => {
      initEditCanvas()
      window.electron.ipcRenderer.send('mt::pin-edit-toolbar-open', {
        pinId: pinId.value,
        bounds: {
          x: window.screenX,
          y: window.screenY,
          width: window.outerWidth,
          height: window.outerHeight
        }
      })
      syncToolbarState()
    })
  }
}

const setTool = (tool: ToolType): void => {
  if (textInputState.value.active) {
    commitTextInput()
  }
  if (activeTool.value === tool) {
    activeTool.value = 'none'
  } else {
    activeTool.value = tool
  }
}

const confirmEdit = async (): Promise<void> => {
  if (!isEditing.value) return
  if (textInputState.value.active) {
    commitTextInput()
  }

  const img = pinnedImgRef.value
  if (!img) return

  const outCanvas = document.createElement('canvas')
  const natW = img.naturalWidth || img.width
  const natH = img.naturalHeight || img.height
  outCanvas.width = natW
  outCanvas.height = natH
  const oCtx = outCanvas.getContext('2d')
  if (!oCtx) return

  oCtx.drawImage(img, 0, 0, natW, natH)

  const canvas = annotationCanvasRef.value
  if (canvas) {
    const scaleX = natW / (parseFloat(canvas.style.width) || canvas.width)
    const scaleY = natH / (parseFloat(canvas.style.height) || canvas.height)
    oCtx.save()
    oCtx.scale(scaleX, scaleY)
    for (const ann of annotations.value) {
      drawSingleAnnotation(oCtx, ann)
    }
    if (isWatermarkActive.value) {
      drawWatermark(oCtx, {
        x: 0,
        y: 0,
        width: parseFloat(canvas.style.width) || canvas.width,
        height: parseFloat(canvas.style.height) || canvas.height
      })
    }
    oCtx.restore()
  }

  const newContent = outCanvas.toDataURL('image/png')
  if (payload.value) {
    payload.value.content = newContent
    payload.value.width = natW
    payload.value.height = natH
  }

  // If this pin window originated from a Markdown image, synchronize back to Markdown
  if (payload.value?.markdownMeta) {
    try {
      await window.electron.ipcRenderer.invoke('mt::pin-markdown-update', {
        markdownMeta: payload.value.markdownMeta,
        newContent
      })
    } catch (err) {
      console.error('Failed to update markdown image from pin edit:', err)
    }
  }

  try {
    await window.electron.ipcRenderer.invoke('mt::pin-window-copy', newContent)
    copiedFeedback.value = true
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copiedFeedback.value = false
    }, 1600)
  } catch {}

  isEditing.value = false
  window.electron.ipcRenderer.send('mt::pin-edit-toolbar-close', pinId.value)
  if (imgResizeObserver) {
    imgResizeObserver.disconnect()
    imgResizeObserver = null
  }
}

const cancelEdit = (): void => {
  if (textInputState.value.active) {
    cancelTextInput()
  }
  isEditing.value = false
  annotations.value = []
  historyIndex.value = -1
  historyStack.value = []
  isWatermarkActive.value = false
  watermarkText.value = ''

  window.electron.ipcRenderer.send('mt::pin-edit-toolbar-close', pinId.value)
  if (imgResizeObserver) {
    imgResizeObserver.disconnect()
    imgResizeObserver = null
  }
}

const saveEdit = async (): Promise<void> => {
  if (textInputState.value.active) {
    commitTextInput()
  }
  const img = pinnedImgRef.value
  if (!img) return

  const outCanvas = document.createElement('canvas')
  const natW = img.naturalWidth || img.width
  const natH = img.naturalHeight || img.height
  outCanvas.width = natW
  outCanvas.height = natH
  const oCtx = outCanvas.getContext('2d')
  if (!oCtx) return

  oCtx.drawImage(img, 0, 0, natW, natH)

  const canvas = annotationCanvasRef.value
  if (canvas) {
    const scaleX = natW / (parseFloat(canvas.style.width) || canvas.width)
    const scaleY = natH / (parseFloat(canvas.style.height) || canvas.height)
    oCtx.save()
    oCtx.scale(scaleX, scaleY)
    for (const ann of annotations.value) {
      drawSingleAnnotation(oCtx, ann)
    }
    if (isWatermarkActive.value) {
      drawWatermark(oCtx, {
        x: 0,
        y: 0,
        width: parseFloat(canvas.style.width) || canvas.width,
        height: parseFloat(canvas.style.height) || canvas.height
      })
    }
    oCtx.restore()
  }

  const newContent = outCanvas.toDataURL('image/png')
  await window.electron.ipcRenderer.invoke('mt::pin-window-save', newContent)
}

const onMouseDown = (e: MouseEvent): void => {
  if (e.button !== 0) return
  contextMenuVisible.value = false
  if (isEditing.value) {
    if (textInputState.value.active) {
      commitTextInput()
    }
    // Only allow window dragging if no specific drawing tool is active
    if (activeTool.value === 'none' || isSpacePressed.value) {
      isDragging = true
      isWindowDragging.value = true
      startScreenX = e.screenX
      startScreenY = e.screenY
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    }
    return
  }
  isDragging = true
  isWindowDragging.value = true
  startScreenX = e.screenX
  startScreenY = e.screenY

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

const onMouseMove = (e: MouseEvent): void => {
  if (!isDragging) return
  const dx = e.screenX - startScreenX
  const dy = e.screenY - startScreenY
  startScreenX = e.screenX
  startScreenY = e.screenY

  window.electron.ipcRenderer.send('mt::pin-window-drag', {
    dx,
    dy,
    pinId: pinId.value || payload.value?.id
  })
}

const onMouseUp = (): void => {
  if (isDragging || isWindowDragging.value) {
    isDragging = false
    isWindowDragging.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }
}

// -------------------------------------------------------------
// Manual 8-Directional Window Resizing
// -------------------------------------------------------------
let isResizing = false
let resizeDir = ''
let resizeStartMouseX = 0
let resizeStartMouseY = 0
let resizeInitBounds = { x: 0, y: 0, width: 0, height: 0 }
let resizeAspectRatio = 1

const onResizeStart = async (dir: string, e: MouseEvent): Promise<void> => {
  if (e.button !== 0) return
  contextMenuVisible.value = false
  isResizing = true
  resizeDir = dir
  resizeStartMouseX = e.screenX
  resizeStartMouseY = e.screenY

  try {
    const bounds = await window.electron.ipcRenderer.invoke(
      'mt::pin-window-get-bounds',
      pinId.value
    )
    if (bounds) {
      resizeInitBounds = bounds
    } else {
      resizeInitBounds = {
        x: window.screenX,
        y: window.screenY,
        width: window.innerWidth,
        height: window.innerHeight
      }
    }
  } catch {
    resizeInitBounds = {
      x: window.screenX,
      y: window.screenY,
      width: window.innerWidth,
      height: window.innerHeight
    }
  }

  resizeAspectRatio =
    currentNaturalWidth && currentNaturalHeight
      ? currentNaturalWidth / currentNaturalHeight
      : resizeInitBounds.width / Math.max(1, resizeInitBounds.height)

  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', onResizeEnd)
}

const onResizeMove = (e: MouseEvent): void => {
  if (!isResizing) return
  const dx = e.screenX - resizeStartMouseX
  const dy = e.screenY - resizeStartMouseY

  const init = resizeInitBounds
  const ar = resizeAspectRatio || 1
  let newW = init.width
  let newH = init.height
  let newX = init.x
  let newY = init.y

  if (resizeDir === 'r') {
    newW = Math.max(20, init.width + dx)
    newH = Math.max(20, Math.round(newW / ar))
  } else if (resizeDir === 'l') {
    newW = Math.max(20, init.width - dx)
    newH = Math.max(20, Math.round(newW / ar))
    newX = init.x + (init.width - newW)
  } else if (resizeDir === 'b') {
    newH = Math.max(20, init.height + dy)
    newW = Math.max(20, Math.round(newH * ar))
  } else if (resizeDir === 't') {
    newH = Math.max(20, init.height - dy)
    newW = Math.max(20, Math.round(newH * ar))
    newY = init.y + (init.height - newH)
  } else if (resizeDir === 'br') {
    const scale = Math.max(0.05, (init.width + dx) / Math.max(1, init.width))
    newW = Math.max(20, Math.round(init.width * scale))
    newH = Math.max(20, Math.round(init.height * scale))
  } else if (resizeDir === 'bl') {
    const scale = Math.max(0.05, (init.width - dx) / Math.max(1, init.width))
    newW = Math.max(20, Math.round(init.width * scale))
    newH = Math.max(20, Math.round(init.height * scale))
    newX = init.x + (init.width - newW)
  } else if (resizeDir === 'tr') {
    const scale = Math.max(0.05, (init.width + dx) / Math.max(1, init.width))
    newW = Math.max(20, Math.round(init.width * scale))
    newH = Math.max(20, Math.round(init.height * scale))
    newY = init.y + (init.height - newH)
  } else if (resizeDir === 'tl') {
    const scale = Math.max(0.05, (init.width - dx) / Math.max(1, init.width))
    newW = Math.max(20, Math.round(init.width * scale))
    newH = Math.max(20, Math.round(init.height * scale))
    newX = init.x + (init.width - newW)
    newY = init.y + (init.height - newH)
  }

  window.electron.ipcRenderer.send('mt::pin-window-resize', {
    pinId: pinId.value,
    bounds: { x: newX, y: newY, width: newW, height: newH }
  })

  // Update zoom badge
  if (currentNaturalWidth) {
    const dpr = window.devicePixelRatio || 1
    const baseW = currentNaturalWidth / dpr
    if (baseW > 0) {
      zoomLevel.value = Math.max(0.01, Math.round((newW / baseW) * 100) / 100)
    }
  }
}

const onResizeEnd = (): void => {
  isResizing = false
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
}

let currentNaturalWidth = 0
let currentNaturalHeight = 0
let isProgrammaticResize = false

const onWindowResize = (): void => {
  if (isProgrammaticResize || isResizing) return
  if (!currentNaturalWidth || !currentNaturalHeight) return
  const dpr = window.devicePixelRatio || 1
  const baseW = currentNaturalWidth / dpr
  if (baseW > 0) {
    const computedZoom = window.innerWidth / baseW
    zoomLevel.value = Math.max(0.01, Math.round(computedZoom * 100) / 100)
  }
}

const onImageLoad = (e: Event): void => {
  const img = e.target as HTMLImageElement
  if (!img) return
  currentNaturalWidth = img.naturalWidth
  currentNaturalHeight = img.naturalHeight

  // Calculate actual initial zoom relative to base 100% logical size
  const dpr = window.devicePixelRatio || 1
  const baseW = currentNaturalWidth / dpr
  if (baseW > 0) {
    zoomLevel.value = Math.round((window.innerWidth / baseW) * 100) / 100
  }
}

const applyFitSize = (): void => {
  if (!currentNaturalWidth || !currentNaturalHeight) return
  isProgrammaticResize = true
  window.electron.ipcRenderer.send('mt::pin-window-fit-size', {
    pinId: pinId.value,
    naturalWidth: currentNaturalWidth,
    naturalHeight: currentNaturalHeight,
    zoom: zoomLevel.value
  })
  setTimeout(() => {
    isProgrammaticResize = false
  }, 120)
}

// Mouse Wheel Zoom: Geometric proportional continuous zooming
const onWheel = (e: WheelEvent): void => {
  e.preventDefault()
  if (Math.abs(e.deltaY) < 0.5) return

  const clampedDelta = Math.min(Math.max(e.deltaY, -120), 120)
  // Exponential scaling for consistent perceptual speed at any zoom level
  const factor = Math.exp(-clampedDelta * 0.0015)
  let nextZoom = zoomLevel.value * factor
  nextZoom = Math.min(Math.max(nextZoom, 0.05), 10.0)

  zoomLevel.value = Math.round(nextZoom * 100) / 100
  applyFitSize()
}

const resetZoom = (): void => {
  zoomLevel.value = 1.0
  contextMenuVisible.value = false
  applyFitSize()
}

const setZoom = (z: number): void => {
  zoomLevel.value = z
  contextMenuVisible.value = false
  applyFitSize()
}

const toggleAlwaysOnTop = (): void => {
  isAlwaysOnTop.value = !isAlwaysOnTop.value
  window.electron.ipcRenderer.send(
    'mt::pin-window-set-always-on-top',
    isAlwaysOnTop.value,
    pinId.value
  )
  contextMenuVisible.value = false
}

const closePin = (): void => {
  const id = pinId.value || payload.value?.id
  if (isEditing.value) {
    cancelEdit()
  }
  window.electron.ipcRenderer.send('mt::pin-window-close', id)
}

const onDoubleClick = (): void => {
  if (isEditing.value) return
  closePin()
}

const copyPin = async (): Promise<void> => {
  if (!payload.value) return
  contextMenuVisible.value = false
  try {
    const success = await window.electron.ipcRenderer.invoke('mt::pin-window-copy', payload.value.content)
    if (success !== false) {
      copiedFeedback.value = true
      if (copiedTimer) clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => {
        copiedFeedback.value = false
      }, 1600)
    }
  } catch (err) {
    console.error('Failed to copy pin content:', err)
  }
}

const savePin = async (): Promise<void> => {
  if (!payload.value) return
  await window.electron.ipcRenderer.invoke('mt::pin-window-save', payload.value.content)
  contextMenuVisible.value = false
}

const openContextMenu = (e: MouseEvent): void => {
  contextMenuVisible.value = true
  contextMenuX.value = Math.min(e.clientX, window.innerWidth - 160)
  contextMenuY.value = Math.min(e.clientY, window.innerHeight - 200)
}

const onKeydown = (e: KeyboardEvent): void => {
  if (isEditing.value) {
    if (textInputState.value.active) {
      return
    }
    if (e.code === 'Space') {
      isSpacePressed.value = true
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      confirmEdit()
      return
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault()
      undo()
      return
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault()
      saveEdit()
      return
    }
    if (!e.metaKey && !e.ctrlKey && !e.altKey) {
      const k = e.key.toLowerCase()
      if (k === 'r') { setTool('rect'); return }
      if (k === 'c') { setTool('circle'); return }
      if (k === 'l') { setTool('line'); return }
      if (k === 'a') { setTool('arrow'); return }
      if (k === 'p') { setTool('pencil'); return }
      if (k === 't') { setTool('text'); return }
      if (k === 'g') { setTool('tag'); return }
      if (k === 'm') { setTool('mosaic'); return }
    }
    return
  }

  if (e.key === 'Escape') {
    e.preventDefault()
    closePin()
    return
  }

  // Number keys 1-9, 0 for opacity (Snipaste feature)
  if (e.key >= '1' && e.key <= '9') {
    windowOpacity.value = Number(e.key) / 10
  } else if (e.key === '0') {
    windowOpacity.value = 1.0
  }

  if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) {
    e.preventDefault()
    copyPin()
    return
  }

  if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
    e.preventDefault()
    savePin()
    return
  }
}

let removeDataSub: (() => void) | null = null

const getImageSrc = (content?: string): string => {
  if (!content) return ''
  if (content.startsWith('data:') || content.startsWith('http://') || content.startsWith('https://')) {
    return content
  }
  if (content.startsWith('/')) {
    return `file://${content}`
  }
  return content
}

onMounted(async () => {
  detectTheme()
  detectLanguage()

  let id = new URLSearchParams(window.location.search).get('pinId')
  if (!id && window.location.hash.includes('?')) {
    id = new URLSearchParams(window.location.hash.split('?')[1]).get('pinId')
  }
  pinId.value = id || ''

  try {
    window.electron.ipcRenderer.send('mt::ask-for-user-preference')
    window.electron.ipcRenderer.on('mt::user-preference', (_e, prefs: any) => {
      if (prefs) {
        if (prefs.theme) {
          isDarkTheme.value = isDarkThemeId(prefs.theme)
        }
        if (prefs.language) {
          currentLang.value = prefs.language
        }
      }
    })
    window.electron.ipcRenderer.on('language-changed', (_e, lang: string) => {
      if (lang) currentLang.value = lang
    })
  } catch (err) {
    console.warn('Failed to query user preferences:', err)
  }

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      const localTheme = localStorage.getItem('current-theme')
      if (!localTheme) {
        isDarkTheme.value = e.matches
      }
    })
  }

  try {
    const data = await window.electron.ipcRenderer.invoke(
      'mt::pin-window-get-payload',
      pinId.value
    )
    if (data) {
      payload.value = data
    }
  } catch (err) {
    console.error('Failed to get pin payload:', err)
  }

  removeDataSub = window.electron.ipcRenderer.on('mt::pin-window-data', (_event, data) => {
    if (data) {
      payload.value = data
    }
  })

  unlistenToolbarAction = window.electron.ipcRenderer.on('mt::pin-edit-action', (_event, data: any) => {
    if (data?.pinId !== pinId.value) return
    const { action } = data
    handleToolbarAction(action, data)
  })

  window.addEventListener('click', () => {
    contextMenuVisible.value = false
  })

  window.addEventListener('resize', onWindowResize)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('keyup', onKeyup)
  window.addEventListener('pointerup', onMouseUp)

  nextTick(() => {
    window.electron.ipcRenderer.send('mt::pin-window-focus', pinId.value)
  })
})

const onMouseEnter = (): void => {
  window.electron.ipcRenderer.send('mt::pin-window-focus', pinId.value)
}

let unlistenToolbarAction: (() => void) | null = null

const onKeyup = (e: KeyboardEvent): void => {
  if (e.code === 'Space') {
    isSpacePressed.value = false
  }
}

onUnmounted(() => {
  if (removeDataSub) removeDataSub()
  if (unlistenToolbarAction) {
    unlistenToolbarAction()
    unlistenToolbarAction = null
  }
  if (isEditing.value) {
    window.electron.ipcRenderer.send('mt::pin-edit-toolbar-close', pinId.value)
  }
  if (copiedTimer) clearTimeout(copiedTimer)
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
  window.removeEventListener('resize', onWindowResize)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('keyup', onKeyup)
  window.removeEventListener('pointerup', onMouseUp)
})
</script>

<style scoped>
.pin-window-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100vw;
  height: 100vh;
  margin: 0;
  padding: 0;
  display: block;
  background: transparent;
  user-select: none;
  overflow: hidden;
  outline: none;
  box-sizing: border-box;
}

/* macOS: Keep original grab & grabbing */
.platform-mac.pin-window-container {
  cursor: grab;
}

.platform-mac.pin-window-container:active {
  cursor: grabbing;
}

/* Windows & Linux: Use native hardware move cursor to prevent invisible software cursor */
.platform-other.pin-window-container {
  cursor: move;
}

.platform-other.pin-window-container:active {
  cursor: move;
}

/* Hover Action Bar */
.hover-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 3px;
  border-radius: 6px;
  padding: 3px 6px;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease, border-color 0.15s ease;
  z-index: 1000;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.pin-window-container:hover .hover-toolbar {
  opacity: 1;
}

/* Theme Light (Default & White Backgrounds) */
.theme-light .hover-toolbar {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.06);
}

.theme-light .zoom-badge {
  color: #646a73;
}

.theme-light .mini-btn {
  color: #4e5969;
}

.theme-light .mini-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #1f2329;
}

.theme-light .mini-btn.close:hover {
  background: rgba(245, 63, 63, 0.12);
  color: #f53f3f;
}

/* Theme Dark */
.theme-dark .hover-toolbar {
  background: rgba(24, 26, 32, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
}

.theme-dark .zoom-badge {
  color: #94a3b8;
}

.theme-dark .mini-btn {
  color: #cbd5e1;
}

.theme-dark .mini-btn:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff;
}

.theme-dark .mini-btn.close:hover {
  background: #ef4444;
  color: #ffffff;
}

.zoom-badge {
  font-size: 11px;
  padding: 0 4px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', monospace;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.mini-btn {
  background: transparent;
  border: none;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 5px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  transition: all 0.12s ease;
}

.mini-btn.btn-success {
  color: #22c55e !important;
  background: rgba(34, 197, 94, 0.16) !important;
}

.pin-copy-toast {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(24, 26, 32, 0.92);
  color: #ffffff;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  pointer-events: none;
  z-index: 2000;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -40%);
}

.mini-btn svg {
  display: block;
}

.mini-btn.zoom-btn {
  font-size: 11px;
  padding: 3px 6px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
}

/* Pinned Image View with Crisp Borders and Subtle Shadows across All Platforms */
.pinned-image-view {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-sizing: border-box;
  border-radius: 4px;
  cursor: inherit;
}

.theme-light .pinned-image-view {
  /* Crisp Card Border: Semi-transparent dark outline + Inner crisp highlight + Depth shadow */
  border: 1.5px solid rgba(0, 0, 0, 0.22);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.7),
    inset 0 1px 3px rgba(0, 0, 0, 0.08),
    0 4px 16px rgba(0, 0, 0, 0.16);
  background: #ffffff;
}

.theme-dark .pinned-image-view {
  /* Dark mode: Crisp light border + Deep shadows */
  border: 1.5px solid rgba(255, 255, 255, 0.24);
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.7),
    inset 0 1px 3px rgba(0, 0, 0, 0.5),
    0 6px 20px rgba(0, 0, 0, 0.55);
  background: #18191d;
}

.pinned-img {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  display: block;
  object-fit: contain;
  border-radius: 2.5px;
  margin: 0;
  padding: 0;
  cursor: inherit;
}

/* Pinned Text View */
.pinned-text-view {
  width: 90%;
  height: 90%;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform-origin: center center;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.theme-light .pinned-text-view {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(0, 0, 0, 0.12);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.2);
}

.theme-dark .pinned-text-view {
  background: rgba(26, 29, 36, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.65);
}

.text-card-header {
  height: 36px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}

.theme-light .text-card-header {
  background: rgba(0, 0, 0, 0.03);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.theme-dark .text-card-header {
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.mac-traffic-dots {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.1s ease, filter 0.1s ease;
}

.dot:hover {
  transform: scale(1.15);
  filter: brightness(1.2);
}

.dot-close {
  background: #ff5f56;
  border: 1px solid #e0443e;
}

.dot-copy {
  background: #ffbd2e;
  border: 1px solid #dea123;
}

.dot-ontop {
  background: #27c93f;
  border: 1px solid #1aab29;
}

.text-card-badge {
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60%;
}

.theme-light .text-card-badge {
  color: #b45309;
}

.theme-dark .text-card-badge {
  color: #f59e0b;
}

.header-action-btn {
  border: none;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.12s ease;
}

.theme-light .header-action-btn {
  background: rgba(0, 0, 0, 0.06);
  color: #334155;
}

.theme-light .header-action-btn:hover {
  background: #336df4;
  color: #ffffff;
}

.theme-dark .header-action-btn {
  background: rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
}

.theme-dark .header-action-btn:hover {
  background: #3b82f6;
  color: #ffffff;
}

.text-card-body {
  flex: 1;
  padding: 12px;
  overflow: auto;
}

.text-content {
  margin: 0;
  font-family: 'JetBrains Mono', Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.theme-light .text-content {
  color: #1e293b;
}

.theme-dark .text-content {
  color: #f1f5f9;
}

/* Custom Context Menu */
.custom-context-menu {
  position: absolute;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 8px;
  padding: 4px;
  z-index: 2000;
  min-width: 140px;
}

.theme-light .custom-context-menu {
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
}

.theme-dark .custom-context-menu {
  background: rgba(24, 27, 34, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.65);
}

.menu-item {
  padding: 6px 12px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s ease, color 0.1s ease;
}

.theme-light .menu-item {
  color: #1f2329;
}

.theme-light .menu-item:hover {
  background: rgba(51, 109, 244, 0.1);
  color: #336df4;
}

.theme-light .menu-item.danger:hover {
  background: rgba(245, 63, 63, 0.12);
  color: #f53f3f;
}

.theme-dark .menu-item {
  color: #cbd5e1;
}

.theme-dark .menu-item:hover {
  background: #3b82f6;
  color: #ffffff;
}

.theme-dark .menu-item.danger:hover {
  background: #ef4444;
  color: #ffffff;
}

.menu-divider {
  height: 1px;
  margin: 4px 0;
}

.theme-light .menu-divider {
  background: rgba(0, 0, 0, 0.08);
}

.theme-dark .menu-divider {
  background: rgba(255, 255, 255, 0.1);
}

/* Loading Placeholder */
.pinned-loading-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 220px;
  height: 140px;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 10px;
  font-size: 12px;
}

.theme-light .pinned-loading-view {
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  color: #475569;
}

.theme-dark .pinned-loading-view {
  background: rgba(24, 27, 34, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  color: #94a3b8;
}

.pinned-spinner {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.theme-light .pinned-spinner {
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-top-color: #336df4;
}

.theme-dark .pinned-spinner {
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: #3b82f6;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 8 Directional Resize Handles */
.resize-handle {
  position: absolute;
  z-index: 1500;
  box-sizing: border-box;
}

.handle-t {
  top: 0;
  left: 8px;
  right: 8px;
  height: 6px;
  cursor: ns-resize;
}

.handle-b {
  bottom: 0;
  left: 8px;
  right: 8px;
  height: 6px;
  cursor: ns-resize;
}

.handle-l {
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 6px;
  cursor: ew-resize;
}

.handle-r {
  right: 0;
  top: 8px;
  bottom: 8px;
  width: 6px;
  cursor: ew-resize;
}

.handle-tl {
  top: 0;
  left: 0;
  width: 10px;
  height: 10px;
  cursor: nwse-resize;
}

.handle-tr {
  top: 0;
  right: 0;
  width: 10px;
  height: 10px;
  cursor: nesw-resize;
}

.handle-bl {
  bottom: 0;
  left: 0;
  width: 10px;
  height: 10px;
  cursor: nesw-resize;
}

.handle-br {
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  cursor: nwse-resize;
}


.pin-annotation-canvas {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
  pointer-events: auto;
}

.pin-active-textbox {
  position: absolute;
  z-index: 20;
  border: 1.5px solid #336df4;
  border-radius: 4px;
  background: transparent;
  padding: 3px 6px;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
}

.textbox-handle {
  position: absolute;
  width: 5px;
  height: 5px;
  background: #336df4;
  pointer-events: none;
}

.textbox-handle.nw {
  top: -3px;
  left: -3px;
}
.textbox-handle.ne {
  top: -3px;
  right: -3px;
}
.textbox-handle.se {
  bottom: -3px;
  right: -3px;
}
.textbox-handle.sw {
  bottom: -3px;
  left: -3px;
}

.lark-textarea {
  border: none;
  outline: none;
  resize: none;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-weight: bold;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
  overflow: hidden;
  white-space: pre;
  word-break: normal;
  min-width: 80px;
  display: block;
  background: transparent;
}

.lark-textarea::placeholder {
  color: rgba(148, 163, 184, 0.7);
  font-weight: normal;
  font-size: 13px;
}

.lark-textarea::selection {
  background: rgba(59, 130, 246, 0.45) !important;
  color: #ffffff !important;
}

.pin-edit-bottom-toolbar {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  z-index: 1002;
  cursor: default;
  max-width: 96vw;
  user-select: none;
}

.toolbar-drag-grip {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8f959e;
  height: 36px;
  padding: 0 4px;
  cursor: grab;
  user-select: none;
  opacity: 0.85;
  transition: opacity 0.15s ease;
}

.toolbar-drag-grip:hover {
  opacity: 1;
}

.toolbar-drag-grip:active {
  cursor: grabbing;
}

.lark-primary-toolbar {
  display: flex;
  align-items: center;
  height: 44px;
  gap: 3px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  padding: 0 8px;
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.16), 0 2px 6px rgba(0, 0, 0, 0.08);
  transition: background-color 0.2s, border-color 0.2s;
  box-sizing: border-box;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.theme-dark .lark-primary-toolbar {
  background: #23252a;
  border-color: rgba(255, 255, 255, 0.14);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
}

.lark-tool-btn {
  background: transparent;
  border: none;
  color: #1f2329;
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: 7px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s ease;
  flex-shrink: 0;
  box-sizing: border-box;
}

.theme-dark .lark-tool-btn {
  color: #e2e8f0;
}

.lark-tool-btn:hover {
  background: rgba(31, 35, 41, 0.08);
  color: #1f2329;
}

.theme-dark .lark-tool-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.lark-tool-btn.active {
  background: #eef3fe !important;
  color: #336df4 !important;
}

.theme-dark .lark-tool-btn.active {
  background: rgba(51, 109, 244, 0.3) !important;
  color: #60a5fa !important;
}

.lark-tool-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.text-btn-label {
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: rgba(31, 35, 41, 0.12);
  margin: 0 3px;
}

.theme-dark .toolbar-divider {
  background: rgba(255, 255, 255, 0.14);
}

.action-confirm {
  color: #34be4b !important;
}

.action-confirm:hover {
  background: #e8f8ec !important;
  color: #34be4b !important;
}

.theme-dark .action-confirm {
  color: #4ade80 !important;
}

.theme-dark .action-confirm:hover {
  background: rgba(52, 190, 75, 0.22) !important;
  color: #4ade80 !important;
}

.action-close {
  color: #f64b45 !important;
}

.action-close:hover {
  background: #feeceb !important;
  color: #f64b45 !important;
}

.theme-dark .action-close {
  color: #f87171 !important;
}

.theme-dark .action-close:hover {
  background: rgba(246, 75, 69, 0.22) !important;
  color: #f87171 !important;
}

.action-save:hover {
  background: #e9eeff;
  color: #336df4;
}

/* Row 2: Contextual Property Bar */
.lark-sub-toolbar {
  position: relative;
  display: flex;
  align-items: center;
  height: 40px;
  gap: 8px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  padding: 0 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15), 0 2px 6px rgba(0, 0, 0, 0.08);
  box-sizing: border-box;
}

.theme-dark .lark-sub-toolbar {
  background: #23252a;
  border-color: rgba(255, 255, 255, 0.14);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
}

.text-style-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.style-btn {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  width: 28px;
  height: 28px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.1s ease;
  color: #1f2329;
}

.theme-dark .style-btn {
  color: #e2e8f0;
}

.style-btn:hover {
  background: rgba(31, 35, 41, 0.08);
}

.theme-dark .style-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.style-btn.active {
  background: #eef3fe;
  border-color: #336df4;
  color: #336df4;
}

.theme-dark .style-btn.active {
  background: rgba(51, 109, 244, 0.3);
  border-color: #60a5fa;
  color: #60a5fa;
}

.style-letter {
  font-weight: 700;
  font-size: 14px;
  line-height: 1;
}

.style-letter.transparent {
  color: #336df4;
}

.style-letter.bordered {
  border: 1.5px solid currentColor;
  border-radius: 3px;
  padding: 0 3px;
}

.style-letter.filled {
  background: #1f2329;
  color: #ffffff;
  border-radius: 3px;
  padding: 1px 4px;
}

.theme-dark .style-letter.filled {
  background: #ffffff;
  color: #1f2329;
}

.lark-dropdown {
  background: #f5f6f7;
  color: #1f2329;
  border: 1px solid #dee0e3;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 12px;
  font-weight: 600;
  height: 28px;
  outline: none;
  cursor: pointer;
  box-sizing: border-box;
}

.theme-dark .lark-dropdown {
  background: #2b2e35;
  color: #e2e8f0;
  border-color: rgba(255, 255, 255, 0.15);
}

.stroke-width-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stroke-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 6px;
  border: none;
  background: transparent;
  transition: all 0.12s ease;
  color: #1f2329;
}

.theme-dark .stroke-btn {
  color: #e2e8f0;
}

.stroke-btn:hover {
  background: rgba(31, 35, 41, 0.08);
}

.theme-dark .stroke-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.stroke-btn.active {
  background: rgba(51, 109, 244, 0.18);
  color: #336df4;
}

.theme-dark .stroke-btn.active {
  color: #60a5fa;
}

.stroke-dot {
  border-radius: 50%;
  background: currentColor;
}

.stroke-dot.thin {
  width: 4px;
  height: 4px;
}

.stroke-dot.medium {
  width: 7px;
  height: 7px;
}

.stroke-dot.thick {
  width: 10px;
  height: 10px;
}

.mosaic-style-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mosaic-btn {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  width: 28px;
  height: 28px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #1f2329;
}

.theme-dark .mosaic-btn {
  color: #e2e8f0;
}

.mosaic-btn.active {
  background: #eef3fe;
  border-color: #336df4;
  color: #336df4;
}

.theme-dark .mosaic-btn.active {
  background: rgba(51, 109, 244, 0.3);
  border-color: #60a5fa;
  color: #60a5fa;
}

.mosaic-presets {
  display: flex;
  align-items: center;
  gap: 4px;
}

.preset-pill {
  background: #f5f6f7;
  border: 1px solid #dee0e3;
  border-radius: 5px;
  padding: 2px 6px;
  font-size: 11px;
  cursor: pointer;
  color: #1f2329;
  white-space: nowrap;
  transition: all 0.12s ease;
}

.preset-pill:hover {
  background: #e5e7eb;
  color: #111827;
}

.preset-pill.active {
  background: #eef3fe;
  border-color: #336df4;
  color: #336df4;
  font-weight: 600;
}

.theme-dark .preset-pill {
  background: #2b2e35;
  color: #cbd5e1;
  border-color: rgba(255, 255, 255, 0.15);
}

.color-palette-group {
  display: flex;
  align-items: center;
  gap: 5px;
}

.color-swatch-btn {
  width: 20px;
  height: 20px;
  border-radius: 5px;
  cursor: pointer;
  border: 1.5px solid rgba(0, 0, 0, 0.15);
  transition: transform 0.12s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 0;
}

.color-swatch-btn:hover {
  transform: scale(1.15);
}

.color-swatch-btn.active {
  border-color: rgba(0, 0, 0, 0.35);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}

.theme-dark .color-swatch-btn {
  border-color: rgba(255, 255, 255, 0.25);
}

.theme-dark .color-swatch-btn.active {
  border-color: rgba(255, 255, 255, 0.5);
}

/* Lark-Style Active Callout Tag Bubble */
.lark-active-textbox.is-tag-bubble {
  border: 1px solid rgba(0, 0, 0, 0.12) !important;
  background: #ffffff !important;
  border-radius: 6px !important;
  padding: 4px 10px !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15) !important;
  outline: 1.5px solid #3370ff !important;
  outline-offset: 3px !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 0 !important;
}

.theme-dark .lark-active-textbox.is-tag-bubble {
  border: 1px solid rgba(255, 255, 255, 0.18) !important;
  background: #2b2f3a !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45) !important;
}

.lark-textarea.tag-bubble-input {
  background: transparent !important;
  color: inherit !important;
  caret-color: inherit !important;
  padding: 0 !important;
  margin: 0 !important;
  text-align: center !important;
}

/* Step Settings & Inline Badges */
.step-settings {
  display: flex;
  align-items: center;
  gap: 8px;
}

.step-badge-preview {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 13px;
  font-weight: bold;
}

.step-reset-btn {
  background: #f5f6f7;
  border: 1px solid #dee0e3;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  color: #1f2329;
  cursor: pointer;
}

.theme-dark .step-reset-btn {
  background: #2b2e35;
  color: #e2e8f0;
}

.step-badge-inline {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  color: #ffffff;
  font-size: 12px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-right: 6px;
}

/* Stroke selector for marker */
.stroke-selector {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stroke-option {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: transparent;
  transition: all 0.1s ease;
}

.stroke-option:hover {
  background: rgba(31, 35, 41, 0.08);
}

.stroke-option.active {
  background: rgba(51, 109, 244, 0.18);
}

/* Mosaic slider */
.mosaic-slider-group {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px;
}

.mosaic-slider-label {
  font-size: 12px;
  color: #646a73;
  white-space: nowrap;
}

.theme-dark .mosaic-slider-label {
  color: #94a3b8;
}

.mosaic-intensity-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 80px;
  height: 4px;
  background: #dee0e3;
  border-radius: 2px;
  outline: none;
}

.theme-dark .mosaic-intensity-slider {
  background: #4b5563;
}

.mosaic-slider-val {
  font-size: 12px;
  color: #646a73;
  min-width: 38px;
}

.theme-dark .mosaic-slider-val {
  color: #94a3b8;
}

</style>
