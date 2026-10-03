import { Loading } from 'element-ui'

let loadingInstance = null

export const showLoading = () => {
  if (!window.__enableMindMapLoading) return
  const uiBg = getComputedStyle(document.documentElement).getPropertyValue('--mm-ui-bg').trim()
  loadingInstance = Loading.service({
    lock: true,
    background: uiBg || (document.documentElement.classList.contains('isDark') ? '#1a1b26' : '#ffffff')
  })
}

export const hideLoading = () => {
  if (loadingInstance) {
    loadingInstance.close()
    loadingInstance = null
  }
}
  