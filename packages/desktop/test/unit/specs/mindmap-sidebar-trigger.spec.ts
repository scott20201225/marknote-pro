import { describe, it, expect } from 'vitest'

function getSidebarTriggerRight(hasActive: boolean, show: boolean): string {
  if (hasActive) {
    return show ? '305px' : '222px'
  }
  return show ? '0' : '-78px'
}

describe('MindMap SidebarTrigger Position Logic', () => {
  it('returns right: 0 when expanded with no active sidebar menu', () => {
    expect(getSidebarTriggerRight(false, true)).toBe('0')
  })

  it('returns right: -78px when collapsed with no active sidebar menu', () => {
    expect(getSidebarTriggerRight(false, false)).toBe('-78px')
  })

  it('returns right: 305px when expanded with an active sidebar menu', () => {
    expect(getSidebarTriggerRight(true, true)).toBe('305px')
  })

  it('returns right: 222px when collapsed with an active sidebar menu (tucked behind 300px sidebar, handle sticks out 26px)', () => {
    expect(getSidebarTriggerRight(true, false)).toBe('222px')
  })
})
