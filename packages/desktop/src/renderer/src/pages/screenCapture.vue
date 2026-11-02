<template>
  <div
    ref="containerRef"
    :class="['capture-fullscreen-container', isDarkTheme ? 'theme-dark' : 'theme-light']"
    :style="{ cursor: currentCursor }"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
    @dblclick="onDoubleClick"
    @wheel="onWheel"
    @contextmenu.prevent="onContextMenu"
    @keydown="onKeydown"
    tabindex="0"
  >
    <!-- Background Canvas (Screenshot + Mask + Drawing Annotations) -->
    <canvas ref="canvasRef" class="main-canvas"></canvas>

    <!-- Floating Brush Size Indicator (when wheel scrolling or adjusting pen/marker) -->
    <div
      v-if="brushPreviewVisible"
      class="brush-preview-hud"
      :style="{ left: `${brushPreviewPos.x}px`, top: `${brushPreviewPos.y}px` }"
    >
      <div
        class="brush-preview-circle"
        :style="{
          width: `${Math.max(6, brushPreviewSize)}px`,
          height: `${Math.max(6, brushPreviewSize)}px`,
          borderColor: activeColor,
          backgroundColor: activeTool === 'marker' ? activeColor + '66' : activeColor
        }"
      ></div>
      <span class="brush-preview-label">
        {{ activeTool === 'marker' ? '荧光笔' : '画笔' }} {{ Math.round(brushPreviewSize) }}px
      </span>
    </div>

    <!-- Active Text Editing Box with Lark-Style Blue Border and 4 Corner Handles -->
    <!-- IMMEDIATELY AUTO-FOCUSED ON CLICK, NO EXTRA CLICK REQUIRED -->
    <div
      v-if="textInputState.active"
      class="lark-active-textbox"
      :style="{
        left: `${textInputState.x}px`,
        top: `${textInputState.y}px`
      }"
      @mousedown.stop
      @mouseup.stop
      @click.stop
    >
      <!-- 4 Corner Dots -->
      <div class="textbox-handle nw"></div>
      <div class="textbox-handle ne"></div>
      <div class="textbox-handle se"></div>
      <div class="textbox-handle sw"></div>

      <!-- If it's a Step Note, display the non-editable step badge on the left -->
      <div
        v-if="textInputState.isStepNote"
        class="step-badge-inline"
        :style="{ backgroundColor: activeColor }"
      >
        {{ textInputState.stepNumber }}
      </div>

      <!-- Native Auto-resizing Textarea (Direct transparent background, full native IME candidate support) -->
      <textarea
        ref="textInputRef"
        v-focus
        v-model="textInputState.text"
        :class="['lark-textarea', textStyle]"
        :style="{
          color: textStyle === 'filled' ? (isLightActiveColor ? '#0f172a' : '#ffffff') : activeColor,
          backgroundColor:
            textStyle === 'filled'
              ? activeColor
              : textStyle === 'bordered'
                ? 'rgba(0, 0, 0, 0.45)'
                : 'transparent',
          fontSize: `${fontSizeVal}px`,
          lineHeight: '1.35',
          caretColor: textStyle === 'filled' ? (isLightActiveColor ? '#0f172a' : '#ffffff') : activeColor
        }"
        :placeholder="textInputState.isStepNote ? '输入步骤说明...' : '输入文字...'"
        rows="1"
        autofocus
        @input="autoResizeTextarea"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
        @keydown="onTextareaKeydown"
        @mousedown.stop
        @mouseup.stop
        @click.stop
      ></textarea>
    </div>

    <!-- Lark-Style Generous Floating Toolbar (Docked Right of Selection) -->
    <div
      v-if="hasSelection && !isDragging && !isScrollingCaptureMode"
      ref="toolbarRef"
      class="lark-toolbar-wrapper"
      :style="toolbarPositionStyle"
      @mousedown.stop
      @mouseup.stop
      @click.stop
    >
      <!-- Row 1: Primary Tool Palette (Lark Scale: Generous, Comfortable, High Affordance) -->
      <div class="lark-primary-toolbar">
        <div class="toolbar-drag-grip" title="工具栏">
          <svg viewBox="0 0 10 20" width="10" height="20" fill="currentColor">
            <circle cx="3" cy="4" r="1.5"></circle>
            <circle cx="7" cy="4" r="1.5"></circle>
            <circle cx="3" cy="10" r="1.5"></circle>
            <circle cx="7" cy="10" r="1.5"></circle>
            <circle cx="3" cy="16" r="1.5"></circle>
            <circle cx="7" cy="16" r="1.5"></circle>
          </svg>
        </div>

        <!-- 1. Rectangle ▢ -->
        <button
          ref="toolBtnRect"
          :class="['lark-tool-btn', { active: activeTool === 'rect' }]"
          title="矩形 (R)"
          @click="setTool('rect')"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
            <rect x="3.5" y="3.5" width="17" height="17" rx="2.5"></rect>
          </svg>
        </button>

        <!-- 2. Circle / Ellipse ○ -->
        <button
          ref="toolBtnCircle"
          :class="['lark-tool-btn', { active: activeTool === 'circle' }]"
          title="圆形 (C)"
          @click="setTool('circle')"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
            <ellipse cx="12" cy="12" rx="8.5" ry="8.5"></ellipse>
          </svg>
        </button>

        <!-- 3. Line ／ -->
        <button
          ref="toolBtnLine"
          :class="['lark-tool-btn', { active: activeTool === 'line' }]"
          title="直线 (L)"
          @click="setTool('line')"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
            <line x1="4" y1="20" x2="20" y2="4"></line>
          </svg>
        </button>

        <!-- 4. Arrow ↗ -->
        <button
          ref="toolBtnArrow"
          :class="['lark-tool-btn', { active: activeTool === 'arrow' }]"
          title="箭头 (A)"
          @click="setTool('arrow')"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
            <line x1="5" y1="19" x2="19" y2="5"></line>
            <polyline points="10 5 19 5 19 14"></polyline>
          </svg>
        </button>

        <!-- 5. Pen / Pencil ✏️ -->
        <button
          ref="toolBtnPencil"
          :class="['lark-tool-btn', { active: activeTool === 'pencil' }]"
          title="画笔 (P)"
          @click="setTool('pencil')"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
            <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
          </svg>
        </button>

        <!-- 6. Text T -->
        <button
          ref="toolBtnText"
          :class="['lark-tool-btn', { active: activeTool === 'text' }]"
          title="文本 (T)"
          @click="setTool('text')"
        >
          <span class="text-btn-label">T</span>
        </button>

        <!-- 7. Step Badge ① (纯序号) -->
        <button
          ref="toolBtnStep"
          :class="['lark-tool-btn', { active: activeTool === 'step' }]"
          title="序号标记 (S)"
          @click="setTool('step')"
        >
          <span class="step-icon">①</span>
        </button>

        <!-- 8. Step Note ①T (序号 + 说明图标) -->
        <button
          ref="toolBtnStepNote"
          :class="['lark-tool-btn', { active: activeTool === 'stepNote' }]"
          title="序号说明：序号 + 文本说明"
          @click="setTool('stepNote')"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor">
            <!-- Left: Number Badge Circle -->
            <circle cx="7" cy="12" r="5.5" fill="currentColor"></circle>
            <text x="7" y="15" fill="#ffffff" font-size="8.5" font-weight="bold" text-anchor="middle" font-family="-apple-system, sans-serif" stroke="none">1</text>
            <!-- Right: Note / Document Icon -->
            <rect x="13.5" y="6.5" width="8" height="11" rx="1.5" stroke="currentColor" stroke-width="1.8"></rect>
            <line x1="15.5" y1="9.5" x2="19.5" y2="9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></line>
            <line x1="15.5" y1="12" x2="19.5" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></line>
            <line x1="15.5" y1="14.5" x2="18" y2="14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></line>
          </svg>
        </button>

        <!-- 9. Mosaic ▦ (飞书标准单体马赛克入口) -->
        <button
          ref="toolBtnMosaic"
          :class="['lark-tool-btn', { active: activeTool === 'mosaic' }]"
          title="马赛克 (M)"
          @click="setTool('mosaic')"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
            <rect x="3.5" y="3.5" width="17" height="17" rx="2"></rect>
            <rect x="3.5" y="3.5" width="8.5" height="8.5" fill="currentColor"></rect>
            <rect x="12" y="12" width="8.5" height="8.5" fill="currentColor"></rect>
          </svg>
        </button>

        <!-- 10. Highlight Box ⬚ (高亮 / 矩形高亮) -->
        <button
          ref="toolBtnHighlight"
          :class="['lark-tool-btn', { active: activeTool === 'highlight' }]"
          title="高亮 (矩形高亮)"
          @click="setTool('highlight')"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none">
            <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" stroke-width="1.8"></rect>
            <circle cx="12" cy="12" r="5.2" stroke-width="1.6"></circle>
            <line x1="8.5" y1="12" x2="12" y2="8.5" stroke-width="1.4" stroke-linecap="round"></line>
            <line x1="9.5" y1="14.5" x2="14.5" y2="9.5" stroke-width="1.4" stroke-linecap="round"></line>
            <line x1="12" y1="15.5" x2="15.5" y2="12" stroke-width="1.4" stroke-linecap="round"></line>
          </svg>
        </button>

        <!-- 11. Highlighter Pen 彡 (荧光笔) -->
        <button
          ref="toolBtnMarker"
          :class="['lark-tool-btn', { active: activeTool === 'marker' }]"
          title="荧光笔 (H)"
          @click="setTool('marker')"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round">
            <line x1="4.5" y1="19.5" x2="10.5" y2="4.5"></line>
            <line x1="8.5" y1="19.5" x2="14.5" y2="4.5"></line>
            <line x1="12.5" y1="19.5" x2="18.5" y2="4.5"></line>
            <line x1="16.5" y1="19.5" x2="22.5" y2="4.5"></line>
          </svg>
        </button>

        <!-- 12. Watermark ㊞ (添加水印) -->
        <button
          ref="toolBtnWatermark"
          :class="['lark-tool-btn', { active: isWatermarkActive || activeTool === 'watermark' }]"
          title="添加水印 (W)"
          @click="toggleWatermark"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none">
            <rect x="3.5" y="3.5" width="17" height="17" rx="3" stroke-width="1.8"></rect>
            <line x1="6.5" y1="17.5" x2="17.5" y2="6.5" stroke-width="1.4" stroke-dasharray="2 2"></line>
            <circle cx="12" cy="12" r="4.2" stroke-width="1.6"></circle>
            <text x="12" y="14.4" font-size="7" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle" font-family="-apple-system, sans-serif">印</text>
          </svg>
        </button>

        <!-- 13. Pin to Desktop 📌 (固定按钮 / 快捷钉) -->
        <button
          class="lark-tool-btn action-pin"
          title="固定在桌面 (快捷钉 - P)"
          @click="pinCapture"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none">
            <rect x="7" y="3" width="10" height="2.5" rx="1" fill="currentColor"></rect>
            <path d="M8.5 5.5h7l-.5 4 2.5 3v1.5h-11V12.5l2.5-3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path>
            <line x1="12" y1="14" x2="12" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line>
          </svg>
        </button>

        <!-- 14. Scrolling Screenshot [ ⬚ ] (长截图) -->
        <button
          class="lark-tool-btn action-scrolling"
          title="长截图 / 滚动截屏"
          @click="enterScrollingCapture"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
            <rect x="5" y="2" width="14" height="20" rx="2"></rect>
            <path d="M12 7v10"></path>
            <polyline points="9 14 12 17 15 14"></polyline>
          </svg>
        </button>

        <div class="toolbar-divider"></div>

        <!-- 14. Undo ↩ -->
        <button
          class="lark-tool-btn"
          :disabled="historyIndex <= 0"
          title="撤销 (Ctrl/Cmd+Z)"
          @click="undo"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
            <path d="M3 7v6h6"></path>
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
          </svg>
        </button>

        <!-- 15. Save / Download ↓ -->
        <button
          class="lark-tool-btn action-save"
          title="保存图片 (Ctrl/Cmd+S)"
          @click="saveCapture"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </button>

        <!-- 16. Cancel ✕ (Lark Red on hover) -->
        <button
          class="lark-tool-btn action-close"
          title="取消 (Esc)"
          @click="closeCapture"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <!-- 17. Confirm ✓ (Lark Green Signature) -->
        <button
          class="lark-tool-btn action-confirm"
          title="完成并复制 (Enter / 双击选区)"
          @click="copyCapture"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>
      </div>

      <!-- Row 2: Contextual Property Bar (Generous Lark Proportions) -->
      <div
        v-if="activeTool !== 'none' || isWatermarkActive"
        class="lark-sub-toolbar"
        @mousedown.stop
        @mouseup.stop
        @click.stop
      >
        <div class="sub-toolbar-caret" :style="{ left: `${subToolbarCaretX}px` }"></div>

        <!-- A. Text & StepNote Tool Settings: 3 Text Styles, Font Size Dropdown -->
        <template v-if="activeTool === 'text' || activeTool === 'stepNote'">
          <div class="text-style-group">
            <button
              :class="['text-style-btn', { active: textStyle === 'normal' }]"
              title="无底色文字"
              @click="textStyle = 'normal'"
            >
              <span class="style-preview normal">T</span>
            </button>
            <button
              :class="['text-style-btn', { active: textStyle === 'filled' }]"
              title="填充底色"
              @click="textStyle = 'filled'"
            >
              <span class="style-preview filled">T</span>
            </button>
            <button
              :class="['text-style-btn', { active: textStyle === 'bordered' }]"
              title="边框文字"
              @click="textStyle = 'bordered'"
            >
              <span class="style-preview bordered">T</span>
            </button>
          </div>

          <div class="font-size-wrapper">
            <select v-model="fontSizeVal" class="font-size-select">
              <option :value="14">12pt</option>
              <option :value="16">14pt</option>
              <option :value="18">16pt</option>
              <option :value="22">18pt</option>
              <option :value="28">24pt</option>
              <option :value="36">32pt</option>
            </select>
          </div>
        </template>

        <!-- B. Highlighter Pen Settings: Size Dots only (no sub-level mode switch) -->
        <template v-else-if="activeTool === 'marker'">
          <div class="stroke-selector">
            <div
              v-for="size in presetSizes"
              :key="size"
              :class="['stroke-option', { active: strokeWidth === size }]"
              :title="`粗细: ${size * 6}px`"
              @click="setStrokeSize(size)"
            >
              <div
                class="stroke-dot"
                :style="{
                  width: `${size * 2.2 + 2}px`,
                  height: `${size * 2.2 + 2}px`,
                  backgroundColor: strokeWidth === size ? activeColor : '#94a3b8'
                }"
              ></div>
            </div>
          </div>
        </template>

        <!-- C. Shape / Pen Settings: Stroke Size Dots -->
        <template v-else-if="activeTool === 'rect' || activeTool === 'circle' || activeTool === 'line' || activeTool === 'arrow' || activeTool === 'pencil'">
          <div class="stroke-selector">
            <div
              v-for="size in presetSizes"
              :key="size"
              :class="['stroke-option', { active: strokeWidth === size }]"
              :title="getStrokeTooltip(size)"
              @click="setStrokeSize(size)"
            >
              <div
                class="stroke-dot"
                :style="{
                  width: `${size * 2.2}px`,
                  height: `${size * 2.2}px`,
                  backgroundColor: strokeWidth === size ? activeColor : '#94a3b8'
                }"
              ></div>
            </div>
          </div>
        </template>

        <!-- D. Mosaic Settings: 1:1 Exact Lark Design (Type [▦][💧] | Mode [👆][⬚] | Slider 模糊强度 50%) -->
        <template v-else-if="activeTool === 'mosaic'">
          <!-- Type: Pixelated vs Frosted Blur -->
          <div class="text-style-group">
            <button
              :class="['sub-mode-btn', { active: mosaicStyle === 'pixel' }]"
              title="像素马赛克"
              @click="setMosaicStyle('pixel')"
            >
              <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
                <rect x="3" y="3" width="6" height="6" rx="1"></rect>
                <rect x="11" y="3" width="6" height="6" rx="1" fill-opacity="0.35"></rect>
                <rect x="3" y="11" width="6" height="6" rx="1" fill-opacity="0.35"></rect>
                <rect x="11" y="11" width="6" height="6" rx="1"></rect>
              </svg>
            </button>
            <button
              :class="['sub-mode-btn', { active: mosaicStyle === 'blur' }]"
              title="毛玻璃模糊"
              @click="setMosaicStyle('blur')"
            >
              <svg viewBox="0 0 20 20" width="16" height="16" stroke="currentColor" fill="none" stroke-width="1.8">
                <path d="M10 3s-5 6.2-5 9.5a5 5 0 0 0 10 0C15 9.2 10 3 10 3z"></path>
              </svg>
            </button>
          </div>

          <div class="sub-divider"></div>

          <!-- Mode: Freehand Brush Smear vs Rect Frame -->
          <div class="text-style-group">
            <button
              :class="['sub-mode-btn', { active: mosaicMode === 'brush' }]"
              title="自由涂抹"
              @click="mosaicMode = 'brush'"
            >
              <svg viewBox="0 0 20 20" width="16" height="16" stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round">
                <path d="M7 11V6a1.5 1.5 0 0 1 3 0v5"></path>
                <path d="M10 8.5a1.5 1.5 0 0 1 3 0V11"></path>
                <path d="M13 10a1.5 1.5 0 0 1 3 0v2a5 5 0 0 1-5 5H9a5 5 0 0 1-4-2l-2-2.5a1.5 1.5 0 0 1 2.2-2L7 12"></path>
              </svg>
            </button>
            <button
              :class="['sub-mode-btn', { active: mosaicMode === 'rect' }]"
              title="框选矩形"
              @click="mosaicMode = 'rect'"
            >
              <svg viewBox="0 0 20 20" width="16" height="16" stroke="currentColor" fill="none" stroke-width="1.8">
                <rect x="3" y="3" width="14" height="14" rx="2" stroke-dasharray="2.5 2.5"></rect>
              </svg>
            </button>
          </div>

          <div class="sub-divider"></div>

          <!-- Intensity Slider (模糊强度 50%) -->
          <div class="mosaic-slider-group">
            <span class="mosaic-slider-label">模糊强度</span>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              v-model.number="mosaicIntensity"
              class="mosaic-intensity-slider"
              @input="onMosaicSliderInput"
              @mousedown.stop
              @mouseup.stop
              @click.stop
            />
            <span class="mosaic-slider-val">{{ mosaicIntensity }} %</span>
          </div>
        </template>

        <!-- E. Watermark Settings: Presets & Custom Input -->
        <template v-else-if="activeTool === 'watermark'">
          <div class="text-style-group">
            <button
              v-for="p in watermarkPresets"
              :key="p"
              :class="['preset-pill', { active: watermarkText === p }]"
              @click="setWatermarkPreset(p)"
            >
              {{ p.length > 6 ? p.slice(0, 4) + '..' : p }}
            </button>
          </div>
          <input
            v-model="watermarkText"
            placeholder="自定义水印..."
            class="watermark-input"
            @input="renderAll"
            @mousedown.stop
            @mouseup.stop
            @click.stop
            @keydown.stop
            @keyup.stop
          />
        </template>

        <!-- F. Step Badge Settings -->
        <template v-else-if="activeTool === 'step'">
          <div class="step-settings">
            <span class="step-badge-preview" :style="{ backgroundColor: activeColor }">
              {{ stepCounter }}
            </span>
            <button class="step-reset-btn" title="重置序号为 1" @click="stepCounter = 1">
              重置序号
            </button>
          </div>
        </template>

        <!-- 7 Lark Rounded-Square Color Swatches (NEVER shown for mosaic) -->
        <template v-if="activeTool !== 'mosaic'">
          <div class="sub-divider" v-if="activeTool !== 'highlight'"></div>
          <div class="color-palette">
            <div
              v-for="color in larkPalette"
              :key="color.hex"
              :class="['color-swatch-box', { active: activeColor === color.hex }]"
              :style="{
                backgroundColor: color.hex,
                borderColor: color.border || 'transparent'
              }"
              :title="color.name"
              @click="activeColor = color.hex"
            >
              <span v-if="activeColor === color.hex" :class="['color-check', { darkText: color.hex === '#ffffff' || color.hex === '#ffc60c' }]">✓</span>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Lark-Style Scrolling Screen Capture Side Control Dock -->
    <div
      v-if="isScrollingCaptureMode"
      class="lark-scrolling-dock"
      :style="scrollingDockPositionStyle"
      @mousedown.stop
    >
      <div class="scrolling-dock-header">
        <span class="scrolling-dock-title">长截图 / 滚动截屏</span>
        <span class="scrolling-height-badge">已拼接: {{ stitchedHeight }}px</span>
      </div>

      <div class="scrolling-tips">
        {{ scrollStatusMessage || '点击下方按钮向下滚动以智能匹配拼接长图' }}
      </div>

      <!-- Action Buttons -->
      <div class="scrolling-dock-actions">
        <button
          class="scrolling-btn primary"
          :disabled="isCapturingSlice || isAutoScrolling"
          @click="scrollDownAndCapture(false)"
        >
          <span v-if="isCapturingSlice">正在拼接...</span>
          <span v-else>↓ 单步向下滚动</span>
        </button>

        <button
          class="scrolling-btn auto"
          :disabled="isCapturingSlice && !isAutoScrolling"
          @click="toggleAutoScroll"
        >
          <span>{{ isAutoScrolling ? '⏹ 停止自动滚动' : '▶ 连续自动滚动' }}</span>
        </button>

        <button
          class="scrolling-btn confirm"
          @click="finishScrollingCapture"
        >
          ✓ 完成长截图
        </button>

        <button
          class="scrolling-btn cancel"
          @click="cancelScrollingCapture"
        >
          ✕ 取消
        </button>
      </div>

      <!-- Live Long Screenshot Preview Card -->
      <div v-if="stitchedHeight > 0" class="scrolling-preview-container">
        <div class="scrolling-preview-label">长图预览</div>
        <div class="scrolling-preview-scroll">
          <canvas ref="scrollingPreviewCanvasRef" class="scrolling-preview-canvas"></canvas>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import type { ScreenCaptureDisplayInfo } from '@shared/types/clipboard'
