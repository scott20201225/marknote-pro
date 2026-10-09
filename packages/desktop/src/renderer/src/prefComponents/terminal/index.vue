<template>
  <div class="pref-terminal">
    <h4>终端设置</h4>

    <!-- Theme Section -->
    <section class="config-section">
      <h5>终端外观与主题 (Tabby 官方色盘)</h5>

      <div class="pref-row">
        <div class="pref-label">
          <span>主题配色方案</span>
          <span class="pref-desc">支持 1:1 自适应 MarkNotePro 应用主题，或自选 190+ 款 Tabby 官方经典配色</span>
        </div>
        <div class="pref-control">
          <el-select
            v-model="selectedTheme"
            filterable
            class="theme-select-box"
            @change="handleThemeChange"
          >
            <el-option label="✨ 自动跟随 MarkNotePro 主题 (推荐)" value="auto" />
            <el-option-group label="Tabby 官方色盘 (190+ 款)">
              <el-option
                v-for="t in allThemes"
                :key="t.name"
                :label="t.name"
                :value="t.name"
              >
                <div class="theme-option-row">
                  <span>{{ t.name }}</span>
                  <div class="color-dots">
                    <span class="dot" :style="{ background: t.background }" />
                    <span class="dot" :style="{ background: t.foreground }" />
                    <span class="dot" :style="{ background: t.blue }" />
                    <span class="dot" :style="{ background: t.green }" />
                  </div>
                </div>
              </el-option>
            </el-option-group>
          </el-select>
        </div>
      </div>

      <!-- Live Terminal Preview Swatch -->
      <div class="theme-preview-box" :style="{ background: currentThemeObj.background, color: currentThemeObj.foreground }">
        <div class="preview-header">
          <span class="preview-dot red" />
          <span class="preview-dot yellow" />
          <span class="preview-dot green" />
          <span class="preview-title">{{ currentThemeObj.name }} (实时色彩与对比度效果)</span>
        </div>
        <div class="preview-body" :style="{ fontFamily: fontFamily, fontSize: `${fontSize}px` }">
          <div class="cmd-line">
            <span :style="{ color: currentThemeObj.green }">user@marknotepro</span>:<span :style="{ color: currentThemeObj.blue }">~/projects</span>$ ls -la
          </div>
          <div class="output-line">
            <span :style="{ color: currentThemeObj.blue }">drwxr-xr-x</span>  23 root root   736 Oct 08 23:50 <span :style="{ color: currentThemeObj.cyan }">.</span>
          </div>
          <div class="output-line">
            <span :style="{ color: currentThemeObj.magenta }">-rw-r--r--</span>   1 user staff 30422 Oct 08 23:55 <span :style="{ color: currentThemeObj.yellow }">MarkNotePro.app</span>
          </div>
          <div class="output-line">
            <span :style="{ color: currentThemeObj.green }">✓ High-Contrast Safety Verified (亮度算法安全检测通过)</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Font & Typography Section -->
    <section class="config-section">
      <h5>字体与显示</h5>

      <div class="pref-row">
        <div class="pref-label">
          <span>终端字体 (Font Family)</span>
          <span class="pref-desc">推荐等宽编程字体，例如 Menlo, Monaco, Consolas, Fira Code</span>
        </div>
        <div class="pref-control">
          <el-input
            v-model="fontFamily"
            placeholder="Menlo, Monaco, Consolas, monospace"
            @change="handleFontFamilyChange"
          />
        </div>
      </div>

      <div class="pref-row">
        <div class="pref-label">
          <span>字体大小 (Font Size)</span>
          <span class="pref-desc">终端字符显示字号 (像素)</span>
        </div>
        <div class="pref-control slider-control">
          <el-slider v-model="fontSize" :min="10" :max="26" :step="1" @change="handleFontSizeChange" />
          <span class="val-num">{{ fontSize }}px</span>
        </div>
      </div>

      <div class="pref-row">
        <div class="pref-label">
          <span>光标闪烁</span>
          <span class="pref-desc">开启终端光标呼吸闪烁效果</span>
        </div>
        <div class="pref-control">
          <el-switch v-model="cursorBlink" @change="handleCursorBlinkChange" />
        </div>
      </div>

      <div class="pref-row">
        <div class="pref-label">
          <span>回滚缓冲区行数 (Scrollback)</span>
          <span class="pref-desc">保留的历史屏幕输出行数 (1000 ~ 50000)</span>
        </div>
        <div class="pref-control">
          <el-input-number v-model="scrollback" :min="1000" :max="50000" :step="1000" @change="handleScrollbackChange" />
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTerminalStore } from '@/store/terminal'
import { usePreferencesStore } from '@/store/preferences'
import { TABBY_COLOR_SCHEMES, getAdaptiveTerminalTheme } from '@shared/terminalThemes'

const terminalStore = useTerminalStore()
const preferencesStore = usePreferencesStore()

const allThemes = TABBY_COLOR_SCHEMES
const selectedTheme = ref(terminalStore.selectedThemeName)
const fontFamily = ref(terminalStore.fontFamily)
const fontSize = ref(terminalStore.fontSize)
const cursorBlink = ref(terminalStore.cursorBlink)
const scrollback = ref(terminalStore.scrollback)

const currentThemeObj = computed(() => {
  const appTheme = preferencesStore.theme || 'light'
  const customTheme = selectedTheme.value === 'auto' ? undefined : selectedTheme.value
  return getAdaptiveTerminalTheme(appTheme, customTheme)
})

function handleThemeChange(val: string): void {
  terminalStore.setPreference('theme', val)
}

function handleFontFamilyChange(val: string): void {
  terminalStore.setPreference('fontFamily', val)
}

function handleFontSizeChange(val: number): void {
  terminalStore.setPreference('fontSize', val)
}

function handleCursorBlinkChange(val: boolean): void {
  terminalStore.setPreference('cursorBlink', val)
}

function handleScrollbackChange(val: number): void {
  terminalStore.setPreference('scrollback', val)
}
</script>

<style scoped>
.pref-terminal {
  padding: 24px 32px;
  max-width: 800px;
}

.config-section {
  margin-top: 24px;
}

.pref-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 0;
  border-bottom: 1px solid var(--itemBgColor, #333);
}

.pref-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 420px;
}

.pref-label span:first-child {
  font-size: 14px;
  font-weight: 500;
  color: var(--editorColor, #e0e0e0);
}

.pref-desc {
  font-size: 12px;
  color: var(--iconColor, #888);
}

.pref-control {
  min-width: 220px;
}

.theme-select-box {
  width: 280px;
}

.theme-option-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.color-dots {
  display: flex;
  gap: 3px;
}

.color-dots .dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
}

.theme-preview-box {
  margin-top: 16px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  border: 1px solid var(--itemBgColor, #444);
}

.preview-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.preview-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.preview-dot.red { background: #ff5f56; }
.preview-dot.yellow { background: #ffbd2e; }
.preview-dot.green { background: #27c93f; }

.preview-title {
  margin-left: 8px;
  font-size: 11px;
  opacity: 0.7;
}

.preview-body {
  padding: 14px 18px;
  line-height: 1.6;
}

.slider-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.slider-control .el-slider {
  width: 160px;
}

.val-num {
  font-size: 13px;
  font-family: monospace;
  color: var(--iconColor, #888);
}
</style>
