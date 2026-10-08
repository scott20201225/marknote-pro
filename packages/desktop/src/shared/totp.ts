import jsQR from 'jsqr'

export interface OtpParsedInfo {
  secret: string
  issuer?: string
  account?: string
  label?: string
  period: number
  digits: number
  algorithm: string
  type: 'totp' | 'hotp'
  rawUri?: string
}

export interface TotpGenerationResult {
  code: string
  formattedCode: string
  remainingSeconds: number
  period: number
  progress: number
}

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const TOTP_KEY_ALIASES = new Set(['otp', 'totp', '2fa', 'twofactor', 'totp seed', 'opt', '双重验证', '谷歌验证码', '动态口令'])

/**
 * Clean and decode Base32 string to Uint8Array
 */
export function base32Decode(base32: string): Uint8Array {
  const cleaned = base32.replace(/=+$/, '').toUpperCase().replace(/\s+/g, '')
  let bits = 0
  let value = 0
  const output: number[] = []

  for (let i = 0; i < cleaned.length; i++) {
    const val = BASE32_CHARS.indexOf(cleaned[i])
    if (val === -1) continue
    value = (value << 5) | val
    bits += 5
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new Uint8Array(output)
}

/**
 * Encode Uint8Array to Base32 string
 */
export function base32Encode(buffer: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ''

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]
    bits += 8
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31]
  }
  return output
}

/**
 * Pure TypeScript SHA-1 implementation
 */
export function sha1(bytes: Uint8Array): Uint8Array {
  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0

  const len = bytes.length
  const bitLen = len * 8
  const padLen = (((len + 8) >> 6) + 1) << 6
  const buf = new Uint8Array(padLen)
  buf.set(bytes)
  buf[len] = 0x80

  buf[padLen - 4] = (bitLen >>> 24) & 0xff
  buf[padLen - 3] = (bitLen >>> 16) & 0xff
  buf[padLen - 2] = (bitLen >>> 8) & 0xff
  buf[padLen - 1] = bitLen & 0xff

  const w = new Int32Array(80)
  for (let i = 0; i < padLen; i += 64) {
    for (let j = 0; j < 16; j++) {
      w[j] =
        (buf[i + j * 4] << 24) |
        (buf[i + j * 4 + 1] << 16) |
        (buf[i + j * 4 + 2] << 8) |
        buf[i + j * 4 + 3]
    }
    for (let j = 16; j < 80; j++) {
      const v = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16]
      w[j] = (v << 1) | (v >>> 31)
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4

    for (let j = 0; j < 80; j++) {
      let f = 0
      let k = 0
      if (j < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (j < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }

      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) | 0
      e = d
      d = c
      c = (b << 30) | (b >>> 2)
      b = a
      a = temp
    }

    h0 = (h0 + a) | 0
    h1 = (h1 + b) | 0
    h2 = (h2 + c) | 0
    h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0
  }

  const out = new Uint8Array(20)
  for (let i = 0; i < 4; i++) {
    out[i] = (h0 >>> (24 - i * 8)) & 0xff
    out[i + 4] = (h1 >>> (24 - i * 8)) & 0xff
    out[i + 8] = (h2 >>> (24 - i * 8)) & 0xff
    out[i + 12] = (h3 >>> (24 - i * 8)) & 0xff
    out[i + 16] = (h4 >>> (24 - i * 8)) & 0xff
  }
  return out
}

/**
 * Pure TypeScript HMAC-SHA1 implementation
 */
export function hmacSha1(key: Uint8Array, message: Uint8Array): Uint8Array {
  const blockSize = 64
  let k = key
  if (k.length > blockSize) {
    k = sha1(k)
  }

  const paddedKey = new Uint8Array(blockSize)
  paddedKey.set(k)

  const oKeyPad = new Uint8Array(blockSize + 20)
  const iKeyPad = new Uint8Array(blockSize + message.length)

  for (let i = 0; i < blockSize; i++) {
    oKeyPad[i] = paddedKey[i] ^ 0x5c
    iKeyPad[i] = paddedKey[i] ^ 0x36
  }

  iKeyPad.set(message, blockSize)
  const innerHash = sha1(iKeyPad)
  oKeyPad.set(innerHash, blockSize)

  return sha1(oKeyPad)
}

/**
 * Check if a field key is considered a TOTP field
 */
export function isTotpKey(key: string): boolean {
  if (!key) return false
  return TOTP_KEY_ALIASES.has(key.trim().toLowerCase())
}

/**
 * Check if a value looks like a TOTP URI or Base32 secret
 */
