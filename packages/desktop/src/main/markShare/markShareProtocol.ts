import crypto from 'crypto'
import path from 'path'

export const MARKSHARE_PROTOCOL_VERSION = '1.0'
export const MARKSHARE_CONFIRM_TTL_MS = 60_000
export const MARKSHARE_CHUNK_BYTES = 256 * 1024

export interface EncryptedEnvelope {
  iv: string
  tag: string
  ciphertext: string
}

export interface EphemeralKeyPair {
  publicKeyDerB64: string
  privateKey: crypto.KeyObject
}

export function generateEphemeralX25519KeyPair(): EphemeralKeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519')
  const pubDer = publicKey.export({ type: 'spki', format: 'der' }) as Buffer
  return {
    publicKeyDerB64: pubDer.toString('base64'),
    privateKey
  }
}

export function deriveSessionSecrets(params: {
  ownPrivateKey: crypto.KeyObject
  peerPublicKeyDerB64: string
  ownNonceB64: string
  peerNonceB64: string
  handshakeId: string
  isInitiator: boolean
}): { sessionKey: Buffer; sasCode: string } {
  const peerPubKey = crypto.createPublicKey({
    key: Buffer.from(params.peerPublicKeyDerB64, 'base64'),
    type: 'spki',
    format: 'der'
  })

  const sharedSecret = crypto.diffieHellman({
    privateKey: params.ownPrivateKey,
    publicKey: peerPubKey
  })

  const nonceA = Buffer.from(
    params.isInitiator ? params.ownNonceB64 : params.peerNonceB64,
    'base64'
  )
  const nonceB = Buffer.from(
    params.isInitiator ? params.peerNonceB64 : params.ownNonceB64,
    'base64'
  )
  const salt = crypto.createHash('sha256').update(nonceA).update(nonceB).digest()
  const info = Buffer.from(`markshare-v1:${params.handshakeId}`, 'utf8')

  const okm = Buffer.from(crypto.hkdfSync('sha256', sharedSecret, salt, info, 36))
  const sessionKey = okm.subarray(0, 32)
  const sasRaw = okm.readUInt32BE(32) % 10000
  const sasCode = String(sasRaw).padStart(4, '0')

  return { sessionKey, sasCode }
}

export function encryptBuffer(
  key: Buffer,
  plaintext: Buffer,
  aad?: string
): EncryptedEnvelope {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  if (aad) {
    cipher.setAAD(Buffer.from(aad, 'utf8'))
  }
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: encrypted.toString('base64')
  }
}

export function decryptBuffer(
  key: Buffer,
  envelope: EncryptedEnvelope,
  aad?: string
): Buffer {
  const iv = Buffer.from(envelope.iv, 'base64')
  const tag = Buffer.from(envelope.tag, 'base64')
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  if (aad) {
    decipher.setAAD(Buffer.from(aad, 'utf8'))
  }
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

export function encryptJson<T>(key: Buffer, payload: T, aad?: string): EncryptedEnvelope {
  return encryptBuffer(key, Buffer.from(JSON.stringify(payload), 'utf8'), aad)
}

export function decryptJson<T>(key: Buffer, envelope: EncryptedEnvelope, aad?: string): T {
  const buf = decryptBuffer(key, envelope, aad)
  return JSON.parse(buf.toString('utf8')) as T
}

export function encryptBinaryFrame(
  key: Buffer,
  plaintext: Buffer,
  aad: string
): Buffer {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  const header = Buffer.allocUnsafe(4 + 12 + 16)
  header.writeUInt32BE(encrypted.length, 0)
  iv.copy(header, 4)
  tag.copy(header, 16)
  return Buffer.concat([header, encrypted])
}

export function decryptBinaryFrame(
  key: Buffer,
  iv: Buffer,
  tag: Buffer,
  ciphertext: Buffer,
  aad: string
): Buffer {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

export function computeAuthMac(key: Buffer, context: string): string {
  return crypto.createHmac('sha256', key).update(context).digest('hex')
}

export function safeEqualHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}

/**
 * Strictly sanitize a relative POSIX path from a remote peer and resolve it inside baseDir.
 * Prevents path traversal (`..`), absolute paths, drive letters, and null bytes.
 */
export function resolveSafeRelativePath(baseDir: string, relativePath: string): string {
  if (!relativePath || relativePath.includes('\0')) {
    throw new Error('Invalid empty or null-byte relative path')
  }
  const normalizedPosix = relativePath.replace(/\\/g, '/')
  if (normalizedPosix.startsWith('/') || /^[a-zA-Z]:/.test(normalizedPosix)) {
    throw new Error(`Absolute path is not allowed: ${relativePath}`)
  }

  const segments = normalizedPosix.split('/').filter((seg) => seg.length > 0 && seg !== '.')
  if (segments.length === 0 || segments.some((seg) => seg === '..')) {
    throw new Error(`Path traversal rejected: ${relativePath}`)
  }

  const resolvedBase = path.resolve(baseDir)
  const resolvedTarget = path.resolve(resolvedBase, ...segments)
  const relCheck = path.relative(resolvedBase, resolvedTarget)
  if (!relCheck || relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
    throw new Error(`Resolved path escapes target directory: ${relativePath}`)
  }
  return resolvedTarget
}
