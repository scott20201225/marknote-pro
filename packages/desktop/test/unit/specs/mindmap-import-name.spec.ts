import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs-extra'
import os from 'os'
import { getAvailableImportFilePath, isPartitionDirectory } from '../../../src/main/mindmap'

describe('isPartitionDirectory', () => {
  it('returns true for directories starting with AREA_', () => {
    expect(isPartitionDirectory('/workspace/AREA_Notes')).toBe(true)
    expect(isPartitionDirectory('/workspace/GROUP_A/AREA_Sub')).toBe(true)
  })

  it('returns false for null, undefined, or empty path', () => {
    expect(isPartitionDirectory(null)).toBe(false)
    expect(isPartitionDirectory(undefined)).toBe(false)
    expect(isPartitionDirectory('')).toBe(false)
  })

  it('returns false for root or non-area directories like GROUP_', () => {
    expect(isPartitionDirectory('/workspace/GROUP_Math')).toBe(false)
    expect(isPartitionDirectory('/workspace')).toBe(false)
    expect(isPartitionDirectory('/workspace/Attachments')).toBe(false)
  })
})

describe('getAvailableImportFilePath', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'marknotepro-import-test-'))
  })

  afterEach(async () => {
    await fs.remove(tmpDir)
  })

  it('generates [name]-import.smm when no existing file', async () => {
    const sourceFile = '/path/to/思维导图.mind'
    const result = await getAvailableImportFilePath(tmpDir, sourceFile)
    expect(path.basename(result)).toBe('思维导图-import.smm')
  })

  it('generates [name]-import1.smm when [name]-import.smm exists', async () => {
    const sourceFile = '/path/to/思维导图.mind'
    await fs.writeFile(path.join(tmpDir, '思维导图-import.smm'), '{}')

    const result = await getAvailableImportFilePath(tmpDir, sourceFile)
    expect(path.basename(result)).toBe('思维导图-import1.smm')
  })

  it('generates [name]-import2.smm when [name]-import.smm and [name]-import1.smm exist', async () => {
    const sourceFile = '/path/to/思维导图.mind'
    await fs.writeFile(path.join(tmpDir, '思维导图-import.smm'), '{}')
    await fs.writeFile(path.join(tmpDir, '思维导图-import1.smm'), '{}')

    const result = await getAvailableImportFilePath(tmpDir, sourceFile)
    expect(path.basename(result)).toBe('思维导图-import2.smm')
  })

  it('works for other extensions like .xmind, .smm, .json, .md', async () => {
    const xmindFile = '/downloads/Architecture.xmind'
    const res1 = await getAvailableImportFilePath(tmpDir, xmindFile)
    expect(path.basename(res1)).toBe('Architecture-import.smm')

    await fs.writeFile(res1, '{}')
    const res2 = await getAvailableImportFilePath(tmpDir, xmindFile)
    expect(path.basename(res2)).toBe('Architecture-import1.smm')
  })
})
