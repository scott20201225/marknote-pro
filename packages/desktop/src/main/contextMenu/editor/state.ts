export interface ContextMenuEditFlags {
  canCut: boolean
  canCopy: boolean
}

export interface EditorContextState {
  hasTableSelection?: boolean
}

export interface CopyMenuAvailability {
  canCut: boolean
  canCopy: boolean
  canCopyAsRich: boolean
  canCopyAsHtml: boolean
}

interface CopyMenuAvailabilityParams {
  selectionText: string
  editFlags: ContextMenuEditFlags
}

const hasSelectedText = (selectionText: string): boolean => selectionText.trim().length > 0

export const getCopyMenuAvailability = (
  { selectionText, editFlags }: CopyMenuAvailabilityParams,
  editorContextState: EditorContextState | null = null
): CopyMenuAvailability => {
  const hasText = hasSelectedText(selectionText)
  const hasTableSelection = editorContextState?.hasTableSelection === true
  const canCopy = (hasText && editFlags.canCopy) || hasTableSelection
  const canCut = (hasText && editFlags.canCut && editFlags.canCopy) || hasTableSelection

  return {
    canCut,
    canCopy,
    canCopyAsRich: canCopy,
    canCopyAsHtml: canCopy
  }
}
