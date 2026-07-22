import { h } from 'vue'
import {
  Folder as FilesIcon,
  Search as SearchIcon,
  Memo as TocIcon,
  Setting as SettingIcon
} from '@element-plus/icons-vue'
import { t } from '@/i18n'

export interface SideBarIconEntry {
  id: string
  name: () => string
  icon: unknown
}

export const sideBarIcons: SideBarIconEntry[] = [
  {
    id: 'files',
    name: () => t('sideBar.icons.files'),
    icon: FilesIcon
  },
  {
    id: 'search',
    name: () => t('sideBar.icons.search'),
    icon: SearchIcon
  },
  {
    id: 'toc',
    name: () => t('sideBar.icons.toc'),
    icon: TocIcon
  }
]

export const sideBarBottomIcons: SideBarIconEntry[] = [
  {
    id: 'settings',
    name: () => t('sideBar.icons.settings'),
    icon: SettingIcon
  },
  {
    id: 'git',
    name: () => t('sideBar.icons.git'),
    icon: {
      render: () =>
        h(
          'svg',
          {
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': '1.9',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round'
          },
          [
            h('circle', { cx: 6, cy: 18, r: 2.3 }),
            h('circle', { cx: 6, cy: 6, r: 2.3 }),
            h('circle', { cx: 18, cy: 12, r: 2.3 }),
            h('path', { d: 'M6 8.3v7.4' }),
            h('path', { d: 'M8.1 7.1 16 11' })
          ]
        )
    }
  }
]
