import { describe, expect, it } from 'vitest'
import { isKdbxPasswordValid, KDBX_SPECIAL_CHARS } from '../../../src/shared/kdbxPassword'
import { formatKdbxCountdown } from '../../../src/renderer/src/store/editor'

describe('KDBX Password Complexity with Special Characters', () => {
  it('requires uppercase, lowercase, digit, and supported special character', () => {
    // Valid password with each of the supported special characters (length 8-16)
    for (const char of KDBX_SPECIAL_CHARS) {
      const pwd = `Aa1${char}5678`
      expect(isKdbxPasswordValid(pwd)).toBe(true)
    }

    // Length 8 minimum boundary
    expect(isKdbxPasswordValid('Aa1!5678')).toBe(true)
    // Length 16 maximum boundary
    expect(isKdbxPasswordValid('Aa1!567890123456')).toBe(true)

    // Length < 8 fails
    expect(isKdbxPasswordValid('Aa1!567')).toBe(false)
    // Length > 16 fails
    expect(isKdbxPasswordValid('Aa1!5678901234567')).toBe(false)

    // Missing special character
    expect(isKdbxPasswordValid('Aa123456')).toBe(false)
    // Missing uppercase
    expect(isKdbxPasswordValid('aa1!3456')).toBe(false)
    // Missing lowercase
    expect(isKdbxPasswordValid('AA1!3456')).toBe(false)
    // Missing number
    expect(isKdbxPasswordValid('Aaa!bcde')).toBe(false)

    // Unsupported special character (e.g. space, emoji)
    expect(isKdbxPasswordValid('Aa1 5678')).toBe(false)
    expect(isKdbxPasswordValid('Aa1😀5678')).toBe(false)
  })
})

describe('KDBX Countdown Formatter', () => {
  it('formats remaining seconds to (mm:ss)', () => {
    expect(formatKdbxCountdown(295)).toBe('(4:55)')
    expect(formatKdbxCountdown(595)).toBe('(9:55)')
    expect(formatKdbxCountdown(600)).toBe('(10:00)')
    expect(formatKdbxCountdown(59)).toBe('(0:59)')
    expect(formatKdbxCountdown(5)).toBe('(0:05)')
    expect(formatKdbxCountdown(0)).toBe('(0:00)')
  })
})