export function isTotpValue(value: string): boolean {
  if (!value || typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed.startsWith('otpauth://') || trimmed.startsWith('otpauth-migration://')) {
    return true
  }
  const clean = trimmed.replace(/\s+/g, '').toUpperCase()
  return clean.length >= 16 && /^[A-Z2-7]+=*$/.test(clean)
}

/**
 * Check if a field item is a 2FA / TOTP field
 */
export function isTotpField(field: { key: string; value: string }): boolean {
  if (!field) return false
  if (isTotpKey(field.key)) return true
  if (field.value && (field.value.startsWith('otpauth://') || field.value.startsWith('otpauth-migration://'))) {
    return true
  }
  return false
}

/**
 * Decode Google Authenticator export QR protocol: otpauth-migration://offline?data=...
 */
export function decodeGoogleMigration(uri: string): OtpParsedInfo[] {
  try {
    const url = new URL(uri)
    const dataBase64 = url.searchParams.get('data')
    if (!dataBase64) return []

    // Convert standard / URL-safe base64 to binary
    const normalized = dataBase64.replace(/-/g, '+').replace(/_/g, '/')
    const binStr = atob(normalized)
    const buffer = new Uint8Array(binStr.length)
    for (let i = 0; i < binStr.length; i++) {
      buffer[i] = binStr.charCodeAt(i)
    }

    const results: OtpParsedInfo[] = []
    let pos = 0

    while (pos < buffer.length) {
      const key = buffer[pos++]
      const wireType = key & 0x7
      const fieldNum = key >>> 3

      if (wireType === 0) {
        while (pos < buffer.length && (buffer[pos++] & 0x80) !== 0) {}
      } else if (wireType === 2) {
        let len = 0
        let shift = 0
        while (pos < buffer.length) {
          const b = buffer[pos++]
          len |= (b & 0x7f) << shift
          if ((b & 0x80) === 0) break
          shift += 7
        }
        const data = buffer.subarray(pos, pos + len)
        pos += len

        if (fieldNum === 1) {
          // Parse OtpParameters sub-message
          let pPos = 0
          let secretBytes: Uint8Array = new Uint8Array(0)
          let name = ''
          let issuer = ''
          let algorithm = 'SHA1'
          let digits = 6
          let type: 'totp' | 'hotp' = 'totp'

          while (pPos < data.length) {
            const pKey = data[pPos++]
            const pWire = pKey & 0x7
            const pField = pKey >>> 3

            if (pWire === 0) {
              let val = 0
              let pShift = 0
              while (pPos < data.length) {
                const b = data[pPos++]
                val |= (b & 0x7f) << pShift
                if ((b & 0x80) === 0) break
                pShift += 7
              }
              if (pField === 4) {
                if (val === 2) algorithm = 'SHA256'
                else if (val === 3) algorithm = 'SHA512'
              } else if (pField === 5) {
                if (val === 2) digits = 8
              } else if (pField === 6) {
                if (val === 1) type = 'hotp'
              }
            } else if (pWire === 2) {
              let pLen = 0
              let pShift = 0
              while (pPos < data.length) {
                const b = data[pPos++]
                pLen |= (b & 0x7f) << pShift
                if ((b & 0x80) === 0) break
                pShift += 7
              }
              const pData = data.subarray(pPos, pPos + pLen)
              pPos += pLen

              if (pField === 1) {
                secretBytes = pData
              } else if (pField === 2) {
                name = new TextDecoder().decode(pData)
              } else if (pField === 3) {
                issuer = new TextDecoder().decode(pData)
              }
            } else {
              break
            }
          }

          if (secretBytes.length > 0) {
            const secret = base32Encode(secretBytes)
            let account = name
            if (name.includes(':')) {
              const parts = name.split(':')
              if (!issuer) issuer = parts[0].trim()
              account = parts.slice(1).join(':').trim()
            }
            results.push({
              secret,
              issuer,
              account,
              label: name || issuer,
              period: 30,
              digits,
              algorithm,
              type,
              rawUri: `otpauth://totp/${encodeURIComponent(name || issuer)}?secret=${secret}&issuer=${encodeURIComponent(issuer || '')}&period=30&digits=${digits}`
            })
          }
        }
      } else {
        break
      }
    }
    return results
  } catch (e) {
    console.error('Failed to parse Google Authenticator migration payload:', e)
    return []
  }
}

/**
 * Parse an otpauth:// URI or raw secret into OtpParsedInfo
 */