import { isDarkThemeId } from '../../../common/theme'

// Custom Vue directive for 100% instant auto-focus on text editor creation
const vFocus = {
  mounted: (el: HTMLTextAreaElement) => {
    el.focus({ preventScroll: true })
    const len = el.value.length
    el.setSelectionRange(len, len)
  }
}

type ToolType =
  | 'none'
  | 'rect'
  | 'circle'
  | 'arrow'
  | 'line'
  | 'pencil'
  | 'highlight'
  | 'marker'
  | 'mosaic'
  | 'text'
  | 'step'
  | 'stepNote'
  | 'watermark'

type TextStyle = 'normal' | 'bordered' | 'filled'
type MosaicMode = 'brush' | 'rect'

interface Annotation {
  id: string
  tool: ToolType
  color: string
  strokeWidth: number
  startX: number
  startY: number
  endX: number
  endY: number
  points?: Array<{ x: number; y: number }>
  text?: string
  textStyle?: TextStyle
  fontSize?: number
  stepNumber?: number
  mosaicMode?: MosaicMode
  mosaicStyle?: 'pixel' | 'blur'
  mosaicBlockSize?: number
  markerMode?: 'rect' | 'brush'
  box?: { x: number; y: number; width: number; height: number }
}

const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const textInputRef = ref<HTMLTextAreaElement | null>(null)
const toolbarRef = ref<HTMLDivElement | null>(null)
const scrollingPreviewCanvasRef = ref<HTMLCanvasElement | null>(null)

