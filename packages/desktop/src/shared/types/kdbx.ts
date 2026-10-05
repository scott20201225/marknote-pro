export interface KdbxField {
  key: string
  value: string
  protected: boolean
}

export interface KdbxAttachment {
  name: string
  size: number
}

export interface KdbxAttachmentInput {
  name: string
  data: ArrayBuffer
}

export interface KdbxAttachmentChanges {
  add?: KdbxAttachmentInput[]
  remove?: string[]
}

export interface KdbxGroupSummary {
  id: string
  name: string
  isRoot: boolean
  entries: number
  totalEntries: number
  groups: KdbxGroupSummary[]
}

export interface KdbxEntrySummary {
  id: string
  groupId: string
  title: string
  username: string
  url: string
  notes: string
  tags: string[]
  updatedAt: string | null
  groupPath: string[]
  isRecycleBin: boolean
}

export interface KdbxEntryHistoryItem {
  index: number
  title: string
  username: string
  updatedAt: string | null
}

export interface KdbxEntryDetail extends KdbxEntrySummary {
  notes: string
  fields: KdbxField[]
  attachments: KdbxAttachment[]
  historyCount: number
  history: KdbxEntryHistoryItem[]
}

export interface KdbxEntryRevision {
  title: string
  username: string
  url: string
  notes: string
  tags: string[]
  fields: KdbxField[]
  attachments: KdbxAttachment[]
  updatedAt: string | null
}

export interface KdbxVaultSnapshot {
  name: string
  groups: KdbxGroupSummary[]
  recycleBin: KdbxGroupSummary | null
  entries: KdbxEntrySummary[]
  tags: string[]
}

export interface KdbxEntryInput {
  groupId: string
  title: string
  username?: string
  url?: string
  notes?: string
  tags?: string[]
  fields?: KdbxField[]
  attachments?: KdbxAttachmentChanges
}