export function parseOtpUri(uriOrSecret: string): OtpParsedInfo | null {
  if (!uriOrSecret || typeof uriOrSecret !== 'string') return null
  const trimmed = uriOrSecret.trim()

  if (trimmed.startsWith('otpauth-migration://')) {
    const list = decodeGoogleMigration(trimmed)
    return list.length > 0 ? list[0] : null
  }

  if (trimmed.startsWith('otpauth://')) {
    try {
      const url = new URL(trimmed)
      const type = url.hostname.toLowerCase() === 'hotp' ? 'hotp' : 'totp'
      let label = decodeURIComponent(url.pathname.replace(/^\//, '')).replace(/[:\s]+$/, '')
      const secret = url.searchParams.get('secret') || ''
      let issuer = decodeURIComponent(url.searchParams.get('issuer') || '').trim()
      const period = parseInt(url.searchParams.get('period') || '30', 10)
      const digits = parseInt(url.searchParams.get('digits') || '6', 10)
      const algorithm = (url.searchParams.get('algorithm') || 'SHA1').toUpperCase()

      let account = label
      if (label.includes(':')) {
        const parts = label.split(':')
        if (!issuer) issuer = parts[0].trim()
        account = parts.slice(1).join(':').trim()
      }

      if (!secret) return null

      return {
        secret: secret.replace(/\s+/g, '').toUpperCase(),
        issuer,
        account,
        label,
        period: isNaN(period) || period <= 0 ? 30 : period,
        digits: isNaN(digits) || digits <= 0 ? 6 : digits,
        algorithm,
        type,
        rawUri: trimmed
      }
    } catch (e) {
      console.error('Failed to parse otpauth URI:', e)
    }
  }

  // Raw secret string
  const cleanSecret = trimmed.replace(/\s+/g, '').toUpperCase()
  if (/^[A-Z2-7]+=*$/.test(cleanSecret) && cleanSecret.length >= 8) {
    return {
      secret: cleanSecret,
      period: 30,
      digits: 6,
      algorithm: 'SHA1',
      type: 'totp',
      rawUri: `otpauth://totp/Item?secret=${cleanSecret}&period=30&digits=6`
    }
  }

  return null
}

/**
 * Extract field name from parsed OTP info, adhering to user rules:
 * 1. Prioritize issuer or identified issuer-like parameter.
 * 2. If no issuer/param, fallback to "2FA" + number.
 * 3. Deduplicate repeating names with "name 2", "name 3", etc.
 */
export function extractOtpFieldName(
  parsed: OtpParsedInfo | null,
  usedKeys: Set<string> | string[]
): string {
  const existing = usedKeys instanceof Set ? usedKeys : new Set(usedKeys)

  let candidate = ''
  if (parsed?.issuer && parsed.issuer.trim()) {
    candidate = parsed.issuer.trim()
  } else if (parsed?.label && parsed.label.trim()) {
    const cleanLabel = parsed.label.replace(/^[:\s]+|[:\s]+$/g, '').trim()
    if (cleanLabel) {
      if (cleanLabel.includes(':')) {
        const [prefix, ...rest] = cleanLabel.split(':')
        candidate = prefix.trim() || rest.join(':').trim() || cleanLabel
      } else {
        candidate = cleanLabel
      }
    }
  } else if (parsed?.account && parsed.account.trim()) {
    candidate = parsed.account.trim()
  }

  // If still empty, use fallback base "2FA"
  if (!candidate) {
    let index = 1
    while (existing.has(`2FA ${index}`) || existing.has(`2FA${index}`)) {
      index++
    }
    return `2FA ${index}`
  }

  // If candidate is not taken yet, return candidate directly
  if (!existing.has(candidate)) {
    return candidate
  }

  let index = 2
  while (existing.has(`${candidate} ${index}`)) {
    index++
  }
  return `${candidate} ${index}`
}

export interface BatchOtpItem {
  id: string
  key: string
  value: string
  protected: boolean
  parsed: OtpParsedInfo
  codePreview: string
  remainingSeconds: number
}

/**
 * Parse multi-line text into a list of 2FA items with deduplicated keys
 */
export function parseBatchOtpLines(
  text: string,
  existingKeys: string[] = []
): BatchOtpItem[] {
  if (!text || typeof text !== 'string') return []

  const usedKeys = new Set<string>(existingKeys)
  const results: BatchOtpItem[] = []
  let autoId = 1

  // Handle Google migration payload if passed as full URI
  if (text.trim().startsWith('otpauth-migration://')) {
    const migrationList = decodeGoogleMigration(text.trim())
    for (const item of migrationList) {
      const fieldKey = extractOtpFieldName(item, usedKeys)
      usedKeys.add(fieldKey)
      const totpRes = generateTotp(item.secret)
      results.push({
        id: `batch-${autoId++}`,
        key: fieldKey,
        value: item.rawUri || `otpauth://totp/${encodeURIComponent(item.label || fieldKey)}?secret=${item.secret}&period=30&digits=${item.digits || 6}`,
        protected: true,
        parsed: item,
        codePreview: totpRes?.formattedCode || '------',
        remainingSeconds: totpRes?.remainingSeconds || 30
      })
    }
    return results
  }

  const lines = text.split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue

    // If line is a Google migration URI
    if (line.startsWith('otpauth-migration://')) {
      const migrationList = decodeGoogleMigration(line)
      for (const item of migrationList) {
        const fieldKey = extractOtpFieldName(item, usedKeys)
        usedKeys.add(fieldKey)
        const totpRes = generateTotp(item.secret)
        results.push({
          id: `batch-${autoId++}`,
          key: fieldKey,
          value: item.rawUri || `otpauth://totp/${encodeURIComponent(item.label || fieldKey)}?secret=${item.secret}&period=30&digits=${item.digits || 6}`,
          protected: true,
          parsed: item,
          codePreview: totpRes?.formattedCode || '------',
          remainingSeconds: totpRes?.remainingSeconds || 30
        })
      }
      continue
    }

    const parsed = parseOtpUri(line)
    if (parsed && parsed.secret) {
      const fieldKey = extractOtpFieldName(parsed, usedKeys)
      usedKeys.add(fieldKey)
      const totpRes = generateTotp(parsed.secret)
      results.push({
        id: `batch-${autoId++}`,
        key: fieldKey,
        value: line,
        protected: true,
        parsed,
        codePreview: totpRes?.formattedCode || '------',
        remainingSeconds: totpRes?.remainingSeconds || 30
      })
    }
  }

  return results
}

/**
 * Generate 6 or 8-digit dynamic TOTP code and countdown info
 */
export function generateTotp(
  secretOrUri: string,
  nowMs = Date.now()
): TotpGenerationResult | null {
  const parsed = parseOtpUri(secretOrUri)
  if (!parsed || !parsed.secret) return null

  try {
    const key = base32Decode(parsed.secret)
    if (key.length === 0) return null

    const epochSeconds = Math.floor(nowMs / 1000)
    const period = parsed.period || 30
    const digits = parsed.digits || 6
    const counter = Math.floor(epochSeconds / period)

    const msg = new Uint8Array(8)
    let c = BigInt(counter)
    for (let i = 7; i >= 0; i--) {
      msg[i] = Number(c & 0xffn)
      c >>= 8n
    }

    const hmac = hmacSha1(key, msg)
    const offset = hmac[hmac.length - 1] & 0x0f
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)

    const code = (binary % Math.pow(10, digits)).toString().padStart(digits, '0')
    const remainingSeconds = period - (epochSeconds % period)
    const progress = Math.max(0, Math.min(100, (remainingSeconds / period) * 100))

    return {
      code,
      formattedCode: formatTotpCode(code),
      remainingSeconds,
      period,
      progress
    }
  } catch (e) {
    console.error('Failed to generate TOTP code:', e)
    return null
  }
}

