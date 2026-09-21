import { describe, expect, it } from 'vitest'
import { computeHeadingNumbers } from '../../../src/renderer/src/util/titleNumbering'

describe('computeHeadingNumbers', () => {
  it('starts below the document title by default', () => {
    expect(computeHeadingNumbers([2, 2, 3, 3, 2])).toEqual(['', '', '1.', '2.', ''])
  })

  it('numbers the highest-level heading when explicitly enabled', () => {
    expect(computeHeadingNumbers([2, 2, 3, 3, 2], { includeTopLevel: true })).toEqual([
      '1.',
      '2.',
      '2.1',
      '2.2',
      '3.'
    ])
  })

  it('uses a later higher-level heading as the root level', () => {
    expect(computeHeadingNumbers([3, 2], { includeTopLevel: true })).toEqual(['1.1', '2.'])
  })

  it('fills missing parent levels with one', () => {
    expect(computeHeadingNumbers([1, 3, 4])).toEqual(['', '1.1', '1.1.1'])
  })

  it('keeps non-heading entries empty', () => {
    expect(computeHeadingNumbers([null, 2, null, 3], { includeTopLevel: true })).toEqual([
      '',
      '1.',
      '',
      '1.1'
    ])
  })
})
