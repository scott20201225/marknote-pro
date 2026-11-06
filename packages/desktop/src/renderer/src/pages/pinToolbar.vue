<template>
  <div
    class="pin-toolbar-window-container"
    :class="[isDarkTheme ? 'theme-dark' : 'theme-light', 'placement-' + placement]"
  >
    <div class="pin-edit-floating-palette" @mousedown.stop="focusToolbar" @click.stop>
      <!-- Row 1: Primary Tools (Order and Icons 100% identical to Screen Capture) -->
      <div class="lark-primary-toolbar">
        <!-- Grip -->
        <div
          class="toolbar-drag-grip"
          @mousedown="onToolbarDragStart"
          @mouseenter="showTooltip($event, tr('toolbarDrag'))"
          @mouseleave="hideTooltip"
        >
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
          :class="['lark-tool-btn', { active: activeTool === 'rect' }]"
          :title="`${tr('rect')} (R)`"
          @mouseenter="showTooltip($event, tr('rect'), 'R')"
          @mouseleave="hideTooltip"
          @click="toggleTool('rect'); hideTooltip()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
            <rect x="3.5" y="3.5" width="17" height="17" rx="2.5"></rect>
          </svg>
        </button>

        <!-- 2. Circle / Ellipse ○ -->
        <button
          :class="['lark-tool-btn', { active: activeTool === 'circle' }]"
          :title="`${tr('circle')} (C)`"
          @mouseenter="showTooltip($event, tr('circle'), 'C')"
          @mouseleave="hideTooltip"
          @click="toggleTool('circle'); hideTooltip()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
            <ellipse cx="12" cy="12" rx="8.5" ry="8.5"></ellipse>
          </svg>
        </button>

        <!-- 3. Line ／ -->
        <button
          :class="['lark-tool-btn', { active: activeTool === 'line' }]"
          :title="`${tr('line')} (L)`"
          @mouseenter="showTooltip($event, tr('line'), 'L')"
          @mouseleave="hideTooltip"
          @click="toggleTool('line'); hideTooltip()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
            <line x1="4" y1="20" x2="20" y2="4"></line>
          </svg>
        </button>

        <!-- 4. Arrow ↗ -->
        <button
          :class="['lark-tool-btn', { active: activeTool === 'arrow' }]"
          :title="`${tr('arrow')} (A)`"
          @mouseenter="showTooltip($event, tr('arrow'), 'A')"
          @mouseleave="hideTooltip"
          @click="toggleTool('arrow'); hideTooltip()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
            <line x1="5" y1="19" x2="19" y2="5"></line>
            <polyline points="10 5 19 5 19 14"></polyline>
          </svg>
        </button>

        <!-- 5. Pen / Pencil ✏️ -->
        <button
          :class="['lark-tool-btn', { active: activeTool === 'pencil' }]"
          :title="`${tr('pencil')} (P)`"
          @mouseenter="showTooltip($event, tr('pencil'), 'P')"
          @mouseleave="hideTooltip"
          @click="toggleTool('pencil'); hideTooltip()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
            <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
          </svg>
        </button>

        <!-- 6. Text T -->
        <button
          :class="['lark-tool-btn', { active: activeTool === 'text' }]"
          :title="`${tr('text')} (T)`"
          @mouseenter="showTooltip($event, tr('text'), 'T')"
          @mouseleave="hideTooltip"
          @click="toggleTool('text'); hideTooltip()"
        >
          <span class="text-btn-label">T</span>
        </button>

        <!-- 7. Tag 🏷️ (标签 / 气泡标签) -->
        <button
          :class="['lark-tool-btn', { active: activeTool === 'tag' }]"
          :title="`${tr('tag')} (G)`"
          @mouseenter="showTooltip($event, tr('tag'), 'G')"
          @mouseleave="hideTooltip"
          @click="toggleTool('tag'); hideTooltip()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="5" cy="19" r="2.5" fill="currentColor"></circle>
            <path d="M7 17l4.5-4.5h5.5a3 3 0 0 0 3-3v0a3 3 0 0 0-3-3h-4a3 3 0 0 0-3 3v1" stroke-linecap="round" stroke-linejoin="round"></path>
            <circle cx="17.5" cy="9.5" r="1.2" fill="currentColor"></circle>
          </svg>
        </button>

        <!-- 8. Step Badge ① (纯序号) -->
        <button
          :class="['lark-tool-btn', { active: activeTool === 'step' }]"
          :title="`${tr('step')} (S)`"
          @mouseenter="showTooltip($event, tr('step'), 'S')"
          @mouseleave="hideTooltip"
          @click="toggleTool('step'); hideTooltip()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20">
            <circle cx="12" cy="12" r="9" fill="currentColor"></circle>
            <text x="12" y="16" text-anchor="middle" font-size="12" font-weight="800" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">1</text>
          </svg>
        </button>

        <!-- 9. Step Note ①T (序号 + 说明) -->
        <button
          :class="['lark-tool-btn', { active: activeTool === 'stepNote' }]"
          :title="tr('stepNote')"
          @mouseenter="showTooltip($event, tr('stepNote'))"
          @mouseleave="hideTooltip"
          @click="toggleTool('stepNote'); hideTooltip()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20">
            <circle cx="7" cy="12" r="6" fill="currentColor"></circle>
            <text x="7" y="15.2" text-anchor="middle" font-size="9" font-weight="800" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">1</text>
            <text x="17" y="16.5" text-anchor="middle" font-size="13" font-weight="800" fill="currentColor" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">T</text>
          </svg>
        </button>

        <!-- 10. Mosaic ▦ (马赛克 / 模糊) -->
        <button
          :class="['lark-tool-btn', { active: activeTool === 'mosaic' }]"
          :title="`${tr('mosaic')} (M)`"
          @mouseenter="showTooltip($event, tr('mosaic'), 'M')"
          @mouseleave="hideTooltip"
          @click="toggleTool('mosaic'); hideTooltip()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
            <rect x="3.5" y="3.5" width="17" height="17" rx="2"></rect>
            <rect x="3.5" y="3.5" width="8.5" height="8.5" fill="currentColor"></rect>
            <rect x="12" y="12" width="8.5" height="8.5" fill="currentColor"></rect>
          </svg>
        </button>

        <!-- 11. Highlight Box ⬚ (矩形高亮) -->
        <button
          :class="['lark-tool-btn', { active: activeTool === 'highlight' }]"
          :title="tr('highlight')"
          @mouseenter="showTooltip($event, tr('highlight'))"
          @mouseleave="hideTooltip"
          @click="toggleTool('highlight'); hideTooltip()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none">
            <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" stroke-width="1.8"></rect>
            <circle cx="12" cy="12" r="5.2" stroke-width="1.6"></circle>
            <line x1="8.5" y1="12" x2="12" y2="8.5" stroke-width="1.4" stroke-linecap="round"></line>
            <line x1="9.5" y1="14.5" x2="14.5" y2="9.5" stroke-width="1.4" stroke-linecap="round"></line>
            <line x1="12" y1="15.5" x2="15.5" y2="12" stroke-width="1.4" stroke-linecap="round"></line>
          </svg>
        </button>

        <!-- 12. Highlighter Pen 彡 (荧光笔) -->
        <button
          :class="['lark-tool-btn', { active: activeTool === 'marker' }]"
          :title="`${tr('marker')} (H)`"
          @mouseenter="showTooltip($event, tr('marker'), 'H')"
          @mouseleave="hideTooltip"
          @click="toggleTool('marker'); hideTooltip()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round">
            <line x1="4.5" y1="19.5" x2="10.5" y2="4.5"></line>
            <line x1="8.5" y1="19.5" x2="14.5" y2="4.5"></line>
            <line x1="12.5" y1="19.5" x2="18.5" y2="4.5"></line>
            <line x1="16.5" y1="19.5" x2="22.5" y2="4.5"></line>
          </svg>
        </button>

        <!-- 13. Watermark ㊞ (添加水印) -->
        <button
          :class="['lark-tool-btn', { active: isWatermarkActive || activeTool === 'watermark' }]"
          :title="`${tr('watermark')} (W)`"
          @mouseenter="showTooltip($event, tr('watermark'), 'W')"
          @mouseleave="hideTooltip"
          @click="toggleWatermark(); hideTooltip()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none">
            <rect x="3.5" y="3.5" width="17" height="17" rx="3" stroke-width="1.8"></rect>
            <line x1="6.5" y1="17.5" x2="17.5" y2="6.5" stroke-width="1.4" stroke-dasharray="2 2"></line>
            <circle cx="12" cy="12" r="4.2" stroke-width="1.6"></circle>
            <text x="12" y="14.4" font-size="7" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle" font-family="-apple-system, sans-serif">印</text>
          </svg>
        </button>

        <div class="toolbar-sep"></div>

        <!-- 14. Undo ↩ -->
        <button
          class="lark-tool-btn action-undo"
          :class="{ disabled: !canUndo }"
          :disabled="!canUndo"
          :title="`${tr('undo')} (⌘Z)`"
          @mouseenter="showTooltip($event, tr('undo'), 'Cmd+Z')"
          @mouseleave="hideTooltip"
          @click="sendAction('undo'); hideTooltip()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
            <path d="M3 7v6h6"></path>
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
          </svg>
        </button>

        <!-- 15. Save / Download ↓ -->
        <button
          class="lark-tool-btn action-save"
          :title="`${tr('save')} (⌘S)`"
          @mouseenter="showTooltip($event, tr('save'), 'Cmd+S')"
          @mouseleave="hideTooltip"
          @click="sendAction('save'); hideTooltip()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </button>

        <!-- 16. Cancel ✕ -->
        <button
          class="lark-tool-btn action-close"
          :title="`${tr('close')} (Esc)`"
          @mouseenter="showTooltip($event, tr('close'), 'Esc')"
          @mouseleave="hideTooltip"
          @click="sendAction('cancel'); hideTooltip()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <!-- 17. Confirm ✓ -->
        <button
          class="lark-tool-btn action-confirm"
          :title="`${tr('confirm')} (Enter)`"
          @mouseenter="showTooltip($event, tr('confirm'), 'Enter')"
          @mouseleave="hideTooltip"
          @click="sendAction('confirm'); hideTooltip()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>
      </div>

      <!-- Row 2: Secondary Contextual Properties Bar -->
      <div v-if="activeTool !== 'none' || isWatermarkActive" class="lark-sub-toolbar">
        <!-- A. Text & StepNote Tool Settings: 3 Text Styles & Font Size -->
        <template v-if="activeTool === 'text' || activeTool === 'stepNote'">
          <div class="text-style-group">
            <button
              :class="['sub-mode-btn', { active: textStyle === 'transparent' }]"
              @mouseenter="showTooltip($event, tr('textTransparent'))"
              @mouseleave="hideTooltip"
              @click="sendAction('setTextStyle', { textStyle: 'transparent' }); hideTooltip()"
            >
              <span class="style-icon-transparent">A</span>
            </button>
            <button
              :class="['sub-mode-btn', { active: textStyle === 'bordered' }]"
              @mouseenter="showTooltip($event, tr('textBordered'))"
              @mouseleave="hideTooltip"
              @click="sendAction('setTextStyle', { textStyle: 'bordered' }); hideTooltip()"
            >
              <span class="style-icon-bordered">A</span>
            </button>
            <button
              :class="['sub-mode-btn', { active: textStyle === 'filled' }]"
              @mouseenter="showTooltip($event, tr('textFilled'))"
              @mouseleave="hideTooltip"
              @click="sendAction('setTextStyle', { textStyle: 'filled' }); hideTooltip()"
            >
              <span class="style-icon-filled">A</span>
            </button>
          </div>
          <div class="sub-sep"></div>
          <div class="font-size-group">
            <select
              :value="fontSizeVal"
              class="font-size-select"
              @change="sendAction('setFontSize', { fontSize: Number(($event.target as HTMLSelectElement).value) })"
            >
              <option v-for="sz in fontSizes" :key="sz" :value="sz">{{ sz }}px</option>
            </select>
          </div>
        </template>

        <!-- B. Tag Tool: Direction Toggle with Arrow Icon -->
        <template v-else-if="activeTool === 'tag'">
          <button
            class="tag-dir-btn"
            @mouseenter="showTooltip($event, tr('tagDir'))"
            @mouseleave="hideTooltip"
            @click="sendAction('cycleTagDirection')"
          >
            <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
              <path v-if="tagDirection === 'top-right'" d="M5 15l10-10M8 5h7v7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
              <path v-else-if="tagDirection === 'bottom-right'" d="M5 5l10 10M15 8v7H8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
              <path v-else-if="tagDirection === 'bottom-left'" d="M15 5L5 15M12 15H5V8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
              <path v-else d="M15 15L5 5M5 12V5h7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
            <span class="tag-dir-label">{{ tagDirectionLabel }}</span>
          </button>
        </template>

        <!-- C. Step Settings -->
        <template v-else-if="activeTool === 'step'">
          <div class="step-settings">
            <div class="step-badge-preview" :style="{ backgroundColor: activeColor }">
              {{ stepCounter }}
            </div>
            <button
              class="step-reset-btn"
              @mouseenter="showTooltip($event, tr('stepReset'))"
              @mouseleave="hideTooltip"
              @click="sendAction('resetStep'); hideTooltip()"
            >
              {{ tr('stepReset') }}
            </button>
          </div>
        </template>

        <!-- D. Marker / Highlighter Pen Settings -->
        <template v-else-if="activeTool === 'marker'">
          <div class="stroke-selector">
            <div
              v-for="size in [2, 4, 6, 8]"
              :key="size"
              :class="['stroke-option', { active: strokeWidth === size }]"
              @mouseenter="showTooltip($event, `${size}px`)"
              @mouseleave="hideTooltip"
              @click="sendAction('setStrokeWidth', { strokeWidth: size })"
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

        <!-- E. General Shapes / Pencil Settings -->
        <template v-else-if="activeTool === 'rect' || activeTool === 'circle' || activeTool === 'line' || activeTool === 'arrow' || activeTool === 'pencil'">
          <div class="stroke-selector">
            <div
              v-for="size in [2, 4, 6, 8]"
              :key="size"
              :class="['stroke-option', { active: strokeWidth === size }]"
              @mouseenter="showTooltip($event, `${size}px`)"
              @mouseleave="hideTooltip"
              @click="sendAction('setStrokeWidth', { strokeWidth: size })"
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

        <!-- F. Mosaic Settings: Pixel / Blur Type + Brush / Rect Mode + Intensity -->
        <template v-else-if="activeTool === 'mosaic'">
          <div class="mosaic-style-group">
            <button
              :class="['sub-mode-btn', { active: mosaicStyle === 'pixel' }]"
              @mouseenter="showTooltip($event, tr('mosaicPixel'))"
              @mouseleave="hideTooltip"
              @click="sendAction('setMosaicStyle', { mosaicStyle: 'pixel' }); hideTooltip()"
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
              @mouseenter="showTooltip($event, tr('mosaicBlur'))"
              @mouseleave="hideTooltip"
              @click="sendAction('setMosaicStyle', { mosaicStyle: 'blur' }); hideTooltip()"
            >
              <svg viewBox="0 0 20 20" width="16" height="16" stroke="currentColor" fill="none" stroke-width="1.8">
                <path d="M10 3s-5 6.2-5 9.5a5 5 0 0 0 10 0C15 9.2 10 3 10 3z"></path>
              </svg>
            </button>
          </div>
          <div class="sub-sep"></div>
          <div class="mosaic-presets">
            <button
              :class="['preset-pill', { active: mosaicMode === 'brush' }]"
              @mouseenter="showTooltip($event, tr('mosaicBrush'))"
              @mouseleave="hideTooltip"
              @click="sendAction('setMosaicMode', { mosaicMode: 'brush' }); hideTooltip()"
            >
              <svg viewBox="0 0 20 20" width="14" height="14" stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round">
                <path d="M7 11V6a1.5 1.5 0 0 1 3 0v5"></path>
                <path d="M10 8.5a1.5 1.5 0 0 1 3 0V11"></path>
                <path d="M13 10a1.5 1.5 0 0 1 3 0v2a5 5 0 0 1-5 5H9a5 5 0 0 1-4-2l-2-2.5a1.5 1.5 0 0 1 2.2-2L7 12"></path>
              </svg>
              <span>{{ tr('mosaicBrush') }}</span>
            </button>
            <button
              :class="['preset-pill', { active: mosaicMode === 'rect' }]"
              @mouseenter="showTooltip($event, tr('mosaicRect'))"
              @mouseleave="hideTooltip"
              @click="sendAction('setMosaicMode', { mosaicMode: 'rect' }); hideTooltip()"
            >
              <svg viewBox="0 0 20 20" width="14" height="14" stroke="currentColor" fill="none" stroke-width="1.8">
                <rect x="3" y="3" width="14" height="14" rx="2" stroke-dasharray="2.5 2.5"></rect>
              </svg>
              <span>{{ tr('mosaicRect') }}</span>
            </button>
          </div>
          <div class="sub-sep"></div>
          <div class="mosaic-slider-group">
            <span class="mosaic-slider-label">{{ tr('mosaicIntensity') }}</span>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              :value="mosaicIntensity"
              class="mosaic-intensity-slider"
              @input="sendAction('setMosaicIntensity', { intensity: Number(($event.target as HTMLInputElement).value) })"
            />
            <span class="mosaic-slider-val">{{ mosaicIntensity }}%</span>
          </div>
        </template>

        <!-- G. Watermark Settings: Presets & Custom Input -->
        <template v-else-if="activeTool === 'watermark' || isWatermarkActive">
          <div class="watermark-presets-group">
            <button
              v-for="p in watermarkPresets"
              :key="p"
              :class="['preset-pill', { active: watermarkText === p }]"
              @click="setWatermarkPreset(p)"
            >
              {{ p.length > 12 ? p.slice(0, 10) + '..' : p }}
            </button>
          </div>
          <input
            v-model="watermarkText"
            :placeholder="tr('watermarkPlaceholder')"
            class="watermark-input"
            @focus="onWatermarkFocus"
            @blur="onWatermarkBlur"
            @input="onWatermarkInput"
            @mousedown.stop
            @mouseup.stop
            @click.stop
            @keydown.stop="onWatermarkKeydown"
            @keyup.stop
          />
        </template>

        <!-- Color Palette (Common to non-mosaic tools) -->
        <template v-if="activeTool !== 'mosaic'">
          <div class="sub-sep" v-if="activeTool !== 'highlight'"></div>
          <div class="color-palette-group" v-if="activeTool !== 'highlight'">
            <div
              v-for="c in larkPalette"
              :key="c.hex"
              :class="['color-swatch-btn', { active: (activeTool === 'watermark' ? watermarkColor : activeColor).toLowerCase() === c.hex.toLowerCase() }]"
              :style="{ backgroundColor: c.hex, borderColor: c.border }"
              @mouseenter="showTooltip($event, getColorName(c))"
              @mouseleave="hideTooltip"
              @click="onColorSelect(c.hex)"
            ></div>
          </div>
        </template>
      </div>
    </div>

    <!-- Custom Fast Lark Tooltip HUD -->
    <div
      v-if="tooltipState.visible"
      :class="['lark-tooltip-hud', { 'placement-below': tooltipState.isBelow }]"
      :style="{ left: `${tooltipState.x}px`, top: `${tooltipState.y}px` }"
    >
      <span class="tooltip-text">{{ tooltipState.text }}</span>
      <span v-if="tooltipState.shortcut" class="tooltip-shortcut">{{ tooltipState.shortcut }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { isDarkThemeId } from '../../../common/theme'

const urlParams = new URLSearchParams(window.location.search)
const pinId = ref(urlParams.get('pinId') || '')
const placement = ref<'top' | 'bottom'>(
  (urlParams.get('placement') as 'top' | 'bottom') || 'bottom'
)

const isDarkTheme = ref(false)

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

// Default tool is 'none' (user selects tool themselves, matching screen capture)
const activeTool = ref('none')
const activeColor = ref('#f64b45')
const strokeWidth = ref(4)
const textStyle = ref('transparent')
const fontSizeVal = ref(16)
const tagDirection = ref('top-right')
const stepCounter = ref(1)
const mosaicStyle = ref<'pixel' | 'blur'>('pixel')
const mosaicMode = ref<'brush' | 'rect'>('brush')
const mosaicIntensity = ref(50)
const canUndo = ref(false)

// Watermark state
const isWatermarkActive = ref(false)
const watermarkText = ref('')
const watermarkColor = ref('#8f959e')
const watermarkPresets = computed(() => [
  '内部资料',
  '绝密文件',
  '仅供评审',
  window.location.href.includes('marktext') ? 'MarkTextPro' : 'MarkNotePro'
])

const fontSizes = [12, 14, 16, 18, 20, 24, 28, 32]

// =============================================================
// Tooltip System (Fast, Beautiful HUD)
// =============================================================
const tooltipState = ref<{
  visible: boolean
  text: string
  shortcut?: string
  x: number
  y: number
  isBelow: boolean
}>({
  visible: false,
  text: '',
  shortcut: undefined,
  x: 0,
  y: 0,
  isBelow: true
})

let tooltipTimer: any = null
let isTooltipActive = false

const showTooltip = (e: MouseEvent, text: string, shortcut?: string): void => {
  if (tooltipTimer) clearTimeout(tooltipTimer)
  const target = (e.currentTarget || e.target) as HTMLElement | null
  if (!target) return

  const rect = target.getBoundingClientRect()
  let x = rect.left + rect.width / 2
  let y = rect.bottom + 6
  x = Math.max(30, Math.min(window.innerWidth - 30, x))

  tooltipState.value = {
    visible: true,
    text,
    shortcut,
    x,
    y,
    isBelow: true
  }
  isTooltipActive = true
}

const hideTooltip = (): void => {
  if (tooltipTimer) clearTimeout(tooltipTimer)
  tooltipTimer = setTimeout(() => {
    tooltipState.value.visible = false
    isTooltipActive = false
  }, 60)
}

const larkPalette = [
  { hex: '#f64b45', key: 'colorRed', name: '红色', border: 'transparent' },
  { hex: '#ffc60c', key: 'colorYellow', name: '黄色', border: 'transparent' },
  { hex: '#34be4b', key: 'colorGreen', name: '绿色', border: 'transparent' },
  { hex: '#336df4', key: 'colorBlue', name: '蓝色', border: 'transparent' },
  { hex: '#1f2329', key: 'colorBlack', name: '黑色', border: 'transparent' },
  { hex: '#8f959e', key: 'colorGray', name: '灰色', border: 'transparent' },
  { hex: '#ffffff', key: 'colorWhite', name: '白色', border: 'rgba(0,0,0,0.18)' }
]

const getColorName = (c: { key?: string; name: string }): string => {
  return c.key && (i18n as any)[c.key] ? (i18n as any)[c.key] : c.name
}

const i18n = {
  toolbarDrag: '按住拖拽工具栏',
  rect: '矩形 (R)',
  circle: '圆形 (C)',
  line: '直线 (L)',
  arrow: '箭头 (A)',
  pencil: '画笔 (P)',
  text: '文本 (T)',
  tag: '标签 (G)',
  step: '序号 (S)',
  stepNote: '序号说明',
  mosaic: '马赛克 (M)',
  highlight: '矩形高亮',
  marker: '荧光笔 (H)',
  watermark: '添加水印 (W)',
  undo: '撤销 (Cmd+Z)',
  save: '保存 (Cmd+S)',
  close: '退出编辑 (Esc)',
  confirm: '完成编辑并复制 (Enter)',
  textTransparent: '纯文字',
  textBordered: '描边边框',
  textFilled: '背景实色填充',
  tagDir: '切换标签朝向',
  tagDirTR: '右上',
  tagDirBR: '右下',
  tagDirBL: '左下',
  tagDirTL: '左上',
  stepReset: '重置序号为 1',
  mosaicPixel: '经典像素颗粒',
  mosaicBlur: '高斯毛玻璃模糊',
  mosaicBrush: '涂抹',
  mosaicRect: '框选',
  mosaicIntensity: '模糊强度',
  watermarkPlaceholder: '自定义水印文字...',
  colorRed: '红色',
  colorYellow: '黄色',
  colorGreen: '绿色',
  colorBlue: '蓝色',
  colorBlack: '黑色',
  colorGray: '灰色',
  colorWhite: '白色'
}

const tr = (key: keyof typeof i18n): string => {
  return i18n[key] || key
}

const tagDirectionLabel = computed(() => {
  if (tagDirection.value === 'top-right') return tr('tagDirTR')
  if (tagDirection.value === 'bottom-right') return tr('tagDirBR')
  if (tagDirection.value === 'bottom-left') return tr('tagDirBL')
  return tr('tagDirTL')
})

const toggleTool = (tool: string): void => {
  const next = activeTool.value === tool ? 'none' : tool
  sendAction('setTool', { tool: next })
  window.electron.ipcRenderer.send('mt::pin-window-focus', pinId.value)
}

const toggleWatermark = (): void => {
  isWatermarkActive.value = !isWatermarkActive.value
  if (isWatermarkActive.value && !watermarkText.value) {
    watermarkText.value = '内部资料'
  }
  if (isWatermarkActive.value) {
    activeTool.value = 'watermark'
  } else if (activeTool.value === 'watermark') {
    activeTool.value = 'none'
  }
  sendAction('toggleWatermark')
}

const focusToolbar = (): void => {
  window.electron.ipcRenderer.send('mt::pin-toolbar-focus', pinId.value)
}

const setWatermarkPreset = (p: string): void => {
  watermarkText.value = p
  isWatermarkActive.value = true
  sendAction('setWatermarkText', { text: p, active: true })
}

const onWatermarkInput = (): void => {
  if (!isWatermarkActive.value) {
    isWatermarkActive.value = true
  }
  sendAction('setWatermarkText', { text: watermarkText.value, active: true })
}

const onWatermarkFocus = (): void => {
  window.electron.ipcRenderer.send('mt::pin-toolbar-focus', pinId.value)
}

const onWatermarkBlur = (): void => {}

const onColorSelect = (hex: string): void => {
  if (activeTool.value === 'watermark') {
    watermarkColor.value = hex
    sendAction('setWatermarkColor', { color: hex })
  } else {
    activeColor.value = hex
    sendAction('setColor', { color: hex })
  }
}

const onWatermarkKeydown = (e: KeyboardEvent): void => {
  e.stopPropagation()
  if (e.isComposing) return
  if (e.key === 'Escape' || e.key === 'Enter') {
    ;(e.target as HTMLInputElement)?.blur()
  }
}

const sendAction = (action: string, payload: Record<string, any> = {}): void => {
  if (action === 'setTool') {
    activeTool.value = payload.tool
  } else if (action === 'setColor') {
    activeColor.value = payload.color
  } else if (action === 'setStrokeWidth') {
    strokeWidth.value = payload.strokeWidth
  } else if (action === 'setTextStyle') {
    textStyle.value = payload.textStyle
  } else if (action === 'setFontSize') {
    fontSizeVal.value = payload.fontSize
  } else if (action === 'setMosaicStyle') {
    mosaicStyle.value = payload.mosaicStyle
  } else if (action === 'setMosaicMode') {
    mosaicMode.value = payload.mosaicMode
  } else if (action === 'setMosaicIntensity') {
    mosaicIntensity.value = payload.intensity
  }

  window.electron.ipcRenderer.send('mt::pin-edit-action', {
    pinId: pinId.value,
    action,
    ...payload
  })
}

// Window Dragging for the floating toolbar
let isDragging = false
let startScreenX = 0
let startScreenY = 0

const onToolbarDragStart = (e: MouseEvent): void => {
  if (e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  isDragging = true
  startScreenX = e.screenX
  startScreenY = e.screenY
  window.addEventListener('mousemove', onToolbarDragMove)
  window.addEventListener('mouseup', onToolbarDragEnd, { capture: true })
}

const onToolbarDragMove = (e: MouseEvent): void => {
  if (!isDragging || (e.buttons & 1) === 0) {
    onToolbarDragEnd()
    return
  }
  const dx = e.screenX - startScreenX
  const dy = e.screenY - startScreenY
  startScreenX = e.screenX
  startScreenY = e.screenY
  window.electron.ipcRenderer.send('mt::pin-toolbar-drag', {
    pinId: pinId.value,
    dx,
    dy
  })
}

const onToolbarDragEnd = (): void => {
  isDragging = false
  window.removeEventListener('mousemove', onToolbarDragMove)
  window.removeEventListener('mouseup', onToolbarDragEnd, { capture: true })
}

let removeStateSub: (() => void) | null = null

onMounted(() => {
  detectTheme()
  try {
    window.electron.ipcRenderer.send('mt::ask-for-user-preference')
    window.electron.ipcRenderer.on('mt::user-preference', (_e, prefs: any) => {
      if (prefs?.theme) {
        isDarkTheme.value = isDarkThemeId(prefs.theme)
      }
    })
  } catch {}

  window.electron.ipcRenderer.on('mt::pin-toolbar-placement', (_e, p: 'top' | 'bottom') => {
    if (p) placement.value = p
  })

  removeStateSub = window.electron.ipcRenderer.on('mt::pin-edit-state-sync', (_event, data: any) => {
    const state = data?.state || data
    if (!state) return
    if (state.activeTool !== undefined) activeTool.value = state.activeTool
    if (state.activeColor !== undefined) activeColor.value = state.activeColor
    if (state.strokeWidth !== undefined) strokeWidth.value = state.strokeWidth
    if (state.textStyle !== undefined) textStyle.value = state.textStyle
    if (state.fontSize !== undefined) fontSizeVal.value = state.fontSize
    if (state.tagDirection !== undefined) tagDirection.value = state.tagDirection
    if (state.stepCount !== undefined) stepCounter.value = state.stepCount
    if (state.mosaicStyle !== undefined) mosaicStyle.value = state.mosaicStyle
    if (state.mosaicMode !== undefined) mosaicMode.value = state.mosaicMode
    if (state.mosaicIntensity !== undefined) mosaicIntensity.value = state.mosaicIntensity
    if (state.canUndo !== undefined) canUndo.value = state.canUndo
    if (state.isWatermarkActive !== undefined) isWatermarkActive.value = state.isWatermarkActive
    if (state.watermarkText !== undefined) watermarkText.value = state.watermarkText
    if (state.watermarkColor !== undefined) watermarkColor.value = state.watermarkColor
    if (state.isDarkTheme !== undefined) isDarkTheme.value = state.isDarkTheme
  })
})

onUnmounted(() => {
  if (tooltipTimer) clearTimeout(tooltipTimer)
  if (removeStateSub) removeStateSub()
  window.removeEventListener('mousemove', onToolbarDragMove)
  window.removeEventListener('mouseup', onToolbarDragEnd, { capture: true })
})
</script>

<style scoped>
.pin-toolbar-window-container {
  width: 100vw;
  height: 100vh;
  margin: 0;
  padding: 0 10px 0 10px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  background: transparent !important;
  user-select: none;
  overflow: visible;
}

.pin-toolbar-window-container.placement-top {
  justify-content: flex-end;
  padding-bottom: 2px;
}

.pin-toolbar-window-container.placement-bottom {
  justify-content: flex-start;
  padding-top: 2px;
}

.pin-edit-floating-palette {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  cursor: default;
  filter: drop-shadow(0 6px 18px rgba(0, 0, 0, 0.28));
}

.lark-primary-toolbar {
  display: flex;
  align-items: center;
  gap: 3px;
  background: #ffffff;
  padding: 4px 6px;
  border-radius: 9px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
}

.theme-dark .lark-primary-toolbar {
  background: #252830;
  border-color: rgba(255, 255, 255, 0.14);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
}

.toolbar-drag-grip {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8f959e;
  height: 32px;
  padding: 0 4px;
  cursor: grab;
  user-select: none;
  opacity: 0.8;
  transition: opacity 0.15s ease;
}

.toolbar-drag-grip:hover {
  opacity: 1;
  color: #336df4;
}

.toolbar-drag-grip:active {
  cursor: grabbing;
}

.lark-tool-btn {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  width: 32px;
  height: 32px;
  padding: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #1f2329;
  transition: all 0.12s ease;
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
  background: #eef3fe;
  color: #336df4;
}

.theme-dark .lark-tool-btn.active {
  background: rgba(51, 109, 244, 0.28);
  color: #60a5fa;
}

.lark-tool-btn:disabled,
.lark-tool-btn.disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.text-btn-label {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-weight: 800;
  font-size: 15px;
}

.toolbar-sep {
  width: 1px;
  height: 18px;
  background: #dee0e3;
  margin: 0 4px;
}

.theme-dark .toolbar-sep {
  background: rgba(255, 255, 255, 0.18);
}

.action-undo:hover {
  color: #336df4;
}

.action-save:hover {
  color: #10b981;
}

.action-close:hover {
  color: #f64b45;
  background: rgba(246, 75, 69, 0.12);
}

.action-confirm {
  color: #34be4b;
}

.action-confirm:hover {
  background: rgba(52, 190, 75, 0.15);
  color: #2ba23e;
}

/* Secondary Properties Row */
.lark-sub-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #ffffff;
  padding: 4px 8px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.14);
}