/**
 * Format code with spaces (e.g. 123456 -> 123 456, 12345678 -> 1234 5678)
 */
export function formatTotpCode(code: string): string {
  if (!code) return ''
  if (code.length === 6) {
    return `${code.slice(0, 3)} ${code.slice(3)}`
  }
  if (code.length === 8) {
    return `${code.slice(0, 4)} ${code.slice(4)}`
  }
  return code
}

/**
 * Scan QR code from an HTMLCanvasElement
 */
export function scanQrFromCanvas(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const result = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'attemptBoth'
  })
  return result ? result.data : null
}

/**
 * Scan QR code from an HTMLImageElement
 */
export function scanQrFromImageElement(img: HTMLImageElement): string | null {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return scanQrFromCanvas(canvas)
}

/**
 * Scan QR code from an image File / Blob
 */
export async function scanQrFromBlob(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        resolve(scanQrFromImageElement(img))
      }
      img.onerror = () => resolve(null)
      img.src = reader.result as string
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(blob)
  })
}

/**
 * Scan QR code from a Data URL
 */
export async function scanQrFromDataUrl(dataUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      resolve(scanQrFromImageElement(img))
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

/**
 * Attempt to read an image from system clipboard and scan QR code
 */
export async function scanQrFromClipboard(): Promise<{ text: string | null; error?: string }> {
  try {
    if (!navigator.clipboard || !navigator.clipboard.read) {
      return { text: null, error: 'Clipboard API not supported' }
    }
    const items = await navigator.clipboard.read()
    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith('image/')) {
          const blob = await item.getType(type)
          const text = await scanQrFromBlob(blob)
          return { text }
        }
      }
    }
    return { text: null, error: 'No image found in clipboard' }
  } catch (e) {
    return { text: null, error: e instanceof Error ? e.message : String(e) }
  }
}
