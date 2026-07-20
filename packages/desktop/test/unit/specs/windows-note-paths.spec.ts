import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { addDirectory, addFile, unlinkDirectory, unlinkFile } from '@/store/treeCtrl'
import { getNotePathDisplay } from '@/util/noteWorkspace'

describe('note workspace paths on Windows', () => {
  beforeEach(() => {
    ;(window as typeof window & {
      path: typeof path.win32
      fileUtils: { isSamePathSync: (a: string, b: string) => boolean }
    }).path = path.win32

    window.fileUtils = {
      ...window.fileUtils,
      isSamePathSync: (a: string, b: string) =>
        path.win32.normalize(a).toLowerCase() === path.win32.normalize(b).toLowerCase()
    }
  })

  it('builds and removes note tree nodes with mixed slash styles', () => {
    const root = {
      pathname: 'C:\\notes',
      name: 'notes',
      isDirectory: true as const,
      isFile: false as const,
      isMarkdown: false as const,
      folders: [],
      files: []
    }

    addDirectory(root, { pathname: 'C:/notes/GROUP_Work/AREA_Project' })
    addFile(root, {
      pathname: 'C:/notes/GROUP_Work/AREA_Project/Doc.md',
      name: 'Doc.md',
      isDirectory: false,
      isFile: true,
      isMarkdown: true
    })

    expect(root.folders).toHaveLength(1)
    expect(root.folders[0].pathname).toBe('C:\\notes\\GROUP_Work')
    expect(root.folders[0].folders[0].pathname).toBe('C:\\notes\\GROUP_Work\\AREA_Project')
    expect(root.folders[0].folders[0].files[0].pathname).toBe('C:\\notes\\GROUP_Work\\AREA_Project\\Doc.md')

    unlinkFile(root, { pathname: 'C:\\notes\\GROUP_Work\\AREA_Project\\Doc.md' })
    expect(root.folders[0].folders[0].files).toHaveLength(0)

    unlinkDirectory(root, { pathname: 'C:/notes/GROUP_Work' })
    expect(root.folders).toHaveLength(0)
  })

  it('renders readable note breadcrumbs from mixed separators', () => {
    const display = getNotePathDisplay(
      'C:\\notes',
      'C:/notes/GROUP_Work/AREA_Project/Doc.md'
    )

    expect(display).toBe('Work / Project / Doc')
  })
})