.theme-dark .lark-sub-toolbar {
  background: #252830;
  border-color: rgba(255, 255, 255, 0.14);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
}

.sub-sep {
  width: 1px;
  height: 14px;
  background: #dee0e3;
}

.theme-dark .sub-sep {
  background: rgba(255, 255, 255, 0.16);
}

.text-style-group {
  display: flex;
  align-items: center;
  gap: 3px;
}

.sub-mode-btn {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 5px;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-weight: bold;
  font-size: 13px;
  color: #1f2329;
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
  background: rgba(51, 109, 244, 0.28);
  border-color: #60a5fa;
  color: #60a5fa;
}

.style-icon-bordered {
  border: 1px solid currentColor;
  padding: 0 2px;
  border-radius: 2px;
}

.style-icon-filled {
  background: currentColor;
  color: #ffffff !important;
  padding: 0 2px;
  border-radius: 2px;
}

.font-size-select {
  background: #f5f6f7;
  border: 1px solid #dee0e3;
  border-radius: 5px;
  padding: 2px 6px;
  font-size: 12px;
  color: #1f2329;
  cursor: pointer;
}

.theme-dark .font-size-select {
  background: #2b2e35;
  color: #e2e8f0;
  border-color: rgba(255, 255, 255, 0.15);
}

.tag-dir-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  background: #f5f6f7;
  border: 1px solid #dee0e3;
  border-radius: 5px;
  padding: 3px 8px;
  font-size: 11px;
  cursor: pointer;
  color: #1f2329;
}

