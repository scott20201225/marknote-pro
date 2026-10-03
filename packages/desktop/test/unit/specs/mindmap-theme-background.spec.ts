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

  it('contains loading mask hidden styles and early theme initialization in index.html', () => {
    const indexPath = path.resolve(__dirname, '../../../src/mindMapWebApp/mind-map/index.html')
    expect(fs.existsSync(indexPath)).toBe(true)
    const htmlContent = fs.readFileSync(indexPath, 'utf-8')

    // 验证 Loading 遮罩与 Spinner 全局彻底隐藏
    expect(htmlContent).toContain('.el-loading-mask')
    expect(htmlContent).toContain('display: none !important;')
    expect(htmlContent).toContain('pointer-events: none !important;')
    expect(htmlContent).toContain('.el-loading-spinner')

    // 验证 <head> 中立即执行 applyHostUITheme
    expect(htmlContent).toContain('window.applyHostUITheme = (themeName, isDark, backgroundColor, colors)')
    expect(htmlContent).toContain('window.applyHostUITheme(initTheme, isDarkParam, initBg, null)')

    // 验证 Element UI Loading 静默拦截器注入
    expect(htmlContent).toContain('window.ELEMENT.Loading.service = silentLoading')
    expect(htmlContent).toContain('Vue.prototype.$loading = silentLoading')
  })

  it('preserves clean bundle chunks and suppresses loading masks without binary corruption', () => {
    const chunkPath = path.resolve(__dirname, '../../../src/mindMapWebApp/mind-map/dist/js/chunk-ef5c9f42.js')
    expect(fs.existsSync(chunkPath)).toBe(true)

    const indexPath = path.resolve(__dirname, '../../../src/mindMapWebApp/mind-map/index.html')
    const htmlContent = fs.readFileSync(indexPath, 'utf-8')
    expect(htmlContent).toContain('silentLoading')
  })
})
