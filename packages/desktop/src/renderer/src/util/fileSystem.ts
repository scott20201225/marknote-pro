export type FileCreateType = 'file' | 'directory'
export type PasteType = 'cut' | 'copy'
export type HashType = 'sha1' | 'sha256' | 'sha512'
export const NOTE_ATTACHMENTS_DIRECTORY = 'Attachments'

export const create = async(pathname: string, type: FileCreateType): Promise<void> => {
  return type === 'directory'
    ? window.fileUtils.ensureDir(pathname)
    : window.fileUtils.outputFile(pathname, '')
}

export interface PasteOptions {
  src: string
  dest: string
  type: PasteType
}

export const paste = async({ src, dest, type }: PasteOptions): Promise<void> => {
  return type === 'cut' ? window.fileUtils.move(src, dest) : window.fileUtils.copy(src, dest)
}

export const rename = async(src: string, dest: string): Promise<void> => {
  return window.fileUtils.move(src, dest)
}

const toHex = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let out = ''
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0')
  return out
}

// Replacement for crypto.createHash that uses the Web Crypto API. Only SHA-1 is
// used by callers in this file.
export const getHash = async(
  content: string | Uint8Array | ArrayBuffer,
  encoding?: string,
  type?: HashType
): Promise<string> => {
  const algo = type === 'sha1' ? 'SHA-1' : type === 'sha256' ? 'SHA-256' : 'SHA-512'
  let data: Uint8Array
  if (encoding === 'utf8' || encoding == null) {
    data = new TextEncoder().encode(typeof content === 'string' ? content : String(content))
  } else if (content instanceof Uint8Array) {
    data = content
  } else if (content instanceof ArrayBuffer) {
    data = new Uint8Array(content)
  } else if (typeof content === 'string') {
    data = new TextEncoder().encode(content)
  } else {
    data = new TextEncoder().encode(String(content))
  }
  // TS lib's Uint8Array<ArrayBufferLike> doesn't satisfy BufferSource's
  // strict ArrayBuffer expectation in newer @types/node; cast through unknown.
  const digest = await window.crypto.subtle.digest(algo, data as unknown as BufferSource)
  return toHex(digest)
}

export const getContentHash = (content: string | Uint8Array | ArrayBuffer): Promise<string> =>
  getHash(content, 'utf8', 'sha1')

const buildHashedAttachmentFilename = (filename: string, md5: string): string => {
  const parsed = window.path.parse(filename)
  const basename = parsed.name || parsed.base || 'attachment'
  return `${basename}-${md5}${parsed.ext}`
}

const hasEmbeddedMd5Suffix = (filename: string, md5: string): boolean => {
  const parsed = window.path.parse(filename)
  return parsed.name.endsWith(`-${md5}`)
}

const DATA_IMAGE_URI = /^data:(image\/(?:png|jpe?g|gif|webp|bmp));base64,([\s\S]+)$/i

const imageExtensionForMimeType = (mimeType: string): string => {
  switch (mimeType.toLowerCase()) {
    case 'image/jpeg': return 'jpg'
    case 'image/png': return 'png'
    case 'image/gif': return 'gif'
    case 'image/webp': return 'webp'
    case 'image/bmp': return 'bmp'
    default: return 'png'
  }
}

const imageMimeTypeForPath = (pathname: string): string | null => {
  switch (window.path.extname(pathname).toLowerCase()) {
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.png': return 'image/png'
    case '.gif': return 'image/gif'
    case '.webp': return 'image/webp'
    case '.bmp': return 'image/bmp'
    default: return null
  }
}

// Muya represents an in-memory clipboard bitmap as a data URI. Convert it
// back to a real image file before applying the normal attachment pipeline.
export const dataUriToImageFile = (value: string): File | null => {
  const match = DATA_IMAGE_URI.exec(value)
  if (!match) return null

  try {
    const mimeType = match[1]
    const encoded = match[2].replace(/\s/g, '')
    const binary = window.atob(encoded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
    return new File([bytes], `screenshot.${imageExtensionForMimeType(mimeType)}`, { type: mimeType })
  } catch {
    return null
  }
}

// The macOS screenshot command writes the capture to a temporary PNG before
// sending its pathname to the editor. Convert only that image source when the
// user explicitly chooses Base64 embedding.
export const imagePathToDataUri = async(pathname: string): Promise<string | null> => {
  const mimeType = imageMimeTypeForPath(pathname)
  if (!mimeType) return null

  try {
    const content = await window.fileUtils.readFile(pathname)
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content
    const chunkSize = 0x8000
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
    }
    return `data:${mimeType};base64,${window.btoa(binary)}`
  } catch {
    return null
  }
}

export const copyImageToFolder = async(
  pathname: string,
  image: string | File,
  outputDir: string,
  isRelative = false,
  currentPathname: string | null = null
): Promise<string> => {
  await window.fileUtils.ensureDir(outputDir)
  const toResult = (absolutePath: string) =>
    isRelative && currentPathname
      ? window.path.relative(window.path.dirname(currentPathname), absolutePath)
      : absolutePath
  const isPath = typeof image === 'string'
  if (isPath) {
    const dir = pathname ? window.path.dirname(pathname) : currentPathname
      ? window.path.dirname(currentPathname)
      : ''
    const imagePath = window.path.resolve(dir, image as string)
    const isImage = await window.fileUtils.isImageFile(imagePath)
    if (isImage) {
      const filename = window.path.basename(imagePath)
      const hash = await window.fileUtils.md5File(imagePath)
      if (hasEmbeddedMd5Suffix(filename, hash)) {
        return toResult(imagePath)
      }
      const hashFilePath = window.path.join(outputDir, buildHashedAttachmentFilename(filename, hash))
      if (!window.fileUtils.isSamePathSync(imagePath, hashFilePath) &&
        !(await window.fileUtils.pathExists(hashFilePath))) {
        await window.fileUtils.copy(imagePath, hashFilePath)
      }
      return toResult(hashFilePath)
    } else {
      return image as string
    }
  } else {
    const file = image as File
    const buffer = new Uint8Array(await file.arrayBuffer())
    const hash = await window.fileUtils.md5Data(buffer)
    const imagePath = window.path.join(
      outputDir,
      buildHashedAttachmentFilename(file.name, hash)
    )
    if (!(await window.fileUtils.pathExists(imagePath))) {
      await window.fileUtils.writeFile(imagePath, buffer)
    }
    return toResult(imagePath)
  }
}