.theme-dark .tag-dir-btn {
  background: #2b2e35;
  color: #e2e8f0;
  border-color: rgba(255, 255, 255, 0.15);
}

.stroke-selector {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stroke-option {
  width: 24px;
  height: 24px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: transparent;
}

.stroke-option:hover {
  background: rgba(31, 35, 41, 0.08);
}

.stroke-option.active {
  background: rgba(51, 109, 244, 0.18);
}

.stroke-dot {
  border-radius: 50%;
}

.color-palette-group {
  display: flex;
  align-items: center;
  gap: 5px;
}

.color-swatch-btn {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  cursor: pointer;
  border: 1.5px solid rgba(0, 0, 0, 0.15);
  transition: transform 0.12s ease;
  box-sizing: border-box;
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

.mosaic-style-group {
  display: flex;
  align-items: center;
  gap: 3px;
}

.mosaic-presets {
  display: flex;
  align-items: center;
  gap: 3px;
}

.preset-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #f5f6f7;
  border: 1px solid #dee0e3;
  border-radius: 5px;
  padding: 3px 8px;
  font-size: 12px;
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

.theme-dark .preset-pill:hover {
  background: #373b44;
  color: #ffffff;
}

.theme-dark .preset-pill.active {
  background: rgba(59, 130, 246, 0.25);
  border-color: #3b82f6;
  color: #60a5fa;
  font-weight: 600;
}

.mosaic-slider-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mosaic-slider-label {
  font-size: 11px;
  color: #646a73;
}

.mosaic-intensity-slider {
  width: 70px;
  height: 3px;
}

.mosaic-slider-val {
  font-size: 11px;
  color: #646a73;
}

.watermark-presets-group {
  display: flex;
  align-items: center;
  gap: 3px;
}

.watermark-input {
  background: #ffffff;
  color: #111827;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0 10px;
  font-size: 13px;
  font-weight: 500;
  height: 28px;
  outline: none;
  width: 140px;
  box-sizing: border-box;
  caret-color: #336df4;
  transition: all 0.15s ease;
}

.watermark-input:focus {
  border-color: #336df4;
  box-shadow: 0 0 0 2px rgba(51, 109, 244, 0.2);
}

.watermark-input::selection {
  background: #336df4 !important;
  color: #ffffff !important;
}

.watermark-input::placeholder {
  color: rgba(31, 35, 41, 0.45);
}

.theme-dark .watermark-input {
  background: #1e2025;
  color: #ffffff !important;
  border-color: rgba(255, 255, 255, 0.25);
  caret-color: #3b82f6;
}

.theme-dark .watermark-input:focus {
  background: #16181d;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.35);
  color: #ffffff !important;
}

.theme-dark .watermark-input::selection {
  background: #3b82f6 !important;
  color: #ffffff !important;
}

.theme-dark .watermark-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.step-settings {
  display: flex;
  align-items: center;
  gap: 6px;
}

.step-badge-preview {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  color: #ffffff;
  font-size: 11px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
}

.step-reset-btn {
  background: #f5f6f7;
  border: 1px solid #dee0e3;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 11px;
  cursor: pointer;
  color: #1f2329;
}

.theme-dark .step-reset-btn {
  background: #2b2e35;
  color: #e2e8f0;
  border-color: rgba(255, 255, 255, 0.15);
}

/* Custom Fast Lark Tooltip HUD */
.lark-tooltip-hud {
  position: fixed;
  z-index: 999999;
  transform: translate(-50%, 0);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(31, 35, 41, 0.94);
  color: #ffffff;
  padding: 5px 9px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25), 0 1px 3px rgba(0, 0, 0, 0.12);
  user-select: none;
  animation: tooltipFadeInBelow 0.08s cubic-bezier(0.16, 1, 0.3, 1);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.lark-tooltip-hud.placement-below {
  transform: translate(-50%, 0);
  animation-name: tooltipFadeInBelow;
}

.theme-dark .lark-tooltip-hud {
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #f1f5f9;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

.tooltip-text {
  font-size: 11px;
  letter-spacing: 0.2px;
}

.tooltip-shortcut {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.95);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
  font-weight: 600;
}

@keyframes tooltipFadeInBelow {
  from {
    opacity: 0;
    transform: translate(-50%, -4px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0) scale(1);
  }
}
</style>
