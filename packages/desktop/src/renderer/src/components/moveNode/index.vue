<template>
  <div class="move-node">
    <el-dialog
      v-model="showDialog"
      :modal="true"
      custom-class="ag-dialog-table"
      width="460px"
    >
      <template #header>
        <div class="dialog-title">
          {{ t('menu.file.moveTo') }}
        </div>
      </template>

      <div class="move-node-body">
        <el-tree
          v-if="targetTree.length"
          ref="treeRef"
          :data="targetTree"
          node-key="pathname"
          :expand-on-click-node="false"
          :highlight-current="true"
          default-expand-all
          @node-click="handleNodeClick"
        >
          <template #default="{ data }">
            <div
              class="move-node-row"
              :class="{ disabled: !data.selectable }"
            >
              <el-icon :size="14">
                <component :is="data.icon" />
              </el-icon>
              <span class="text-overflow">{{ data.label }}</span>
            </div>
          </template>
        </el-tree>

        <div
          v-else
          class="move-node-empty"
        >
          {{ t('sideBar.tree.moveDialogEmpty') }}
        </div>
      </div>

      <template #footer>
        <div class="move-node-footer">
          <el-button @click="projectStore.CLOSE_MOVE_DIALOG()">
            {{ t('common.cancel') }}
          </el-button>
          <el-button
            type="primary"
            :disabled="!selectedTargetPath"
            @click="confirmMove"
          >
            {{ t('common.ok') }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { ElTree } from 'element-plus'
import { CollectionTag, Folder } from '@element-plus/icons-vue'
import { useProjectStore } from '@/store/project'
import {
  NOTE_ATTACHMENTS_DIRECTORY,
  getNoteDisplayName,
  getNoteNodeKind,
  type NoteNodeKind
} from '@/util/noteWorkspace'
import type { TreeNode } from '@/components/sideBar/types'

type SourceKind = Extract<NoteNodeKind, 'group' | 'area' | 'document'>

interface MoveNodeOption {
  pathname: string
  label: string
  kind: 'root' | 'group' | 'area'
  selectable: boolean
  icon: Component
  children?: MoveNodeOption[]
}

const { t } = useI18n()
const projectStore = useProjectStore()
const { projectTree, moveDialogVisible, moveDialogSourcePath, moveDialogSourceKind } = storeToRefs(projectStore)

const treeRef = ref<InstanceType<typeof ElTree> | null>(null)
const selectedTargetPath = ref<string | null>(null)

const showDialog = computed({
  get: () => moveDialogVisible.value,
  set: (value: boolean) => {
    if (!value) {
      projectStore.CLOSE_MOVE_DIALOG()
    }
  }
})

const rootPath = computed<string | null>(() => projectTree.value?.pathname ?? null)

const isSameOrDescendantPath = (pathname: string, basePath: string): boolean => {
  return window.fileUtils.isSamePathSync(pathname, basePath) ||
    window.fileUtils.isChildOfDirectory(basePath, pathname)
}

const isHiddenNoteFolder = (node: TreeNode | null | undefined): boolean =>
  !!node?.isDirectory && node.name === NOTE_ATTACHMENTS_DIRECTORY

const buildMoveTree = (
  node: TreeNode | null | undefined,
  sourceKind: SourceKind,
  sourcePath: string
): MoveNodeOption[] => {
  if (!node?.folders?.length) return []

  const items: MoveNodeOption[] = []

  for (const child of node.folders) {
    const folder = child as TreeNode
    if (isHiddenNoteFolder(folder)) continue
    if (sourceKind === 'group' && isSameOrDescendantPath(folder.pathname, sourcePath)) continue

    const kind = getNoteNodeKind(folder, rootPath.value)
    const label = getNoteDisplayName(folder, rootPath.value)

    if (sourceKind === 'document') {
      if (kind === 'group') {
        const children = buildMoveTree(folder, sourceKind, sourcePath)
        if (children.length) {
          items.push({
            pathname: folder.pathname,
            label,
            kind: 'group',
            selectable: false,
            icon: Folder,
            children
          })
        }
      } else if (kind === 'area') {
        items.push({
          pathname: folder.pathname,
          label,
          kind: 'area',
          selectable: true,
          icon: CollectionTag
        })
      }
      continue
    }

    if (kind !== 'group') continue

    items.push({
      pathname: folder.pathname,
      label,
      kind: 'group',
      selectable: true,
      icon: Folder,
      children: buildMoveTree(folder, sourceKind, sourcePath)
    })
  }

  return items
}

const targetTree = computed<MoveNodeOption[]>(() => {
  if (!projectTree.value || !moveDialogSourceKind.value || !moveDialogSourcePath.value) return []

  if (moveDialogSourceKind.value === 'group') {
    return [
      {
        pathname: projectTree.value.pathname,
        label: getNoteDisplayName(projectTree.value, rootPath.value),
        kind: 'root',
        selectable: true,
        icon: Folder,
        children: buildMoveTree(projectTree.value, moveDialogSourceKind.value, moveDialogSourcePath.value)
      }
    ]
  }

  return buildMoveTree(projectTree.value, moveDialogSourceKind.value, moveDialogSourcePath.value)
})

const handleNodeClick = (data: MoveNodeOption): void => {
  if (!data.selectable) {
    treeRef.value?.setCurrentKey(selectedTargetPath.value ?? undefined)
    return
  }

  selectedTargetPath.value = data.pathname
}

const confirmMove = async(): Promise<void> => {
  if (!selectedTargetPath.value) return
  await projectStore.MOVE_ACTIVE_ITEM_TO(selectedTargetPath.value)
}

watch(showDialog, (visible) => {
  if (visible) {
    selectedTargetPath.value = null
    treeRef.value?.setCurrentKey(undefined)
  }
})
</script>

<style scoped>
.move-node-body {
  min-height: 220px;
  max-height: 420px;
  overflow: auto;
  padding-top: 4px;
  border: 1px solid var(--floatBorderColor);
  border-radius: 6px;
  background: var(--sideBarBgColor);
}

.move-node-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  color: var(--sideBarColor);
}

.move-node-row.disabled {
  color: var(--editorColor50);
}

.move-node-row :deep(svg) {
  color: var(--sideBarIconColor);
}

.move-node-row > span {
  min-width: 0;
}

.move-node-empty {
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--editorColor50);
  text-align: center;
}

.move-node-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.move-node :deep(.dialog-title) {
  color: var(--sideBarTitleColor);
}

.move-node :deep(.el-tree) {
  --el-fill-color-blank: transparent;
  --el-tree-node-hover-bg-color: var(--sideBarItemHoverBgColor);
  background: transparent;
  color: var(--sideBarColor);
}

.move-node :deep(.el-tree-node__content) {
  min-height: 38px;
  padding-right: 8px;
  border-radius: 4px;
}

.move-node :deep(.el-tree-node__content:hover) {
  background: var(--sideBarItemHoverBgColor);
}

.move-node :deep(.el-tree--highlight-current .el-tree-node.is-current > .el-tree-node__content) {
  background: var(--sideBarItemHoverBgColor);
  box-shadow: inset 0 0 0 1px var(--themeColor);
}

.move-node :deep(.el-tree-node:focus > .el-tree-node__content) {
  background: var(--sideBarItemHoverBgColor);
}

.move-node :deep(.el-tree-node__expand-icon) {
  color: var(--sideBarIconColor);
}

.move-node :deep(.el-tree-node__expand-icon.is-leaf) {
  color: transparent;
}
</style>
