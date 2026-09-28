import type { GeoGebraMode } from '@shared/types/files'

export const GEO_GEBRA_MODES: ReadonlyArray<{
  value: GeoGebraMode
  labelKey: string
}> = [
  { value: 'graphing', labelKey: 'sideBar.tree.geoGebraGraphing' },
  { value: '3d', labelKey: 'sideBar.tree.geoGebra3d' },
  { value: 'geometry', labelKey: 'sideBar.tree.geoGebraGeometry' },
  { value: 'cas', labelKey: 'sideBar.tree.geoGebraCas' },
  { value: 'probability', labelKey: 'sideBar.tree.geoGebraProbability' },
  { value: 'scientific', labelKey: 'sideBar.tree.geoGebraScientific' }
]
