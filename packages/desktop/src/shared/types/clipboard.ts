export type ClipboardContentType = 'text' | 'image' | 'code' | 'html'

export interface ClipboardItemRecord {
  id: string
  type: ClipboardContentType
  content: string // raw text, code content, or HTML
  htmlContent?: string // rich text HTML formatting
  rtfContent?: string // rich text RTF formatting
  previewText?: string
  imagePath?: string // absolute path in ~/.mark-suite/clipboard/images/
  imageDataUrl?: string // thumbnail or base64 (for fast list display)
  width?: number
  height?: number
  charCount?: number
  timestamp: number
  hash: string
  pinned?: boolean
  sourceApp?: string
}

export interface PinWindowPayload {
  id: string
  type: 'image' | 'text'
  content: string // image dataUrl or text string
  width?: number
  height?: number
  x?: number
  y?: number
  title?: string
}

export interface ScreenCaptureDisplayInfo {
  id: number
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
  workArea?: {
    x: number
    y: number
    width: number
    height: number
  }
  windows?: Array<{
    pid?: number
    x: number
    y: number
    w: number
    h: number
    owner?: string
    title?: string
  }>
  scaleFactor: number
  dataUrl: string
}
