import { usePreferencesStore } from '@/store/preferences'
import type { MindMapConfiguration } from '@shared/types/ipc'

export const getMindMapConfiguration = (): MindMapConfiguration => {
  const preferencesStore = usePreferencesStore()
  return {
    language: preferencesStore.language === 'en' ? 'en' : 'zh',
    dark: document.body.classList.contains('dark'),
    theme: preferencesStore.theme
  }
}