// Theme adaptation for MarkNotePro
const isDarkTheme = ref(false)

const detectTheme = (): void => {
  const urlTheme = new URLSearchParams(window.location.search).get('theme')
  const localTheme = localStorage.getItem('theme') || urlTheme
  if (localTheme && isDarkThemeId(localTheme)) {
    isDarkTheme.value = true
  } else {
    isDarkTheme.value = window.matchMedia('(prefers-color-scheme: dark)').matches
  }
}

// Buttons refs for calculating caret pointer position
const toolBtnRect = ref<HTMLButtonElement | null>(null)
const toolBtnCircle = ref<HTMLButtonElement | null>(null)
const toolBtnLine = ref<HTMLButtonElement | null>(null)
const toolBtnArrow = ref<HTMLButtonElement | null>(null)
const toolBtnPencil = ref<HTMLButtonElement | null>(null)
const toolBtnHighlight = ref<HTMLButtonElement | null>(null)
const toolBtnMarker = ref<HTMLButtonElement | null>(null)
const toolBtnText = ref<HTMLButtonElement | null>(null)
const toolBtnStep = ref<HTMLButtonElement | null>(null)
const toolBtnStepNote = ref<HTMLButtonElement | null>(null)
const toolBtnWatermark = ref<HTMLButtonElement | null>(null)

// Marker & Mosaic State
const markerMode = ref<'rect' | 'brush'>('rect')
const mosaicStyle = ref<'pixel' | 'blur'>('pixel')

// Watermark State
const isWatermarkActive = ref(false)
const watermarkText = ref('内部资料 · 严禁外传')
const watermarkPresets = ['内部资料 · 严禁外传', '机密文件', '仅供审核', 'MarkNotePro']

let pixelMosaicCanvas: HTMLCanvasElement | null = null
let blurMosaicCanvas: HTMLCanvasElement | null = null

const buildMosaicCaches = (img: HTMLImageElement): void => {
  const w = img.width
  const h = img.height

  // Intensity maps to block size: 10% -> 4px, 50% -> 12px, 100% -> 24px
  const bSize = Math.max(4, Math.round((mosaicIntensity.value / 100) * 20 + 4))

  // 1. Pixelated Mosaic (downsample then upscale with nearest neighbor)
  pixelMosaicCanvas = document.createElement('canvas')
  pixelMosaicCanvas.width = w
  pixelMosaicCanvas.height = h
  const pCtx = pixelMosaicCanvas.getContext('2d')
  if (pCtx) {
    const downW = Math.max(1, Math.round(w / bSize))
    const downH = Math.max(1, Math.round(h / bSize))
    const smallCanvas = document.createElement('canvas')
    smallCanvas.width = downW
    smallCanvas.height = downH
    const sCtx = smallCanvas.getContext('2d')
    if (sCtx) {
      sCtx.drawImage(img, 0, 0, downW, downH)
      pCtx.imageSmoothingEnabled = false
      pCtx.drawImage(smallCanvas, 0, 0, downW, downH, 0, 0, w, h)
    }
  }

  // 2. Frosted Blur Mosaic: 10% -> 6px, 50% -> 16px, 100% -> 30px
  const blurRadius = Math.max(4, Math.round((mosaicIntensity.value / 100) * 24 + 6))
  blurMosaicCanvas = document.createElement('canvas')
  blurMosaicCanvas.width = w
  blurMosaicCanvas.height = h
  const bCtx = blurMosaicCanvas.getContext('2d')
  if (bCtx) {
    bCtx.filter = `blur(${blurRadius}px)`
    bCtx.drawImage(img, 0, 0, w, h)
  }
}

const setMosaicSize = (bSize: number): void => {
  mosaicBlockSize.value = bSize
  if (screenshotImage.value) {
    buildMosaicCaches(screenshotImage.value)
  }
  renderAll()
}

const setWatermarkPreset = (p: string): void => {
  watermarkText.value = p
  renderAll()
}

const toggleWatermark = (): void => {
  isWatermarkActive.value = !isWatermarkActive.value
  if (isWatermarkActive.value) {
    activeTool.value = 'watermark'
  } else if (activeTool.value === 'watermark') {
    activeTool.value = 'none'
  }
  pushHistorySnapshot()
  renderAll()
}
const toolBtnMosaic = ref<HTMLButtonElement | null>(null)
const mosaicIntensity = ref(50)

const setMosaicStyle = (style: 'pixel' | 'blur'): void => {
  mosaicStyle.value = style
  renderAll()
}

const onMosaicSliderInput = (): void => {
  if (screenshotImage.value) {
    buildMosaicCaches(screenshotImage.value)
  }
  renderAll()
}

const activeTool = ref<ToolType>('none')

// Exact 7 Lark Palette Colors from User's Screenshot
const larkPalette = [
  { hex: '#f64b45', name: '红色' },
  { hex: '#ffc60c', name: '黄色' },
  { hex: '#34be4b', name: '绿色' },
  { hex: '#336df4', name: '蓝色' },
  { hex: '#1f2329', name: '黑色' },
  { hex: '#8f959e', name: '灰色' },
  { hex: '#ffffff', name: '白色', border: 'rgba(0,0,0,0.18)' }
]

const activeColor = ref('#f64b45')
const presetSizes = [2, 4, 6, 8]
const strokeWidth = ref(4)

// Lark Text Sub-properties
const textStyle = ref<TextStyle>('normal')
const fontSizeVal = ref(14) // 12pt default matching Lark screenshot
const isLightActiveColor = computed(() => activeColor.value === '#ffffff' || activeColor.value === '#ffc60c')

// Lark Mosaic Sub-properties
const mosaicMode = ref<MosaicMode>('brush')
const mosaicBlockSize = ref(8)

const selectMosaicMode = (mode: MosaicMode): void => {
  if (textInputState.value.active) commitTextInput()
  if (activeTool.value === 'mosaic' && mosaicMode.value === mode) {
    activeTool.value = 'none'
  } else {
    activeTool.value = 'mosaic'
    mosaicMode.value = mode
  }
}

// Screen & Device
const screenshotImage = ref<HTMLImageElement | null>(null)
const scaleFactor = ref(1)
const screenBounds = ref({ x: 0, y: 0, width: 0, height: 0 })

// Selection Rect
const selStartX = ref(0)
const selStartY = ref(0)
const selEndX = ref(0)
const selEndY = ref(0)
const hasSelection = ref(false)
const isSelecting = ref(false)
const isMovingSelection = ref(false)
const isResizingHandle = ref<string | null>(null)
const isDrawingAnnotation = ref(false)

// Existing text / step note dragging & interaction
const hoveredTextAnnId = ref<string | null>(null)
const pendingTextAnnClick = ref<Annotation | null>(null)
const hasMovedTextDrag = ref(false)
const isDraggingTextAnnId = ref<string | null>(null)
const dragTextOrigPos = ref({ x: 0, y: 0 })
const dragTextMouseStart = ref({ x: 0, y: 0 })

const isDragging = computed(
  () =>
    isSelecting.value ||
    isMovingSelection.value ||
    !!isResizingHandle.value ||
    isDrawingAnnotation.value ||
    !!isDraggingTextAnnId.value
)

// Dragging start references
const dragStartX = ref(0)
const dragStartY = ref(0)
const origSel = ref({ x1: 0, y1: 0, x2: 0, y2: 0 })

// Hover state for edge/handle affordance
const hoveredHandle = ref<string>('outside')

// Floating brush HUD
const brushPreviewVisible = ref(false)
const brushPreviewPos = ref({ x: 0, y: 0 })
let brushHideTimer: ReturnType<typeof setTimeout> | null = null

// Annotation history
const annotations = ref<Annotation[]>([])
const historyStack = ref<Annotation[][]>([[]])
const historyIndex = ref(0)
const stepCounter = ref(1)

// Current drawing annotation
const currentAnnotation = ref<Annotation | null>(null)

// Seamless text input state
const textInputState = ref({
  active: false,
  editingId: null as string | null,
  isStepNote: false,
  stepNumber: 1,
  x: 0,
  y: 0,
  text: ''
})
const isComposing = ref(false)

// -------------------------------------------------------------
// Scrolling Screen Capture (长截图 / 滚动截屏) State & Algorithm
// -------------------------------------------------------------
const isScrollingCaptureMode = ref(false)
const isCapturingSlice = ref(false)
const isAutoScrolling = ref(false)
const scrollStatusMessage = ref('')
const stitchedHeight = ref(0)

let autoScrollTimer: any = null
let stitchedMasterCanvas: HTMLCanvasElement | null = null
let prevSliceImageData: ImageData | null = null

function findVerticalScrollOffset(
  prevData: Uint8ClampedArray,
  currData: Uint8ClampedArray,
  width: number,
  height: number
): { dy: number; isIdentical: boolean; minDiff: number } {
  const bandH = Math.min(48, Math.floor(height * 0.15))
  const bandTop = height - bandH - 12
  if (bandTop <= 0 || width <= 10) return { dy: 0, isIdentical: true, minDiff: 0 }

  const cols: number[] = []
  for (let c = 0.15; c <= 0.85; c += 0.06) {
    cols.push(Math.floor(width * c))
  }

  // 1. Quick check for dy = 0 (identical frame / bottom reached)
  let diffZero = 0
  let countZero = 0
  for (let by = 0; by < bandH; by += 2) {
    const y = bandTop + by
    for (const col of cols) {
      const idx = (y * width + col) * 4
      diffZero +=
        Math.abs(prevData[idx] - currData[idx]) +
        Math.abs(prevData[idx + 1] - currData[idx + 1]) +
        Math.abs(prevData[idx + 2] - currData[idx + 2])
      countZero++
    }
  }
  const avgZero = countZero > 0 ? diffZero / countZero : 0
  if (avgZero < 4) {
    return { dy: 0, isIdentical: true, minDiff: avgZero }
  }

  // 2. Search candidate dy from 3 up to bandTop
  let bestDy = 0
  let minDiff = Infinity

  for (let dy = 3; dy < bandTop; dy += 1) {
    let diff = 0
    let count = 0
    for (let by = 0; by < bandH; by += 2) {
      const yPrev = bandTop + by
      const yCurr = yPrev - dy
      if (yCurr < 0 || yCurr >= height) continue

      for (const col of cols) {
        const idxPrev = (yPrev * width + col) * 4
        const idxCurr = (yCurr * width + col) * 4

        diff +=
          Math.abs(prevData[idxPrev] - currData[idxCurr]) +
          Math.abs(prevData[idxPrev + 1] - currData[idxCurr + 1]) +
          Math.abs(prevData[idxPrev + 2] - currData[idxCurr + 2])
        count++
      }
    }
    const avgDiff = count > 0 ? diff / count : Infinity
    if (avgDiff < minDiff) {
      minDiff = avgDiff
      bestDy = dy
    }
  }

  if (minDiff > 60) {
    return { dy: 0, isIdentical: false, minDiff }
  }

  return { dy: bestDy, isIdentical: false, minDiff }
}

