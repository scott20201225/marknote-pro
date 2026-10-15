import { describe, it, expect } from 'vitest'
import { buildSearchRegex } from '../../../src/renderer/src/codeMirror/cmSearch'

describe('CodeMirror Search regex builder', () => {
  it('builds case insensitive regex by default', () => {
    const reg = buildSearchRegex('hello')
    expect(reg).not.toBeNull()
    expect(reg!.flags).toContain('i')
    expect(reg!.flags).toContain('g')
    expect(reg!.test('HELLO')).toBe(true)
    reg!.lastIndex = 0
    expect(reg!.test('hello')).toBe(true)
  })

  it('builds case sensitive regex when requested', () => {
    const reg = buildSearchRegex('Hello', { isCaseSensitive: true })
    expect(reg).not.toBeNull()
    expect(reg!.flags).toBe('g')
    expect(reg!.test('Hello')).toBe(true)
    expect(reg!.test('hello')).toBe(false)
  })

  it('builds whole word regex when requested', () => {
    const reg = buildSearchRegex('test', { isWholeWord: true })
    expect(reg).not.toBeNull()
    expect(reg!.test('test')).toBe(true)
    expect(reg!.test('atestb')).toBe(false)
    expect(reg!.test('a test b')).toBe(true)
  })

  it('handles regex pattern when isRegexp is true', () => {
    const reg = buildSearchRegex('\\d{3}-\\d{4}', { isRegexp: true })
    expect(reg).not.toBeNull()
    expect(reg!.test('123-4567')).toBe(true)
    expect(reg!.test('12-456')).toBe(false)
  })

  it('handles invalid regex pattern gracefully', () => {
    const reg = buildSearchRegex('([a-z', { isRegexp: true })
    expect(reg).toBeNull()
  })

  it('returns null for empty query', () => {
    expect(buildSearchRegex('')).toBeNull()
  })
})
