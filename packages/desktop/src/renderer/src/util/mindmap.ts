import type { MindMapStructure } from '@shared/types/files'

export const MIND_MAP_STRUCTURES: ReadonlyArray<{
  value: MindMapStructure
  labelKey: string
}> = [
  { value: 'logicalStructure', labelKey: 'sideBar.tree.mindMapLogicalStructure' },
  { value: 'mindMap', labelKey: 'sideBar.tree.mindMapMindMap' },
  { value: 'organizationStructure', labelKey: 'sideBar.tree.mindMapOrganizationStructure' },
  { value: 'catalogOrganization', labelKey: 'sideBar.tree.mindMapCatalogOrganization' },
  { value: 'timeline', labelKey: 'sideBar.tree.mindMapTimeline' },
  { value: 'fishbone', labelKey: 'sideBar.tree.mindMapFishbone' }
]