const enterScrollingCapture = async (): Promise<void> => {
  if (!hasSelection.value) return
  if (textInputState.value.active) commitTextInput()
  activeTool.value = 'none'
  isScrollingCaptureMode.value = true
  isAutoScrolling.value = false
  scrollStatusMessage.value = ''

  const sel = normSelection.value
  const dpr = window.devicePixelRatio || 1
  const sw = Math.round(sel.width * dpr)
  const sh = Math.round(sel.height * dpr)

  stitchedMasterCanvas = document.createElement('canvas')
  stitchedMasterCanvas.width = sw
  stitchedMasterCanvas.height = sh
  const mctx = stitchedMasterCanvas.getContext('2d')
  if (mctx && screenshotImage.value) {
    mctx.drawImage(
      screenshotImage.value,
      sel.x * dpr,
      sel.y * dpr,
      sw,
      sh,
      0,
      0,
      sw,
      sh
    )
    prevSliceImageData = mctx.getImageData(0, 0, sw, sh)
    stitchedHeight.value = Math.round(sel.height)
    nextTick(() => updateScrollingPreview())
  }
}

const scrollDownAndCapture = async (_fromAuto = false): Promise<void> => {
  if (!isScrollingCaptureMode.value || isCapturingSlice.value) return
  isCapturingSlice.value = true
  scrollStatusMessage.value = '正在滚动并捕获...'

  try {
    const sel = normSelection.value
    const rect = {
      x: screenBounds.value.x + sel.x,
      y: screenBounds.value.y + sel.y,
      width: sel.width,
      height: sel.height
    }

    await window.electron.ipcRenderer.invoke('mt::capture-scroll-down', rect)
    await new Promise((resolve) => setTimeout(resolve, 200))

    const sliceDataUrl = await window.electron.ipcRenderer.invoke('mt::capture-slice', rect)
    if (!sliceDataUrl) {
      scrollStatusMessage.value = '捕获切片失败'
      return
    }

    const sliceImg = new Image()
    sliceImg.src = sliceDataUrl
    await new Promise((resolve) => {
      sliceImg.onload = resolve
    })

    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = sliceImg.width
    tempCanvas.height = sliceImg.height
    const tctx = tempCanvas.getContext('2d')
    if (!tctx) return
    tctx.drawImage(sliceImg, 0, 0)
    const currImageData = tctx.getImageData(0, 0, sliceImg.width, sliceImg.height)

    if (prevSliceImageData && stitchedMasterCanvas) {
      const matchRes = findVerticalScrollOffset(
        prevSliceImageData.data,
        currImageData.data,
        sliceImg.width,
        sliceImg.height
      )

      if (matchRes.isIdentical || matchRes.dy <= 1) {
        scrollStatusMessage.value = '已到达页面底部或内容未变化'
        if (isAutoScrolling.value) {
          stopAutoScroll()
        }
        return
      }

      const dy = matchRes.dy
      const oldCanvas = stitchedMasterCanvas
      const newCanvas = document.createElement('canvas')
      newCanvas.width = oldCanvas.width
      newCanvas.height = oldCanvas.height + dy
      const nctx = newCanvas.getContext('2d')
      if (nctx) {
        nctx.drawImage(oldCanvas, 0, 0)
        nctx.drawImage(
          sliceImg,
          0,
          sliceImg.height - dy,
          sliceImg.width,
          dy,
          0,
          oldCanvas.height,
          sliceImg.width,
          dy
        )
        stitchedMasterCanvas = newCanvas
        const dpr = window.devicePixelRatio || 1
        stitchedHeight.value = Math.round(newCanvas.height / dpr)
        prevSliceImageData = currImageData
        scrollStatusMessage.value = `已拼接 +${Math.round(dy / dpr)}px (总高 ${stitchedHeight.value}px)`
        updateScrollingPreview()
      }
    }
  } catch (err) {
    console.error('Failed to capture scroll slice:', err)
    scrollStatusMessage.value = '滚动截屏出错'
  } finally {
    isCapturingSlice.value = false
  }
}

const toggleAutoScroll = (): void => {
  if (isAutoScrolling.value) {
    stopAutoScroll()
  } else {
    startAutoScroll()
  }
}

const startAutoScroll = (): void => {
  isAutoScrolling.value = true
  runAutoScrollLoop()
}

const stopAutoScroll = (): void => {
  isAutoScrolling.value = false
  if (autoScrollTimer) {
    clearTimeout(autoScrollTimer)
    autoScrollTimer = null
  }
}

const runAutoScrollLoop = async (): Promise<void> => {
  if (!isAutoScrolling.value || !isScrollingCaptureMode.value) return
  await scrollDownAndCapture(true)
  if (isAutoScrolling.value) {
    autoScrollTimer = setTimeout(() => {
      runAutoScrollLoop()
    }, 280)
  }
}

const updateScrollingPreview = (): void => {
  const pCanvas = scrollingPreviewCanvasRef.value
  if (!pCanvas || !stitchedMasterCanvas) return
  const pCtx = pCanvas.getContext('2d')
  if (!pCtx) return

  const targetW = 180
  const aspect = stitchedMasterCanvas.height / stitchedMasterCanvas.width
  const targetH = Math.round(targetW * aspect)

  pCanvas.width = targetW
  pCanvas.height = targetH

  pCtx.drawImage(stitchedMasterCanvas, 0, 0, targetW, targetH)
}

const finishScrollingCapture = async (): Promise<void> => {
  stopAutoScroll()
  if (!stitchedMasterCanvas) {
    cancelScrollingCapture()
    return
  }

  const fullDataUrl = stitchedMasterCanvas.toDataURL('image/png')
  await window.electron.ipcRenderer.invoke('mt::capture-copy', fullDataUrl)
}

const cancelScrollingCapture = (): void => {
  stopAutoScroll()
  isScrollingCaptureMode.value = false
  stitchedMasterCanvas = null
  prevSliceImageData = null
  stitchedHeight.value = 0
  scrollStatusMessage.value = ''
  renderAll()
}

// -------------------------------------------------------------
// Sub-toolbar Caret X Coordinate Calculation
// -------------------------------------------------------------
const subToolbarCaretX = computed(() => {
  let targetBtn: HTMLButtonElement | null = null
  switch (activeTool.value) {
    case 'rect':
      targetBtn = toolBtnRect.value
      break
    case 'circle':
      targetBtn = toolBtnCircle.value
      break
    case 'line':
      targetBtn = toolBtnLine.value
      break
    case 'arrow':
      targetBtn = toolBtnArrow.value
      break
    case 'pencil':
      targetBtn = toolBtnPencil.value
      break
    case 'highlight':
      targetBtn = toolBtnHighlight.value
      break
    case 'marker':
      targetBtn = toolBtnMarker.value
      break
    case 'text':
      targetBtn = toolBtnText.value
      break
    case 'step':
      targetBtn = toolBtnStep.value
      break
    case 'stepNote':
      targetBtn = toolBtnStepNote.value
      break
    case 'mosaic':
      targetBtn = toolBtnMosaic.value
      break
    case 'watermark':
      targetBtn = toolBtnWatermark.value
      break
  }

  if (targetBtn && toolbarRef.value) {
    const tbRect = toolbarRef.value.getBoundingClientRect()
    const btnRect = targetBtn.getBoundingClientRect()
    return Math.round(btnRect.left - tbRect.left + btnRect.width / 2)
  }
  return 40
})

const getMarkerWidth = (width: number): number => {
  return width * 6
}

const brushPreviewSize = computed(() => {
  if (activeTool.value === 'marker') {
    return getMarkerWidth(strokeWidth.value)
  }
  return strokeWidth.value
})

const getStrokeTooltip = (size: number): string => {
  if (activeTool.value === 'marker') {
    return `荧光高亮笔粗细: ${size * 6}px`
  }
  if (activeTool.value === 'pencil') {
    return `画笔粗细: ${size}px`
  }
  return `标注线条粗细: ${size}px`
}

const setStrokeSize = (size: number): void => {
  strokeWidth.value = size
  showBrushIndicator(window.innerWidth / 2, window.innerHeight / 2)
  renderAll()
}

const showBrushIndicator = (x: number, y: number): void => {
  if (activeTool.value !== 'pencil' && activeTool.value !== 'marker') return
  brushPreviewPos.value = { x, y }
  brushPreviewVisible.value = true
  if (brushHideTimer) clearTimeout(brushHideTimer)
  brushHideTimer = setTimeout(() => {
    brushPreviewVisible.value = false
  }, 1000)
}

const onWheel = (e: WheelEvent): void => {
  if (isScrollingCaptureMode.value) {
    e.preventDefault()
    if (e.deltaY > 0) {
      scrollDownAndCapture()
    }
    return
  }

  if (activeTool.value === 'none') return
  e.preventDefault()
  if (e.deltaY < 0) {
    if (activeTool.value === 'text' || activeTool.value === 'stepNote') {
      fontSizeVal.value = Math.min(64, fontSizeVal.value + 2)
    } else {
      strokeWidth.value = Math.min(10, strokeWidth.value + 1)
    }
  } else {
    if (activeTool.value === 'text' || activeTool.value === 'stepNote') {
      fontSizeVal.value = Math.max(12, fontSizeVal.value - 2)
    } else {
      strokeWidth.value = Math.max(1, strokeWidth.value - 1)
    }
  }
  showBrushIndicator(e.clientX, e.clientY)
  renderAll()
}

// -------------------------------------------------------------
// Text Input Handling (IME, Auto-resize, Instant Focus, Commit, Cancel)
// -------------------------------------------------------------
const openTextEditor = (
  x: number,
  y: number,
  existingId: string | null = null,
  initialText = '',
  isStep = false,
  stepNum = 1
) => {
  textInputState.value = {
    active: true,
    editingId: existingId,
    isStepNote: isStep,
    stepNumber: stepNum,
    x,
    y,
    text: initialText
  }

  // GUARANTEE INSTANT FOCUS: no extra click required!
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
  setTimeout(focusInput, 20)
  setTimeout(focusInput, 80)
}

const onCompositionStart = (): void => {
  isComposing.value = true
}

const onCompositionEnd = (): void => {
  isComposing.value = false
  autoResizeTextarea()
}

const onTextareaKeydown = (e: KeyboardEvent): void => {
  if (isComposing.value || e.isComposing) {
    return // Allow native macOS IME to handle candidate lists freely
  }

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

const autoResizeTextarea = (): void => {
  const el = textInputRef.value
  if (!el) return
  el.style.width = 'auto'
  el.style.height = 'auto'
  const fSize = fontSizeVal.value
  el.style.width = `${Math.max(60, el.scrollWidth + 12)}px`
  el.style.height = `${Math.max(Math.round(fSize * 1.4), el.scrollHeight)}px`
}

const commitTextInput = (): void => {
  if (!textInputState.value.active) return

  const rawText = textInputState.value.text.trim()
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
        pushHistorySnapshot()
      }
    } else {
      pushAnnotation({
        id: `ann_${Date.now()}`,
        tool: isStep ? 'stepNote' : 'text',
        color: activeColor.value,
        strokeWidth: strokeWidth.value,
        startX: textInputState.value.x,
        startY: textInputState.value.y,
        endX: textInputState.value.x,
        endY: textInputState.value.y,
        text: textInputState.value.text,
        textStyle: textStyle.value,
        fontSize: fontSizeVal.value,
        stepNumber: isStep ? stepNum : undefined
      })
      if (isStep) {
        stepCounter.value = Math.max(stepCounter.value, stepNum + 1)
      }
    }
  }

  textInputState.value.active = false
  textInputState.value.editingId = null
  textInputState.value.text = ''
  renderAll()
}

