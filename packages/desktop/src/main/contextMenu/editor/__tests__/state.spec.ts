import { describe, expect, it } from 'vitest'
import { getCopyMenuAvailability } from '../state'

describe('getCopyMenuAvailability', () => {
  it('enables copy and cut for a frozen table rectangle even when Chromium exposes no native text selection', () => {
    const availability = getCopyMenuAvailability(
      {
        selectionText: '',
        editFlags: {
          canCut: false,
          canCopy: false
        }
      },
      {
        hasTableSelection: true
      }
    )

    expect(availability).toEqual({
      canCut: true,
      canCopy: true,
      canCopyAsRich: true,
      canCopyAsHtml: true
    })
  })

  it('preserves the native text-selection gating when there is no table rectangle', () => {
    const availability = getCopyMenuAvailability(
      {
        selectionText: 'hello',
        editFlags: {
          canCut: true,
          canCopy: true
        }
      },
      null
    )

    expect(availability).toEqual({
      canCut: true,
      canCopy: true,
      canCopyAsRich: true,
      canCopyAsHtml: true
    })
  })

  it('keeps cut and copy disabled when there is neither text nor a frozen table selection', () => {
    const availability = getCopyMenuAvailability(
      {
        selectionText: '',
        editFlags: {
          canCut: false,
          canCopy: false
        }
      },
      null
    )

    expect(availability.canCut).toBe(false)
    expect(availability.canCopy).toBe(false)
  })
})
