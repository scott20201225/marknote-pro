import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import { getMindMapThemeInfo } from '../../../src/common/mindmapTheme'

describe('MindMap Theme Background and URL Params', () => {
  it('correctly maps dark themes to dark background colors and isDark = true', () => {
    const darkInfo = getMindMapThemeInfo('dark')
    expect(darkInfo.isDark).toBe(true)
    expect(darkInfo.backgroundColor).toBe('#282828')

    const tokyoNightInfo = getMindMapThemeInfo('tokyo-night')
    expect(tokyoNightInfo.isDark).toBe(true)
    expect(tokyoNightInfo.backgroundColor).toBe('#1a1b26')

    const oneDarkInfo = getMindMapThemeInfo('one-dark')
    expect(oneDarkInfo.isDark).toBe(true)
    expect(oneDarkInfo.backgroundColor).toBe('#282c34')
  })

  it('correctly maps light themes to light background colors and isDark = false', () => {
    const lightInfo = getMindMapThemeInfo('light')
    expect(lightInfo.isDark).toBe(false)
    expect(lightInfo.backgroundColor).toBe('#ffffff')

    const ayuLightInfo = getMindMapThemeInfo('ayu-light')
    expect(ayuLightInfo.isDark).toBe(false)
    expect(ayuLightInfo.backgroundColor).toBe('#fafafa')
  })

  it('serializes URL query parameters correctly for initial load without flash', () => {
    const info = getMindMapThemeInfo('tokyo-night')
    const url = new URL('file:///path/to/index.html')
    url.searchParams.set('theme', info.theme)
    url.searchParams.set('bg', info.backgroundColor)
    url.searchParams.set('dark', info.isDark ? '1' : '0')
    url.searchParams.set('lang', 'zh-CN')

    expect(url.searchParams.get('theme')).toBe('tokyo-night')
    expect(url.searchParams.get('bg')).toBe('#1a1b26')
    expect(url.searchParams.get('dark')).toBe('1')
    expect(url.searchParams.get('lang')).toBe('zh-CN')
  })

  it('contains loading mask theme adaptation and early theme initialization in index.html', () => {
    const indexPath = path.resolve(__dirname, '../../../src/mindMapWebApp/mind-map/index.html')
    expect(fs.existsSync(indexPath)).toBe(true)
    const htmlContent = fs.readFileSync(indexPath, 'utf-8')

    // 验证 Loading 遮罩主题深度样式适配
    expect(htmlContent).toContain('.el-loading-mask')
    expect(htmlContent).toContain('background-color: var(--mm-ui-bg) !important;')
    expect(htmlContent).toContain('.el-loading-spinner .el-loading-text')
    expect(htmlContent).toContain('color: var(--mm-panel-text) !important;')
    expect(htmlContent).toContain('stroke: var(--mm-theme-color) !important;')

    // 验证 <head> 中立即执行 applyHostUITheme
    expect(htmlContent).toContain('window.applyHostUITheme = (themeName, isDark, backgroundColor, colors)')
    expect(htmlContent).toContain('window.applyHostUITheme(initTheme, isDarkParam, initBg, null)')

    // 验证 Element UI Loading 拦截器注入
    expect(htmlContent).toContain('window.ELEMENT.Loading.service')
    expect(htmlContent).toContain('Vue.prototype.$loading')
  })

  it('eliminates initial loading mask flash in bundle chunks and source files', () => {
    const chunkPath = path.resolve(__dirname, '../../../src/mindMapWebApp/mind-map/dist/js/chunk-ef5c9f42.js')
    expect(fs.existsSync(chunkPath)).toBe(true)
    const chunkContent = fs.readFileSync(chunkPath, 'utf-8')

    // 验证 Index.vue created() 不再调用 this.$loading
    expect(chunkContent).not.toContain('const t=this.$loading({lock:!0,text:this.$t("other.loading")})')
    expect(chunkContent).toContain('async created(){this.initLocalConfig();this.show=!0,this.setBodyDark()}')

    // 验证 vq 挂载 loading 已被 __enableMindMapLoading 拦截
    expect(chunkContent).toContain('window.__enableMindMapLoading')

    // 验证 chunk-vendors.css 不再有默认白底 hsla(0,0%,100%,.9)
    const cssPath = path.resolve(__dirname, '../../../src/mindMapWebApp/mind-map/dist/css/chunk-vendors.css')
    expect(fs.existsSync(cssPath)).toBe(true)
    const cssContent = fs.readFileSync(cssPath, 'utf-8')
    expect(cssContent).not.toContain('background-color:hsla(0,0%,100%,.9)')
    expect(cssContent).toContain('background-color:var(--mm-ui-bg,#ffffff)')
  })
})