const cancelTextInput = (): void => {
  textInputState.value.active = false
  textInputState.value.editingId = null
  textInputState.value.text = ''
  renderAll()
}

const findTextAnnotationAt = (x: number, y: number): Annotation | null => {
  for (let i = annotations.value.length - 1; i >= 0; i--) {
    const ann = annotations.value[i]
    if ((ann.tool === 'text' || ann.tool === 'stepNote') && ann.box) {
      if (
        x >= ann.box.x &&
        x <= ann.box.x + ann.box.width &&
        y >= ann.box.y &&
        y <= ann.box.y + ann.box.height
      ) {
        return ann
      }
    }
  }
  return null
}

const normSelection = computed(() => {
  const x = Math.min(selStartX.value, selEndX.value)
  const y = Math.min(selStartY.value, selEndY.value)
  const w = Math.abs(selEndX.value - selStartX.value)
  const h = Math.abs(selEndY.value - selStartY.value)
  return { x, y, width: w, height: h }
})

const normalizeSelection = (): void => {
  const x1 = Math.min(selStartX.value, selEndX.value)
  const y1 = Math.min(selStartY.value, selEndY.value)
  const x2 = Math.max(selStartX.value, selEndX.value)
  const y2 = Math.max(selStartY.value, selEndY.value)
  selStartX.value = x1
  selStartY.value = y1
  selEndX.value = x2
  selEndY.value = y2
}

// Dynamic cursor calculation
const currentCursor = computed(() => {
  if (isResizingHandle.value) {
    const h = isResizingHandle.value
    if (h === 'nw' || h === 'se') return 'nwse-resize'
    if (h === 'ne' || h === 'sw') return 'nesw-resize'
    if (h === 'n' || h === 's') return 'ns-resize'
    if (h === 'w' || h === 'e') return 'ew-resize'
  }

  if (isDraggingTextAnnId.value || (hoveredTextAnnId.value && !textInputState.value.active)) {
    return 'move'
  }

  if (isMovingSelection.value) {
    return 'move'
  }

  if (isDrawingAnnotation.value) {
    return 'crosshair'
  }

  if (hasSelection.value) {
    const target = hoveredHandle.value
    if (target === 'nw' || target === 'se') return 'nwse-resize'
    if (target === 'ne' || target === 'sw') return 'nesw-resize'
    if (target === 'n' || target === 's') return 'ns-resize'
    if (target === 'w' || target === 'e') return 'ew-resize'

    if (target === 'inside') {
      if (activeTool.value === 'none') return 'move'
      return 'crosshair'
    }
  }

  return 'crosshair'
})

// Lark Toolbar Position Style (Right-aligned to Selection Bottom)
const toolbarPositionStyle = computed(() => {
  const sel = normSelection.value
  const toolbarWidth = 650
  const toolbarHeight = activeTool.value === 'none' ? 48 : 96

  // Lark docks toolbar to the bottom-right of selection
  let left = sel.x + sel.width - toolbarWidth
  let top = sel.y + sel.height + 12

  const screenH = window.innerHeight
  const screenW = window.innerWidth

  // If overflowing bottom, flip to above selection
  if (top + toolbarHeight > screenH) {
    top = Math.max(10, sel.y - toolbarHeight - 12)
  }

  // Constrain horizontally within screen
  if (left < 10) left = 10
  if (left + toolbarWidth > screenW - 10) {
    left = screenW - toolbarWidth - 10
  }

  return {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`
  }
})

// Lark Scrolling Dock Position Style
const scrollingDockPositionStyle = computed(() => {
  const sel = normSelection.value
  let left = sel.x + sel.width + 16
  let top = sel.y

  const screenW = window.innerWidth
  const screenH = window.innerHeight

  if (left + 240 > screenW) {
    left = Math.max(10, sel.x - 250)
  }
  if (top + 340 > screenH) {
    top = Math.max(10, screenH - 350)
  }

  return {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`
  }
})

const setTool = (tool: ToolType): void => {
  if (textInputState.value.active) {
    commitTextInput()
  }
  if (activeTool.value === tool) {
    activeTool.value = 'none'
  } else {
    activeTool.value = tool
    if (tool === 'pencil' || tool === 'marker') {
      showBrushIndicator(window.innerWidth / 2, window.innerHeight / 2)
    }
  }
}

// -------------------------------------------------------------
// Hit Testing for Selection Edges, Drag Buttons, and Corners
// -------------------------------------------------------------
const getHitTarget = (x: number, y: number): string => {
  if (!hasSelection.value) return 'outside'
  const sel = normSelection.value

  const midX = sel.x + sel.width / 2
  const midY = sel.y + sel.height / 2

  // 1. Corners (radius 14px hit area)
  if (Math.hypot(x - sel.x, y - sel.y) <= 14) return 'nw'
  if (Math.hypot(x - (sel.x + sel.width), y - sel.y) <= 14) return 'ne'
  if (Math.hypot(x - (sel.x + sel.width), y - (sel.y + sel.height)) <= 14) return 'se'
  if (Math.hypot(x - sel.x, y - (sel.y + sel.height)) <= 14) return 'sw'

  // 2. Center Pill Drag Buttons (N, S, W, E)
  if (Math.abs(x - midX) <= 24 && Math.abs(y - sel.y) <= 12) return 'n'
  if (Math.abs(x - midX) <= 24 && Math.abs(y - (sel.y + sel.height)) <= 12) return 's'
  if (Math.abs(x - sel.x) <= 12 && Math.abs(y - midY) <= 24) return 'w'
  if (Math.abs(x - (sel.x + sel.width)) <= 12 && Math.abs(y - midY) <= 24) return 'e'

  // 3. Selection Borders (within 8px of border)
  const EDGE_PAD = 8
  const inHorizRange = x >= sel.x - EDGE_PAD && x <= sel.x + sel.width + EDGE_PAD
  const inVertRange = y >= sel.y - EDGE_PAD && y <= sel.y + sel.height + EDGE_PAD

  if (inHorizRange && Math.abs(y - sel.y) <= EDGE_PAD) return 'n'
  if (inHorizRange && Math.abs(y - (sel.y + sel.height)) <= EDGE_PAD) return 's'
  if (inVertRange && Math.abs(x - sel.x) <= EDGE_PAD) return 'w'
  if (inVertRange && Math.abs(x - (sel.x + sel.width)) <= EDGE_PAD) return 'e'

  // 4. Safe inside selection area
  if (x > sel.x && x < sel.x + sel.width && y > sel.y && y < sel.y + sel.height) {
    return 'inside'
  }

  return 'outside'
}

