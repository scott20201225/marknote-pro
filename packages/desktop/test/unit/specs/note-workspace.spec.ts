import { describe, expect, it } from 'vitest'
import path from 'path'
import {
  NOTE_ATTACHMENTS_DIRECTORY,
  getVisibleNoteFiles,
  getVisibleNoteFolders
} from '@/util/noteWorkspace'

;(window as unknown as { path: typeof path }).path = path

describe('note workspace visibility', () => {
  const rootPath = '/workspace'

  it('hides the attachments support folder from the root tree', () => {
    const root = {
      pathname: rootPath,
      name: 'MarkNotePro',
      isDirectory: true,
      folders: [
        {
          pathname: `${rootPath}/${NOTE_ATTACHMENTS_DIRECTORY}`,
          name: NOTE_ATTACHMENTS_DIRECTORY,
          isDirectory: true,
          folders: [],
          files: []
        },
        {
          pathname: `${rootPath}/GROUP_Work`,
          name: 'GROUP_Work',
          isDirectory: true,
          folders: [],
          files: []
        }
      ],
      files: []
    }

    const visible = getVisibleNoteFolders(root, rootPath)
    expect(visible).toHaveLength(1)
    expect(visible[0].name).toBe('GROUP_Work')
  })

  it('still keeps markdown documents visible inside an area', () => {
    const area = {
      pathname: `${rootPath}/GROUP_Work/AREA_Project`,
      name: 'AREA_Project',
      isDirectory: true,
      folders: [],
      files: [
        {
          pathname: `${rootPath}/GROUP_Work/AREA_Project/Doc.md`,
          name: 'Doc.md',
          isFile: true,
          isMarkdown: true
        },
        {
          pathname: `${rootPath}/GROUP_Work/AREA_Project/notes.txt`,
          name: 'notes.txt',
          isFile: true,
          isMarkdown: false
        }
      ]
    }

    const visible = getVisibleNoteFiles(area, rootPath)
    expect(visible).toHaveLength(1)
    expect(visible[0].name).toBe('Doc.md')
  })
})
