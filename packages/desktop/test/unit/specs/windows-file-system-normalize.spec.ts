import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { create, paste, rename } from '@/util/fileSystem'

describe('fileSystem path normalization on Windows', () => {
  const ensureDir = vi.fn(() => Promise.resolve())
  const outputFile = vi.fn(() => Promise.resolve())
  const move = vi.fn(() => Promise.resolve())
  const copy = vi.fn(() => Promise.resolve())

  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as typeof window & { path: typeof path.win32 }).path = path.win32
    window.fileUtils = {
      ...window.fileUtils,
      ensureDir,
      outputFile,
      move,
      copy
    }
  })

  it('normalizes create targets before invoking fs APIs', async() => {
    await create('C:/notes/GROUP_Work', 'directory')
    await create('C:/notes/GROUP_Work/Doc.md', 'file')

    expect(ensureDir).toHaveBeenCalledWith('C:\\notes\\GROUP_Work')
    expect(outputFile).toHaveBeenCalledWith('C:\\notes\\GROUP_Work\\Doc.md', '')
  })

  it('normalizes paste and rename targets before invoking fs APIs', async() => {
    await paste({
      src: 'C:/notes/Doc.md',
      dest: 'C:/notes/GROUP_Work/Doc.md',
      type: 'copy'
    })
    await paste({
      src: 'C:/notes/Doc.md',
      dest: 'C:/notes/AREA_Project/Doc.md',
      type: 'cut'
    })
    await rename('C:/notes/Doc.md', 'C:/notes/Renamed.md')

    expect(copy).toHaveBeenCalledWith(
      'C:\\notes\\Doc.md',
      'C:\\notes\\GROUP_Work\\Doc.md'
    )
    expect(move).toHaveBeenNthCalledWith(
      1,
      'C:\\notes\\Doc.md',
      'C:\\notes\\AREA_Project\\Doc.md'
    )
    expect(move).toHaveBeenNthCalledWith(
      2,
      'C:\\notes\\Doc.md',
      'C:\\notes\\Renamed.md'
    )
  })
})