// -------------------------------------------------------------
// Canvas Rendering Engine
// -------------------------------------------------------------
const renderAll = (): void => {
  const canvas = canvasRef.value
  if (!canvas || !screenshotImage.value) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const width = window.innerWidth
  const height = window.innerHeight

  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
  }

  ctx.save()
  ctx.scale(dpr, dpr)

  // 1. Draw raw screenshot image
  ctx.drawImage(screenshotImage.value, 0, 0, width, height)

  // 2. Draw dark translucent mask around selection
  if (hasSelection.value) {
    const sel = normSelection.value

    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
    // Top
    ctx.fillRect(0, 0, width, sel.y)
    // Bottom
    ctx.fillRect(0, sel.y + sel.height, width, height - (sel.y + sel.height))
    // Left
    ctx.fillRect(0, sel.y, sel.x, sel.height)
    // Right
    ctx.fillRect(sel.x + sel.width, sel.y, width - (sel.x + sel.width), sel.height)

    // Selection border (Lark signature blue #336df4)
    ctx.strokeStyle = '#336df4'
    ctx.lineWidth = 1.5
    ctx.setLineDash([])
    ctx.strokeRect(sel.x, sel.y, sel.width, sel.height)

    // Selection Dimension Tag Pill (Lark style)
    const tagY = sel.y > 30 ? sel.y - 24 : sel.y + 6
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'
    ctx.shadowBlur = 6
    ctx.fillStyle = isDarkTheme.value ? 'rgba(30, 30, 32, 0.92)' : 'rgba(31, 35, 41, 0.88)'
    ctx.beginPath()
    ctx.roundRect(sel.x, tagY, 96, 20, 4)
    ctx.fill()
    ctx.restore()

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${Math.round(sel.width)} × ${Math.round(sel.height)} px`, sel.x + 8, tagY + 10)

    // 3. Draw Annotations clipped inside selection
    ctx.save()
    ctx.beginPath()
    ctx.rect(sel.x, sel.y, sel.width, sel.height)
    ctx.clip()

    for (const ann of annotations.value) {
      drawSingleAnnotation(ctx, ann)
    }
    if (currentAnnotation.value) {
      drawSingleAnnotation(ctx, currentAnnotation.value)
    }

    if (isWatermarkActive.value) {
      drawWatermark(ctx, sel)
    }

    ctx.restore()

    // 4. Draw Lark Corner Handles & Edge Grips
    drawSelectionHandles(ctx, sel, hoveredHandle.value)
  } else {
    // Dim the screen before selection
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'
    ctx.fillRect(0, 0, width, height)
  }

  ctx.restore()
}

const drawWatermark = (ctx: CanvasRenderingContext2D, bounds: { x: number; y: number; width: number; height: number }): void => {
  if (!isWatermarkActive.value) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height)
  ctx.clip()

  ctx.fillStyle = activeColor.value === '#ffffff' ? 'rgba(255, 255, 255, 0.22)' : 'rgba(148, 163, 184, 0.3)'
  ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const text = watermarkText.value || '内部资料 · 严禁外传'
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

// Render 4 Corner Handles & 4 Edge Drag Grips (Lark Style)
const drawSelectionHandles = (
  ctx: CanvasRenderingContext2D,
  sel: { x: number; y: number; width: number; height: number },
  hovered: string
): void => {
  const midX = sel.x + sel.width / 2
  const midY = sel.y + sel.height / 2

  // 1. Draw Corner Handles (NW, NE, SE, SW)
  const corners = [
    { name: 'nw', x: sel.x, y: sel.y },
    { name: 'ne', x: sel.x + sel.width, y: sel.y },
    { name: 'se', x: sel.x + sel.width, y: sel.y + sel.height },
    { name: 'sw', x: sel.x, y: sel.y + sel.height }
  ]

  for (const c of corners) {
    const isHovered = hovered === c.name || isResizingHandle.value === c.name
    const radius = isHovered ? 5.5 : 4

    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
    ctx.shadowBlur = 4
    ctx.shadowOffsetY = 1

    ctx.beginPath()
    ctx.arc(c.x, c.y, radius, 0, Math.PI * 2)
    ctx.fillStyle = isHovered ? '#336df4' : '#ffffff'
    ctx.fill()

    ctx.shadowColor = 'transparent'
    ctx.lineWidth = 1.5
    ctx.strokeStyle = isHovered ? '#ffffff' : '#336df4'
    ctx.stroke()
    ctx.restore()
  }

  // 2. Draw Edge Drag Grips (N, S, W, E)
  const showH = sel.width >= 40
  const showV = sel.height >= 40

  const edgePills = [
    { name: 'n', x: midX, y: sel.y, dir: 'h', show: showH },
    { name: 's', x: midX, y: sel.y + sel.height, dir: 'h', show: showH },
    { name: 'w', x: sel.x, y: midY, dir: 'v', show: showV },
    { name: 'e', x: sel.x + sel.width, y: midY, dir: 'v', show: showV }
  ]

  for (const pill of edgePills) {
    if (!pill.show) continue
    const isHovered = hovered === pill.name || isResizingHandle.value === pill.name

    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
    ctx.shadowBlur = 4
    ctx.shadowOffsetY = 1

    if (pill.dir === 'h') {
      const pw = isHovered ? 32 : 26
      const ph = isHovered ? 8 : 6
      const px = pill.x - pw / 2
      const py = pill.y - ph / 2

      ctx.beginPath()
      ctx.roundRect(px, py, pw, ph, ph / 2)
      ctx.fillStyle = isHovered ? '#336df4' : '#ffffff'
      ctx.fill()

      ctx.shadowColor = 'transparent'
      ctx.lineWidth = 1.2
      ctx.strokeStyle = isHovered ? '#ffffff' : '#336df4'
      ctx.stroke()
    } else {
      const pw = isHovered ? 8 : 6
      const ph = isHovered ? 32 : 26
      const px = pill.x - pw / 2
      const py = pill.y - ph / 2

      ctx.beginPath()
      ctx.roundRect(px, py, pw, ph, pw / 2)
      ctx.fillStyle = isHovered ? '#336df4' : '#ffffff'
      ctx.fill()

      ctx.shadowColor = 'transparent'
      ctx.lineWidth = 1.2
      ctx.strokeStyle = isHovered ? '#ffffff' : '#336df4'
      ctx.stroke()
    }
    ctx.restore()
  }
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
      ctx.lineWidth = getMarkerWidth(ann.strokeWidth)
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
    if (!sourceCanvas) {
      ctx.restore()
      return
    }

    const width = window.innerWidth
    const height = window.innerHeight

    if (isBrush && ann.points && ann.points.length > 0) {
      // Offscreen mask stencil: composite ONLY the blurred/pixelated pixels, NEVER any color stroke!
      const maskCanvas = document.createElement('canvas')
      maskCanvas.width = width
      maskCanvas.height = height
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
        mCtx.drawImage(sourceCanvas, 0, 0, width, height)
        ctx.drawImage(maskCanvas, 0, 0, width, height)
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
      ctx.drawImage(sourceCanvas, 0, 0, width, height)
      ctx.restore()
    }
  } else if ((ann.tool === 'text' || ann.tool === 'stepNote') && ann.text) {
    // Hide canvas text while currently editing in textarea
    if (ann.id === textInputState.value.editingId) {
      ctx.restore()
      return
    }

    const fSize = ann.fontSize || 14
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

    const pad = 4
    const isStep = ann.tool === 'stepNote'
    const badgeW = isStep ? fSize + 12 : 0
    const totalHeight = lines.length * lineHeight
    ann.box = {
      x: ann.startX - pad,
      y: ann.startY - pad,
      width: maxW + pad * 2 + badgeW,
      height: totalHeight + pad * 2
    }

    // Lark Style 1: Filled background card
    if (ann.textStyle === 'filled') {
      ctx.save()
      ctx.fillStyle = ann.color
      ctx.beginPath()
      ctx.roundRect(ann.box.x, ann.box.y, ann.box.width, ann.box.height, 4)
      ctx.fill()
      ctx.restore()
    } else if (ann.textStyle === 'bordered') {
      // Lark Style 2: Bordered card
      ctx.save()
      ctx.strokeStyle = ann.color
      ctx.lineWidth = 1.5
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
      ctx.beginPath()
      ctx.roundRect(ann.box.x, ann.box.y, ann.box.width, ann.box.height, 4)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }

    // Hover outline with 4 Corner Dots (Lark Style)
    if (hoveredTextAnnId.value === ann.id && !isDragging.value) {
      ctx.save()
      ctx.strokeStyle = '#336df4'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.roundRect(ann.box.x, ann.box.y, ann.box.width, ann.box.height, 4)
      ctx.stroke()

      // Corner dots
      ctx.fillStyle = '#336df4'
      const dotR = 2.5
      ctx.fillRect(ann.box.x - dotR, ann.box.y - dotR, dotR * 2, dotR * 2)
      ctx.fillRect(ann.box.x + ann.box.width - dotR, ann.box.y - dotR, dotR * 2, dotR * 2)
      ctx.fillRect(ann.box.x + ann.box.width - dotR, ann.box.y + ann.box.height - dotR, dotR * 2, dotR * 2)
      ctx.fillRect(ann.box.x - dotR, ann.box.y + ann.box.height - dotR, dotR * 2, dotR * 2)
      ctx.restore()
    }

    // If it's a Step Note, draw the circular step badge on the left
    if (isStep && ann.stepNumber) {
      const badgeR = (fSize + 2) / 2
      const badgeCx = ann.startX + badgeR
      const badgeCy = ann.startY + badgeR
      ctx.save()
      ctx.fillStyle = ann.color
      ctx.beginPath()
      ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = `bold ${Math.max(10, fSize - 3)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(ann.stepNumber), badgeCx, badgeCy)
      ctx.restore()
    }

    // Draw text lines
    const textStartX = ann.startX + badgeW
    lines.forEach((line, i) => {
      const lineY = ann.startY + i * lineHeight

      if (ann.textStyle === 'filled') {
        const isLight = ann.color === '#ffffff' || ann.color === '#ffc60c'
        ctx.fillStyle = isLight ? '#0f172a' : '#ffffff'
        ctx.fillText(line, textStartX, lineY)
      } else {
        // Normal text style (direct on screenshot image)
        ctx.fillStyle = ann.color
        ctx.fillText(line, textStartX, lineY)
      }
    })
  } else if (ann.tool === 'step') {
    const radius = 13
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

const drawArrow = (
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  width: number
): void => {
  const headLen = Math.max(12, width * 3)
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



// -------------------------------------------------------------
// Mouse Event Handlers with Strict Resize Priority Over Drawing
// -------------------------------------------------------------
const onMouseDown = (e: MouseEvent): void => {
  if (e.button !== 0) return
  const x = e.clientX
  const y = e.clientY

  if (textInputState.value.active) {
    commitTextInput()
  }

  if (hasSelection.value) {
    normalizeSelection()
    const hit = getHitTarget(x, y)

    // A. PRIORITY 1: Clicked on a resize handle, pill button, or border
    if (['nw', 'ne', 'se', 'sw', 'n', 's', 'w', 'e'].includes(hit)) {
      isResizingHandle.value = hit
      dragStartX.value = x
      dragStartY.value = y
      origSel.value = {
        x1: selStartX.value,
        y1: selStartY.value,
        x2: selEndX.value,
        y2: selEndY.value
      }
      isDrawingAnnotation.value = false
      isMovingSelection.value = false
      isDraggingTextAnnId.value = null
      renderAll()
      return
    }

    // B. PRIORITY 2: Clicked on an existing text annotation or step note
    const hitTextAnn = findTextAnnotationAt(x, y)
    if (hitTextAnn) {
      pendingTextAnnClick.value = hitTextAnn
      dragTextMouseStart.value = { x, y }
      dragTextOrigPos.value = { x: hitTextAnn.startX, y: hitTextAnn.startY }
      hasMovedTextDrag.value = false
      return
    }

    // C. PRIORITY 3: Clicked inside safe selection area
    if (hit === 'inside') {
      if (activeTool.value !== 'none') {
        if (activeTool.value === 'text') {
          e.preventDefault()
          openTextEditor(x, y, null, '', false, 1)
          return
        }

        if (activeTool.value === 'stepNote') {
          e.preventDefault()
          openTextEditor(x, y, null, '', true, stepCounter.value)
          return
        }

        if (activeTool.value === 'step') {
          pushAnnotation({
            id: `ann_${Date.now()}`,
            tool: 'step',
            color: activeColor.value,
            strokeWidth: strokeWidth.value,
            startX: x,
            startY: y,
            endX: x,
            endY: y,
            stepNumber: stepCounter.value++
          })
          renderAll()
          return
        }

        if (activeTool.value === 'watermark') {
          return
        }

        isDrawingAnnotation.value = true
        const isFreehand =
          activeTool.value === 'pencil' ||
          activeTool.value === 'marker' ||
          (activeTool.value === 'mosaic' && mosaicMode.value === 'brush')
        currentAnnotation.value = {
          id: `ann_${Date.now()}`,
          tool: activeTool.value,
          color: activeColor.value,
          strokeWidth: strokeWidth.value,
          startX: x,
          startY: y,
          endX: x,
          endY: y,
          points: isFreehand ? [{ x, y }] : undefined,
          mosaicMode: mosaicMode.value,
          mosaicStyle: mosaicStyle.value,
          mosaicBlockSize: mosaicBlockSize.value
        }
        return
      } else {
        isMovingSelection.value = true
        dragStartX.value = x
        dragStartY.value = y
        origSel.value = {
          x1: selStartX.value,
          y1: selStartY.value,
          x2: selEndX.value,
          y2: selEndY.value
        }
        return
      }
    }
  }

  // D. Fresh selection outside
  isSelecting.value = true
  hasSelection.value = true
  selStartX.value = x
  selStartY.value = y
  selEndX.value = x
  selEndY.value = y
  renderAll()
}

const onMouseMove = (e: MouseEvent): void => {
  const x = e.clientX
  const y = e.clientY

  // 1. Resizing Selection
  if (isResizingHandle.value) {
    const h = isResizingHandle.value
    const dx = x - dragStartX.value
    const dy = y - dragStartY.value

    if (h.includes('e')) selEndX.value = origSel.value.x2 + dx
    if (h.includes('w')) selStartX.value = origSel.value.x1 + dx
    if (h.includes('s')) selEndY.value = origSel.value.y2 + dy
    if (h.includes('n')) selStartY.value = origSel.value.y1 + dy
    renderAll()
    return
  }

  // 2. Dragging Existing Text / Step Note Annotation to reposition
  if (pendingTextAnnClick.value) {
    const dx = x - dragTextMouseStart.value.x
    const dy = y - dragTextMouseStart.value.y
    if (Math.hypot(dx, dy) > 4 || hasMovedTextDrag.value) {
      hasMovedTextDrag.value = true
      isDraggingTextAnnId.value = pendingTextAnnClick.value.id
      pendingTextAnnClick.value.startX = dragTextOrigPos.value.x + dx
      pendingTextAnnClick.value.startY = dragTextOrigPos.value.y + dy
      renderAll()
      return
    }
  }

  // 3. Moving Selection Box
  if (isMovingSelection.value) {
    const dx = x - dragStartX.value
    const dy = y - dragStartY.value
    selStartX.value = origSel.value.x1 + dx
    selStartY.value = origSel.value.y1 + dy
    selEndX.value = origSel.value.x2 + dx
    selEndY.value = origSel.value.y2 + dy
    renderAll()
    return
  }

  // 4. Initial Selecting
  if (isSelecting.value) {
    selEndX.value = x
    selEndY.value = y
    renderAll()
    return
  }

  // 5. Drawing Annotation inside selection
  if (isDrawingAnnotation.value && currentAnnotation.value) {
    currentAnnotation.value.endX = x
    currentAnnotation.value.endY = y
    if (currentAnnotation.value.points) {
      currentAnnotation.value.points.push({ x, y })
    }
    renderAll()
    return
  }

  // 6. Hover Detection for Handles & Text
  if (hasSelection.value) {
    const hit = getHitTarget(x, y)
    if (hoveredHandle.value !== hit) {
      hoveredHandle.value = hit
      renderAll()
    }

    const textHit = findTextAnnotationAt(x, y)
    const newTextHover = textHit ? textHit.id : null
    if (hoveredTextAnnId.value !== newTextHover) {
      hoveredTextAnnId.value = newTextHover
      renderAll()
    }
  }
}

const onMouseUp = (): void => {
  // If user just opened text editor on click, guarantee focus remains in textarea!
  if (textInputState.value.active) {
    requestAnimationFrame(() => {
      textInputRef.value?.focus({ preventScroll: true })
    })
  }

  if (pendingTextAnnClick.value) {
    const ann = pendingTextAnnClick.value
    if (!hasMovedTextDrag.value) {
      openTextEditor(
        ann.startX,
        ann.startY,
        ann.id,
        ann.text || '',
        ann.tool === 'stepNote',
        ann.stepNumber || 1
      )
      activeColor.value = ann.color
      strokeWidth.value = ann.strokeWidth
      textStyle.value = ann.textStyle || 'normal'
      fontSizeVal.value = ann.fontSize || 14
      renderAll()
    } else {
      pushHistorySnapshot()
      renderAll()
    }
    pendingTextAnnClick.value = null
    isDraggingTextAnnId.value = null
    hasMovedTextDrag.value = false
    return
  }

  if (isSelecting.value) {
    isSelecting.value = false
    normalizeSelection()
    const sel = normSelection.value
    if (sel.width < 5 || sel.height < 5) {
      hasSelection.value = false
    }
    renderAll()
  }

  if (isMovingSelection.value) {
    isMovingSelection.value = false
    normalizeSelection()
  }

  if (isResizingHandle.value) {
    isResizingHandle.value = null
    normalizeSelection()
    renderAll()
  }

  if (isDrawingAnnotation.value && currentAnnotation.value) {
    isDrawingAnnotation.value = false
    pushAnnotation(currentAnnotation.value)
    currentAnnotation.value = null
    renderAll()
  }
}

// Lark Double Click to Finish Selection & Copy
const onDoubleClick = (e: MouseEvent): void => {
  if (!hasSelection.value) return
  const x = e.clientX
  const y = e.clientY
  const hit = getHitTarget(x, y)
  if (hit === 'inside') {
    copyCapture()
  }
}

const onContextMenu = (): void => {
  if (textInputState.value.active) {
    cancelTextInput()
    return
  }
  if (hasSelection.value) {
    hasSelection.value = false
    annotations.value = []
    activeTool.value = 'none'
    renderAll()
  } else {
    closeCapture()
  }
}

// -------------------------------------------------------------
// History (Undo / Redo)
// -------------------------------------------------------------
const pushAnnotation = (ann: Annotation): void => {
  annotations.value.push(ann)
  pushHistorySnapshot()
}

const pushHistorySnapshot = (): void => {
  historyStack.value = historyStack.value.slice(0, historyIndex.value + 1)
  historyStack.value.push(JSON.parse(JSON.stringify(annotations.value)))
  historyIndex.value = historyStack.value.length - 1
}

const undo = (): void => {
  if (textInputState.value.active) {
    commitTextInput()
  }
  if (historyIndex.value > 0) {
    historyIndex.value--
    annotations.value = JSON.parse(JSON.stringify(historyStack.value[historyIndex.value]))
    renderAll()
  }
}

const redo = (): void => {
  if (textInputState.value.active) {
    commitTextInput()
  }
  if (historyIndex.value < historyStack.value.length - 1) {
    historyIndex.value++
    annotations.value = JSON.parse(JSON.stringify(historyStack.value[historyIndex.value]))
    renderAll()
  }
}

// -------------------------------------------------------------
// Export Selection Image Data URL
// -------------------------------------------------------------
const getCroppedDataUrl = (): string | null => {
  if (!screenshotImage.value || !hasSelection.value) return null
  const sel = normSelection.value
  if (sel.width <= 0 || sel.height <= 0) return null

  const dpr = window.devicePixelRatio || 1
  const cropCanvas = document.createElement('canvas')
  cropCanvas.width = Math.round(sel.width * dpr)
  cropCanvas.height = Math.round(sel.height * dpr)
  const ctx = cropCanvas.getContext('2d')
  if (!ctx) return null

  ctx.scale(dpr, dpr)

  ctx.drawImage(
    screenshotImage.value,
    sel.x * dpr,
    sel.y * dpr,
    sel.width * dpr,
    sel.height * dpr,
    0,
    0,
    sel.width,
    sel.height
  )

  ctx.save()
  ctx.translate(-sel.x, -sel.y)
  for (const ann of annotations.value) {
    drawSingleAnnotation(ctx, ann)
  }
  if (isWatermarkActive.value) {
    drawWatermark(ctx, sel)
  }
  ctx.restore()

  return cropCanvas.toDataURL('image/png')
}

// -------------------------------------------------------------
// Actions: Pin, Copy, Save, Close
// -------------------------------------------------------------
const pinCapture = async (): Promise<void> => {
  if (textInputState.value.active) {
    commitTextInput()
  }
  const dataUrl = getCroppedDataUrl()
  if (!dataUrl) return
  const sel = normSelection.value
  await window.electron.ipcRenderer.invoke('mt::capture-pin', dataUrl, {
    x: Math.round(screenBounds.value.x + sel.x),
    y: Math.round(screenBounds.value.y + sel.y),
    width: Math.round(sel.width),
    height: Math.round(sel.height)
  })
}

const copyCapture = async (): Promise<void> => {
  if (textInputState.value.active) {
    commitTextInput()
  }
  const dataUrl = getCroppedDataUrl()
  if (!dataUrl) return
  await window.electron.ipcRenderer.invoke('mt::capture-copy', dataUrl)
}

const saveCapture = async (): Promise<void> => {
  if (textInputState.value.active) {
    commitTextInput()
  }
  const dataUrl = getCroppedDataUrl()
  if (!dataUrl) return
  await window.electron.ipcRenderer.invoke('mt::capture-save', dataUrl)
}

const closeCapture = (): void => {
  window.electron.ipcRenderer.send('mt::capture-close')
}

// -------------------------------------------------------------
// Keyboard Navigation in Capture Mode
// -------------------------------------------------------------
const onKeydown = (e: KeyboardEvent): void => {
  // If user is typing in any input element (e.g. watermark custom text input), bypass screenshot shortcuts
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return
  }

  if (textInputState.value.active) return

  if (e.key === 'Escape') {
    e.preventDefault()
    if (isScrollingCaptureMode.value) {
      cancelScrollingCapture()
    } else {
      closeCapture()
    }
    return
  }

  if (e.key === 'Enter') {
    e.preventDefault()
    if (isScrollingCaptureMode.value) {
      finishScrollingCapture()
    } else if (hasSelection.value) {
      copyCapture()
    }
    return
  }

  if ((e.key === 'p' || e.key === 'P') && !e.metaKey && !e.ctrlKey) {
    e.preventDefault()
    if (hasSelection.value) {
      pinCapture()
    }
    return
  }

  if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault()
    if (e.shiftKey) {
      redo()
    } else {
      undo()
    }
    return
  }

  if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Y')) {
    e.preventDefault()
    redo()
    return
  }

  if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) {
    e.preventDefault()
    if (hasSelection.value) copyCapture()
    return
  }

  if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
    e.preventDefault()
    if (hasSelection.value) saveCapture()
    return
  }

  // Tool shortcuts
  if (!e.metaKey && !e.ctrlKey) {
    const k = e.key.toLowerCase()
    if (k === 'r') setTool('rect')
    else if (k === 'c') setTool('circle')
    else if (k === 'l') setTool('line')
    else if (k === 'a') setTool('arrow')
    else if (k === 'p') setTool('pencil')
    else if (k === 'h') setTool('marker')
    else if (k === 't') setTool('text')
    else if (k === 's') setTool('step')
    else if (k === 'm') setTool('mosaic')
    else if (k === 'w') toggleWatermark()
  }
}

