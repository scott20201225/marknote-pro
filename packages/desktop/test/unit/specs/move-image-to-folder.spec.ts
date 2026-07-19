import { describe, it, expect, beforeEach, vi } from 'vitest'
import path from 'path'
import { copyImageToFolder } from '@/util/fileSystem'

// copyImageToFolder relies on the preload contextBridge surface (window.path,
// window.fileUtils). Stub them with the real node `path` and in-memory fakes so
// the relative-path persistence logic can be exercised (real window.crypto is
// used for the content hash).
const copy = vi.fn((_src: string, _dest: string) => Promise.resolve())
const writeFile = vi.fn(() => Promise.resolve())
const md5File = vi.fn(() => Promise.resolve('hash-from-file'))
const md5Data = vi.fn(() => Promise.resolve('hash-from-bytes'))
const pathExists = vi.fn(() => Promise.resolve(false))

const win = window as unknown as {
  path: typeof path
  fileUtils: Record<string, unknown>
}

beforeEach(() => {
  copy.mockClear()
  writeFile.mockClear()
  md5File.mockClear()
  md5Data.mockClear()
  pathExists.mockClear()
  win.path = path
  win.fileUtils = {
    ensureDir: vi.fn(() => Promise.resolve()),
    isImageFile: vi.fn(() => Promise.resolve(true)),
    copy,
    writeFile,
    md5File,
    md5Data,
    pathExists,
    isSamePathSync: vi.fn((a: string, b: string) => path.normalize(a) === path.normalize(b))
  }
})

describe('copyImageToFolder relative-directory persistence', () => {
  const docPath = '/tmp/notes/a.md'
  const assetsDir = '/tmp/notes/assets'

  it('returns a relative path for a binary File when isRelative is set', async() => {
    const file = new File([new Uint8Array([1, 2, 3])], 'pic.png', { type: 'image/png' })
    const result = await copyImageToFolder(docPath, file, assetsDir, true, docPath)
    expect(result).toBe('assets/pic-hash-from-bytes.png')
    expect(path.isAbsolute(result)).toBe(false)
  })

  it('returns a relative path for a local path string when isRelative is set', async() => {
    const source = '/Users/someone/pictures/pic.png'
    const result = await copyImageToFolder(docPath, source, assetsDir, true, docPath)
    // The image must be copied into the assets dir...
    expect(copy).toHaveBeenCalledTimes(1)
    expect(copy.mock.calls[0][1]).toBe(path.join(assetsDir, 'pic-hash-from-file.png'))
    // ...and the inserted reference must be the portable relative path.
    expect(path.isAbsolute(result)).toBe(false)
    expect(result).toBe('assets/pic-hash-from-file.png')
  })

  it('returns the absolute hashed path for a local path string when isRelative is false', async() => {
    const source = '/Users/someone/pictures/pic.png'
    const result = await copyImageToFolder(docPath, source, assetsDir, false, docPath)
    // copy still lands inside the assets dir...
    expect(copy).toHaveBeenCalledTimes(1)
    expect(copy.mock.calls[0][1]).toBe(path.join(assetsDir, 'pic-hash-from-file.png'))
    // ...and with isRelative=false the returned reference is the absolute
    // hashed destination path (the second arg passed to copy).
    expect(path.isAbsolute(result)).toBe(true)
    expect(result).toBe(copy.mock.calls[0][1])
    expect(result).toBe(path.join(assetsDir, 'pic-hash-from-file.png'))
  })

  it('short-circuits without copying when the image already lives at the hashed destination', async() => {
    const inPlace = path.join(assetsDir, 'already-hash-from-file.png')
    const result = await copyImageToFolder(docPath, inPlace, assetsDir, false, docPath)
    expect(copy).not.toHaveBeenCalled()
    expect(result).toBe(inPlace)
  })

  it('short-circuits to a relative reference when isRelative is set and the image is already hashed in outputDir', async() => {
    const inPlace = path.join(assetsDir, 'already-hash-from-file.png')
    md5File.mockResolvedValueOnce('hash-from-file')
    const result = await copyImageToFolder(docPath, inPlace, assetsDir, true, docPath)
    expect(copy).not.toHaveBeenCalled()
    expect(path.isAbsolute(result)).toBe(false)
    expect(result).toBe('assets/already-hash-from-file.png')
  })

  // Item 114: editor.vue imageInsertAction='path'. The string-path branch
  // (typeof image==='string' → destImagePath = image, verbatim, no copy) lives
  // in editor.vue:917-920 and is not importable. The automatable slice is its
  // binary fallback (editor.vue:926-932): a saved-on-disk tab with
  // preferRelative routes a File through copyImageToFolder(null, file, relDir,
  // true, currentPathname). pathname is null there because a File needs no
  // source dir — assert that path stays portable and never dereferences null.
  it('routes a binary File through the relative branch with a null pathname (path-action fallback)', async() => {
    const file = new File([new Uint8Array([4, 5, 6])], 'pasted.png', { type: 'image/png' })
    const result = await copyImageToFolder(
      null as unknown as string,
      file,
      assetsDir,
      true,
      docPath
    )
    // No copy for a binary File — it is written, not copied.
    expect(copy).not.toHaveBeenCalled()
    expect(writeFile).toHaveBeenCalledTimes(1)
    // The written destination is inside the assets dir...
    expect((writeFile.mock.calls[0] as unknown[])[0] as string).toBe(path.join(assetsDir, 'pasted-hash-from-bytes.png'))
    // ...and the inserted reference is the portable relative path.
    expect(path.isAbsolute(result)).toBe(false)
    expect(result).toBe('assets/pasted-hash-from-bytes.png')
  })

  it('a string local path already inside outputDir is returned verbatim when isRelative is false (path-action string passthrough analog)', async() => {
    // Mirrors the editor.vue 'path' string branch intent: an absolute local
    // path that already lives in the output dir is neither copied nor uploaded;
    // the absolute reference is preserved unchanged.
    const local = path.join(assetsDir, 'pic-hash-from-file.png')
    const result = await copyImageToFolder(docPath, local, assetsDir, false, docPath)
    expect(copy).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
    expect(result).toBe(local)
    expect(path.isAbsolute(result)).toBe(true)
  })
})
