import zlib from 'zlib'

export interface ZipFileInput {
  name: string
  content: Buffer
}

/**
 * Creates a valid, uncorrupted standard PKZip Buffer in memory
 * using Node.js built-in zlib without any external dependencies.
 */
export function createZipBuffer(files: ZipFileInput[]): Buffer {
  const localHeaders: Buffer[] = []
  const centralHeaders: Buffer[] = []
  let offset = 0

  for (const file of files) {
    const nameBuf = Buffer.from(file.name.replace(/\\/g, '/'), 'utf8')
    const content = file.content
    const crc = zlib.crc32(content)
    const compressed = zlib.deflateRawSync(content)
    const uncompressedSize = content.length
    const compressedSize = compressed.length

    // Local File Header (30 bytes)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0) // Signature: PK\x03\x04
    lh.writeUInt16LE(20, 4) // Version needed to extract: 2.0
    lh.writeUInt16LE(0x0800, 6) // General purpose bit flag: UTF-8
    lh.writeUInt16LE(8, 8) // Compression method: Deflate
    lh.writeUInt16LE(0, 10) // File last mod time
    lh.writeUInt16LE(0, 12) // File last mod date
    lh.writeUInt32LE(crc, 14) // CRC-32
    lh.writeUInt32LE(compressedSize, 18) // Compressed size
    lh.writeUInt32LE(uncompressedSize, 22) // Uncompressed size
    lh.writeUInt16LE(nameBuf.length, 26) // File name length
    lh.writeUInt16LE(0, 28) // Extra field length

    const localChunk = Buffer.concat([lh, nameBuf, compressed])
    localHeaders.push(localChunk)

    // Central Directory Header (46 bytes)
    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0) // Signature: PK\x01\x02
    cd.writeUInt16LE(20, 4) // Version made by: 2.0
    cd.writeUInt16LE(20, 6) // Version needed: 2.0
    cd.writeUInt16LE(0x0800, 8) // Bit flag: UTF-8
    cd.writeUInt16LE(8, 10) // Compression: Deflate
    cd.writeUInt16LE(0, 12) // Mod time
    cd.writeUInt16LE(0, 14) // Mod date
    cd.writeUInt32LE(crc, 16) // CRC-32
    cd.writeUInt32LE(compressedSize, 20) // Compressed size
    cd.writeUInt32LE(uncompressedSize, 24) // Uncompressed size
    cd.writeUInt16LE(nameBuf.length, 28) // File name length
    cd.writeUInt16LE(0, 30) // Extra field length: 0
    cd.writeUInt16LE(0, 32) // Comment length: 0
    cd.writeUInt16LE(0, 34) // Disk number start: 0
    cd.writeUInt16LE(0, 36) // Internal file attributes: 0
    cd.writeUInt32LE(0, 38) // External file attributes: 0
    cd.writeUInt32LE(offset, 42) // Relative offset of local header

    const cdChunk = Buffer.concat([cd, nameBuf])
    centralHeaders.push(cdChunk)

    offset += localChunk.length
  }

  const centralDir = Buffer.concat(centralHeaders)
  const centralDirOffset = offset
  const centralDirSize = centralDir.length

  // End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0) // Signature: PK\x05\x06
  eocd.writeUInt16LE(0, 4) // Number of this disk
  eocd.writeUInt16LE(0, 6) // Disk where central directory starts
  eocd.writeUInt16LE(files.length, 8) // Number of central directory records on this disk
  eocd.writeUInt16LE(files.length, 10) // Total number of central directory records
  eocd.writeUInt32LE(centralDirSize, 12) // Size of central directory
  eocd.writeUInt32LE(centralDirOffset, 16) // Offset of start of central directory
  eocd.writeUInt16LE(0, 20) // Comment length

  return Buffer.concat([...localHeaders, centralDir, eocd])
}