let removeDataSub: (() => void) | null = null

const applyCaptureData = (info: ScreenCaptureDisplayInfo): void => {
  if (!info || !info.dataUrl) return
  screenBounds.value = info.bounds
  scaleFactor.value = info.scaleFactor || 1

  const img = new Image()
  img.onload = () => {
    screenshotImage.value = img
    buildMosaicCaches(img)
    renderAll()
  }
  img.src = info.dataUrl
}

onMounted(async () => {
  detectTheme()
  removeDataSub = window.electron.ipcRenderer.on('mt::capture-data-ready', (_event, info: ScreenCaptureDisplayInfo) => {
    applyCaptureData(info)
  })

  try {
    const data = await window.electron.ipcRenderer.invoke('mt::capture-get-data')
    if (data) {
      applyCaptureData(data)
    }
  } catch (err) {
    console.error('Failed to get capture data:', err)
  }

  nextTick(() => {
    if (!textInputState.value.active) {
      containerRef.value?.focus()
    }
  })

  window.addEventListener('resize', renderAll)
})

onUnmounted(() => {
  if (removeDataSub) removeDataSub()
  if (brushHideTimer) clearTimeout(brushHideTimer)
  window.removeEventListener('resize', renderAll)
})
</script>

<style scoped>
.capture-fullscreen-container {
  width: 100vw;
  height: 100vh;
  position: relative;
  overflow: hidden;
  user-select: none;
  outline: none;
  background: #000000;
}

.main-canvas {
  position: absolute;
  left: 0;
  top: 0;
  display: block;
}

/* Floating Brush HUD */
.brush-preview-hud {
  position: absolute;
  transform: translate(-50%, -130%);
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
  z-index: 1005;
  gap: 6px;
  animation: hudPop 0.15s ease-out;
}

.brush-preview-circle {
  border-radius: 50%;
  border: 2px solid;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5), inset 0 0 4px rgba(0, 0, 0, 0.3);
}

.brush-preview-label {
  background: rgba(31, 35, 41, 0.9);
  color: #f8fafc;
  font-size: 11px;
  font-weight: bold;
  padding: 2px 8px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  white-space: nowrap;
}

@keyframes hudPop {
  0% {
    transform: translate(-50%, -110%) scale(0.8);
    opacity: 0;
  }
  100% {
    transform: translate(-50%, -130%) scale(1);
    opacity: 1;
  }
}

/* Lark-Style Active Textbox (Direct on Screenshot, Blue Border, 4 Corner Dots) */
.lark-active-textbox {
  position: absolute;
  z-index: 1002;
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

/* Inline Step Badge for Step Note */
.step-badge-inline {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  user-select: none;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
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

/* Lark-Style Two-Tier Toolbar Structure */
.lark-toolbar-wrapper {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 7px;
  z-index: 1001;
  cursor: default;
}

/* Primary Toolbar (Lark 48px Height, Generous 36px Buttons, High Affordance) */
.lark-primary-toolbar {
  display: flex;
  align-items: center;
  height: 48px;
  gap: 4px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  padding: 0 10px;
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.16), 0 2px 6px rgba(0, 0, 0, 0.08);
  transition: background-color 0.2s, border-color 0.2s;
  box-sizing: border-box;
}

.theme-dark .lark-primary-toolbar {
  background: #23252a;
  border-color: rgba(255, 255, 255, 0.14);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
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

.lark-tool-btn {
  background: transparent;
  border: none;
  color: #1f2329;
  width: 36px;
  height: 36px;
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
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.step-icon {
  font-size: 18px;
  line-height: 1;
}

.step-note-icon {
  display: flex;
  align-items: center;
  gap: 2px;
}

.step-note-circle {
  font-size: 11px;
  background: currentColor;
  color: #ffffff;
  border-radius: 50%;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.theme-dark .step-note-circle {
  color: #1f2329;
}

.step-note-t {
  font-size: 15px;
  font-weight: bold;
}

.toolbar-divider {
  width: 1px;
  height: 22px;
  background: rgba(31, 35, 41, 0.12);
  margin: 0 4px;
}

.theme-dark .toolbar-divider {
  background: rgba(255, 255, 255, 0.14);
}

/* Contextual Sub-Toolbar (Row 2 Attached Below with Caret Arrow) */
.lark-sub-toolbar {
  position: relative;
  display: flex;
  align-items: center;
  height: 46px;
  gap: 10px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  padding: 0 14px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15), 0 2px 6px rgba(0, 0, 0, 0.08);
  animation: subToolbarFadeIn 0.12s ease-out;
  box-sizing: border-box;
}

.theme-dark .lark-sub-toolbar {
  background: #23252a;
  border-color: rgba(255, 255, 255, 0.14);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
}

@keyframes subToolbarFadeIn {
  0% {
    opacity: 0;
    transform: translateY(-4px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.sub-toolbar-caret {
  position: absolute;
  top: -7px;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-bottom: 7px solid #ffffff;
  transition: left 0.15s ease;
}

.theme-dark .sub-toolbar-caret {
  border-bottom-color: #23252a;
}

.sub-divider {
  width: 1px;
  height: 22px;
  background: rgba(31, 35, 41, 0.12);
  margin: 0 2px;
}

.theme-dark .sub-divider {
  background: rgba(255, 255, 255, 0.14);
}

/* Sub-toolbar mode buttons (for Mosaic and Highlighter) */
.sub-mode-btn {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  width: 32px;
  height: 32px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #1f2329;
  transition: all 0.12s ease;
}

.theme-dark .sub-mode-btn {
  color: #e2e8f0;
}

.sub-mode-btn.active {
  background: #eef3fe;
  border-color: #336df4;
  color: #336df4;
}

.theme-dark .sub-mode-btn.active {
  background: rgba(51, 109, 244, 0.3);
  border-color: #60a5fa;
  color: #60a5fa;
}

.watermark-input {
  background: #f5f6f7;
  color: #1f2329;
  border: 1px solid #dee0e3;
  border-radius: 6px;
  padding: 0 10px;
  font-size: 13px;
  height: 32px;
  outline: none;
  width: 140px;
  box-sizing: border-box;
}

.theme-dark .watermark-input {
  background: #2b2e35;
  color: #e2e8f0;
  border-color: rgba(255, 255, 255, 0.15);
}

.preset-pill {
  background: #f5f6f7;
  border: 1px solid #dee0e3;
  border-radius: 5px;
  padding: 3px 8px;
  font-size: 12px;
  cursor: pointer;
  color: #1f2329;
  white-space: nowrap;
}

.theme-dark .preset-pill {
  background: #2b2e35;
  color: #e2e8f0;
  border-color: rgba(255, 255, 255, 0.15);
}

.preset-pill.active {
  background: #eef3fe;
  border-color: #336df4;
  color: #336df4;
}

.theme-dark .preset-pill.active {
  background: rgba(51, 109, 244, 0.3);
  border-color: #60a5fa;
  color: #60a5fa;
}

/* Lark Mosaic Intensity Slider */
.mosaic-slider-group {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 4px;
}

.mosaic-slider-label {
  font-size: 13px;
  color: #646a73;
  white-space: nowrap;
  font-weight: 500;
}

.theme-dark .mosaic-slider-label {
  color: #94a3b8;
}

.mosaic-intensity-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 95px;
  height: 4px;
  background: #dee0e3;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  accent-color: #336df4;
}

.theme-dark .mosaic-intensity-slider {
  background: #3a3d45;
}

.mosaic-intensity-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ffffff;
  border: 2px solid #336df4;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.1s ease;
}

.mosaic-intensity-slider::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}

.mosaic-slider-val {
  font-size: 13px;
  color: #1f2329;
  font-weight: 600;
  min-width: 42px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.theme-dark .mosaic-slider-val {
  color: #e2e8f0;
}

/* Text Style Buttons (Lark Style: Normal, Filled, Bordered) */
.text-style-group {
  display: flex;
  align-items: center;
  gap: 5px;
}

.text-style-btn {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  width: 32px;
  height: 32px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  transition: all 0.1s ease;
  color: #1f2329;
}

.theme-dark .text-style-btn {
  color: #e2e8f0;
}

.text-style-btn:hover {
  background: rgba(31, 35, 41, 0.08);
}

.theme-dark .text-style-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.text-style-btn.active {
  background: #eef3fe;
  border-color: #336df4;
  color: #336df4;
}

.theme-dark .text-style-btn.active {
  background: rgba(51, 109, 244, 0.3);
  border-color: #60a5fa;
  color: #60a5fa;
}

.style-preview {
  font-weight: 700;
  font-size: 15px;
  line-height: 1;
}

.style-preview.normal {
  color: #336df4;
}

.style-preview.filled {
  background: #1f2329;
  color: #ffffff;
  border-radius: 4px;
  padding: 1px 5px;
}

.theme-dark .style-preview.filled {
  background: #ffffff;
  color: #1f2329;
}

.style-preview.bordered {
  color: #1f2329;
  border: 1.5px solid currentColor;
  border-radius: 4px;
  padding: 0 4px;
}

.theme-dark .style-preview.bordered {
  color: #ffffff;
}

/* Font Size Dropdown Select (Lark style "12pt ∨") */
.font-size-wrapper {
  display: flex;
  align-items: center;
}

.font-size-select {
  background: #f5f6f7;
  color: #1f2329;
  border: 1px solid #dee0e3;
  border-radius: 6px;
  padding: 0 10px;
  font-size: 13px;
  font-weight: 600;
  height: 32px;
  outline: none;
  cursor: pointer;
  box-sizing: border-box;
}

.theme-dark .font-size-select {
  background: #2b2e35;
  color: #e2e8f0;
  border-color: rgba(255, 255, 255, 0.15);
}

.font-size-select option {
  background: #ffffff;
  color: #1f2329;
}

.theme-dark .font-size-select option {
  background: #23252a;
  color: #e2e8f0;
}

/* 7 Lark Rounded-Square Color Swatches (Generous 22x22px Size) */
.color-palette {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-swatch-box {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  cursor: pointer;
  border: 1.5px solid rgba(0, 0, 0, 0.12);
  transition: transform 0.12s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.color-swatch-box:hover {
  transform: scale(1.15);
}

.color-swatch-box.active {
  border-color: rgba(0, 0, 0, 0.28);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

.theme-dark .color-swatch-box {
  border-color: rgba(255, 255, 255, 0.2);
}

.theme-dark .color-swatch-box.active {
  border-color: rgba(255, 255, 255, 0.4);
}

.color-check {
  font-size: 13px;
  color: #ffffff;
  font-weight: 900;
  line-height: 1;
}

.color-check.darkText {
  color: #1f2329;
}

/* Stroke Sizes */
.stroke-selector {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stroke-option {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.12s ease;
}

.stroke-option:hover {
  background: rgba(31, 35, 41, 0.08);
}

.theme-dark .stroke-option:hover {
  background: rgba(255, 255, 255, 0.1);
}

.stroke-option.active {
  background: rgba(51, 109, 244, 0.18);
}

.stroke-dot {
  border-radius: 50%;
  transition: all 0.12s ease;
}

.mosaic-size-label {
  font-size: 13px;
  color: #1f2329;
  font-weight: bold;
}

.theme-dark .mosaic-size-label {
  color: #e2e8f0;
}

/* Step Settings */
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
  border-color: rgba(255, 255, 255, 0.15);
}

.step-reset-btn:hover {
  background: #e5e7eb;
}

/* Action button accents */
.action-scrolling:hover {
  background: rgba(51, 109, 244, 0.12);
  color: #336df4;
}

.action-pin:hover {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
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

/* Lark-Style Scrolling Screen Capture Side Control Dock */
.lark-scrolling-dock {
  position: absolute;
  width: 230px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.16), 0 2px 6px rgba(0, 0, 0, 0.06);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 1002;
  cursor: default;
  animation: subToolbarFadeIn 0.15s ease-out;
}

.theme-dark .lark-scrolling-dock {
  background: #23252a;
  border-color: rgba(255, 255, 255, 0.12);
  color: #e2e8f0;
}

.scrolling-dock-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.scrolling-dock-title {
  font-size: 13px;
  font-weight: bold;
  color: #1f2329;
}

.theme-dark .scrolling-dock-title {
  color: #ffffff;
}

.scrolling-height-badge {
  font-size: 11px;
  color: #336df4;
  background: #e9eeff;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: bold;
}

.theme-dark .scrolling-height-badge {
  color: #60a5fa;
  background: rgba(51, 109, 244, 0.25);
}

.scrolling-tips {
  font-size: 11px;
  color: #646a73;
  line-height: 1.4;
}

.theme-dark .scrolling-tips {
  color: #94a3b8;
}

.scrolling-dock-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.scrolling-btn {
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s ease;
}

.scrolling-btn.primary {
  background: #336df4;
  color: #ffffff;
}

.scrolling-btn.primary:hover:not(:disabled) {
  background: #2563eb;
}

.scrolling-btn.primary:disabled {
  opacity: 0.6;
  cursor: wait;
}

.scrolling-btn.auto {
  background: #f0f7ff;
  color: #0284c7;
}

.theme-dark .scrolling-btn.auto {
  background: rgba(2, 132, 199, 0.2);
  color: #38bdf8;
}

.scrolling-btn.auto:hover:not(:disabled) {
  background: #e0f2fe;
}

.scrolling-btn.confirm {
  background: #eaf8ec;
  color: #34be4b;
}

.theme-dark .scrolling-btn.auto {
  background: #f0f7ff;
  color: #0284c7;
}

.theme-dark .scrolling-btn.auto {
  background: rgba(2, 132, 199, 0.2);
  color: #38bdf8;
}

.scrolling-btn.auto:hover:not(:disabled) {
  background: #e0f2fe;
}

.scrolling-btn.confirm {
  background: rgba(52, 190, 75, 0.2);
  color: #4ade80;
}

.scrolling-btn.confirm:hover {
  background: #34be4b;
  color: #ffffff;
}

.scrolling-btn.cancel {
  background: #f5f6f7;
  color: #646a73;
}

.theme-dark .scrolling-btn.cancel {
  background: #2b2e35;
  color: #94a3b8;
}

.scrolling-btn.cancel:hover {
  background: #feeceb;
  color: #f64b45;
}

.scrolling-preview-container {
  border-top: 1px solid rgba(31, 35, 41, 0.08);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.theme-dark .scrolling-preview-container {
  border-top-color: rgba(255, 255, 255, 0.08);
}

.scrolling-preview-label {
  font-size: 11px;
  font-weight: bold;
  color: #8f959e;
}

.scrolling-preview-scroll {
  max-height: 160px;
  overflow-y: auto;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 4px;
  background: #f8fafc;
  display: flex;
  justify-content: center;
  padding: 4px 0;
}

.theme-dark .scrolling-preview-scroll {
  background: #18191c;
  border-color: rgba(255, 255, 255, 0.08);
}

.scrolling-preview-canvas {
  display: block;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}
</style>
