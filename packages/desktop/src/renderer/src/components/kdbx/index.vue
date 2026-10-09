<template>
  <section class="kdbx-surface" @click="groupMenu = null; entryMenu = null">
    <form v-if="locked" class="kdbx-unlock" @submit.prevent="unlock">
      <div class="kdbx-unlock-panel">
        <h2>{{ displayFilename }}</h2><p>{{ t('kdbx.enterPassword') }}</p>
        <div class="kdbx-unlock-input"><el-input v-model="password" :type="unlockPasswordVisible ? 'text' : 'password'" autofocus autocomplete="current-password"><template #suffix><el-tooltip :content="unlockPasswordVisible ? t('kdbx.hidePassword') : t('kdbx.showPassword')" :show-after="350"><button class="kdbx-unlock-action" :title="unlockPasswordVisible ? t('kdbx.hidePassword') : t('kdbx.showPassword')" type="button" @mousedown.prevent @click="unlockPasswordVisible = !unlockPasswordVisible"><el-icon><Hide v-if="unlockPasswordVisible" /><View v-else /></el-icon></button></el-tooltip><el-tooltip :content="t('kdbx.unlock')" :show-after="350"><button class="kdbx-unlock-action" :title="t('kdbx.unlock')" type="submit" :disabled="unlocking || !password"><el-icon v-if="unlocking" class="is-loading"><Loading /></el-icon><span v-else class="kdbx-return-icon">&#8629;</span></button></el-tooltip></template></el-input></div>
        <p v-if="error" class="kdbx-error">{{ error }}</p>
      </div>
    </form>

    <template v-else>
      <aside class="kdbx-groups">
        <div class="kdbx-pane-title kdbx-vault-title"><span :title="vaultDisplayName">{{ vaultDisplayName }}</span><div>
          <el-tooltip :content="t('kdbx.newGroup')" :show-after="350"><button :title="t('kdbx.newGroup')" type="button" @click.stop="createGroup()"><el-icon><FolderAdd /></el-icon></button></el-tooltip>
          <el-tooltip :content="t('kdbx.resetPassword')" :show-after="350"><button :title="t('kdbx.resetPassword')" type="button" @click.stop="openResetPassword"><el-icon><Key /></el-icon></button></el-tooltip>
          <el-tooltip :content="t('kdbx.lock')" :show-after="350"><button :title="t('kdbx.lock')" type="button" @click.stop="lock"><el-icon><Lock /></el-icon></button></el-tooltip>
        </div></div>
        <div class="kdbx-tree">
          <div class="kdbx-all-root">
            <button class="kdbx-all-toggle" type="button" :title="allItemsExpanded ? t('kdbx.collapse') : t('kdbx.expand')" @click.stop="toggleAllItems"><el-icon><ArrowDown v-if="allItemsExpanded" /><ArrowRight v-else /></el-icon></button>
            <button class="kdbx-nav-item" :class="{ active: selectedGroup === '' && !selectedRecycle && !selectedTag && !selectedUntagged }" :title="t('kdbx.allTags')" type="button" @click="selectAll"><el-icon><Tickets /></el-icon><span>{{ t('kdbx.allTags') }}</span><em>{{ normalEntries.length }}</em></button>
          </div>
          <div v-if="allItemsExpanded" class="kdbx-all-children">
            <div class="kdbx-tags">
              <button class="kdbx-nav-item kdbx-tag" :class="{ active: selectedUntagged }" :title="t('kdbx.untagged')" type="button" @click="selectUntagged"><el-icon><PriceTag /></el-icon><span>{{ t('kdbx.untagged') }}</span><em>{{ untaggedEntryCount }}</em></button>
              <button v-for="tag in availableTags" :key="tag" class="kdbx-nav-item kdbx-tag" :class="{ active: selectedTag === tag }" :title="tag" type="button" @click="selectTag(tag)"><el-icon><PriceTag /></el-icon><span>{{ tag }}</span><em>{{ tagEntryCount(tag) }}</em></button>
            </div>
          </div>
          <div v-for="group in visibleGroups" :key="group.id" class="kdbx-tree-row" :class="{ active: selectedGroup === group.id && !selectedRecycle }" :style="{ paddingLeft: `${8 + group.depth * 16}px` }" @contextmenu.prevent.stop="openGroupMenu(group, $event)">
            <button class="kdbx-tree-toggle" type="button" :title="expandedGroups.has(group.id) ? t('kdbx.collapse') : t('kdbx.expand')" @click.stop="toggleGroup(group.id)"><el-icon v-if="group.groups.length"><ArrowDown v-if="expandedGroups.has(group.id)" /><ArrowRight v-else /></el-icon></button>
            <button class="kdbx-tree-label" :title="groupDisplayName(group)" type="button" @click="selectGroup(group.id)"><el-icon><Folder /></el-icon><span>{{ groupDisplayName(group) }}</span><em>{{ group.entries }} / {{ group.totalEntries }}</em></button>
            <button class="kdbx-more" :title="t('kdbx.groupActions')" type="button" @click.stop="openGroupMenu(group, $event)"><el-icon><MoreFilled /></el-icon></button>
          </div>
        </div>
        <div class="kdbx-recycle"><button class="kdbx-nav-item" :class="{ active: selectedRecycle }" :title="t('kdbx.recycleBin')" type="button" @click="selectRecycle"><el-icon><DeleteFilled /></el-icon><span>{{ t('kdbx.recycleBin') }}</span><em>{{ recycleEntries.length }}</em></button><button v-if="recycleEntries.length" class="kdbx-more" :title="t('kdbx.emptyRecycleBin')" type="button" @click.stop="emptyRecycleBin"><el-icon><Delete /></el-icon></button></div>
      </aside>

      <main class="kdbx-entries">
        <div class="kdbx-toolbar"><el-input v-model="query" :placeholder="t('kdbx.search')" clearable><template #prefix><el-icon><Search /></el-icon></template></el-input><el-tooltip :content="t('kdbx.searchOptions')" :show-after="350"><button :title="t('kdbx.searchOptions')" :class="{ active: showSearchOptions }" type="button" @click.stop="showSearchOptions = !showSearchOptions"><el-icon><Filter /></el-icon></button></el-tooltip><el-tooltip :content="selectedRecycle ? t('kdbx.restoreHistory') : t('kdbx.exportSelected', { count: selectedEntryIds.size })" :show-after="350"><button class="kdbx-export-selected" :title="selectedRecycle ? t('kdbx.restoreHistory') : t('kdbx.exportSelected', { count: selectedEntryIds.size })" :disabled="selectedEntryIds.size === 0 || exportingEntries" type="button" @click.stop="selectedRecycle ? restoreSelectedEntries() : exportSelectedEntries()"><el-icon :class="{ 'is-loading': exportingEntries }"><Loading v-if="exportingEntries" /><RefreshRight v-else-if="selectedRecycle" /><Download v-else /></el-icon><sup v-if="selectedEntryIds.size">{{ selectedEntryIds.size }}</sup></button></el-tooltip><el-tooltip v-if="!selectedRecycle" :content="t('kdbx.moveTo')" :show-after="350"><button :title="t('kdbx.moveTo')" :disabled="selectedEntryIds.size === 0" type="button" @click.stop="openEntryMove([...selectedEntryIds])"><el-icon><FolderOpened /></el-icon></button></el-tooltip><el-tooltip v-if="!selectedRecycle" :content="t('kdbx.newEntry')" :show-after="350"><button :title="t('kdbx.newEntry')" type="button" @click="createEntry"><el-icon><Plus /></el-icon></button></el-tooltip></div>
        <div v-if="showSearchOptions" class="kdbx-search-options"><span>{{ t('kdbx.searchFields') }}</span><el-checkbox-group v-model="searchFields"><el-checkbox value="title">{{ t('kdbx.title') }}</el-checkbox><el-checkbox value="username">{{ t('kdbx.username') }}</el-checkbox><el-checkbox value="url">{{ t('kdbx.url') }}</el-checkbox><el-checkbox value="notes">{{ t('kdbx.notes') }}</el-checkbox></el-checkbox-group></div>
        <div v-for="entry in filteredEntries" :key="entry.id" class="kdbx-entry-row" :class="{ active: selectedEntryId === entry.id }" @contextmenu.prevent.stop="openEntryMenu(entry, $event)">
          <el-checkbox :model-value="selectedEntryIds.has(entry.id)" :aria-label="t('kdbx.selectEntry')" @click.stop @change="toggleEntrySelection(entry.id)" />
          <button class="kdbx-entry-select" :title="entry.title || t('kdbx.untitled')" type="button" @click="selectEntry(entry.id)">
            <span class="kdbx-entry-title">
              <span v-if="getEntryUrlType(entry)" class="kdbx-proto-badge" :class="`proto-${getEntryUrlType(entry)?.toLowerCase()}`">{{ getEntryUrlTypeBadge(entry) }}</span>
              {{ entry.title || t('kdbx.untitled') }}
            </span>
            <span class="kdbx-entry-username">{{ entry.username || (getEntryUrlType(entry) ? entry.url || t('kdbx.noUsername') : t('kdbx.noUsername')) }}</span>
          </button>
          <div class="kdbx-entry-actions">
            <el-tooltip v-if="getEntryUrlType(entry)" :content="t('kdbx.connectTerminal')" :show-after="350">
              <button class="kdbx-entry-terminal-btn" :title="t('kdbx.connectTerminal')" type="button" @click.stop="connectTerminalFromEntry(entry)">
                <el-icon><Monitor /></el-icon>
              </button>
            </el-tooltip>
            <el-tooltip :content="t('kdbx.entryActions')" :show-after="350">
              <button class="kdbx-entry-more" :title="t('kdbx.entryActions')" type="button" @click.stop="openEntryMenu(entry, $event)">
                <el-icon><MoreFilled /></el-icon>
              </button>
            </el-tooltip>
          </div>
        </div>
        <div v-if="filteredEntries.length === 0" class="kdbx-empty">{{ t('kdbx.noEntries') }}</div>
      </main>

      <aside class="kdbx-detail">
        <template v-if="draft">
          <div class="kdbx-detail-title">
            <div class="kdbx-breadcrumb" :title="entryPath">
              <span v-for="(part, index) in entryPathParts" :key="`${part}-${index}`">{{ part }}</span>
            </div>
            <div>
              <template v-if="draft.isRecycleBin">
                <el-tooltip :content="t('kdbx.restoreHistory')" :show-after="350"><button :title="t('kdbx.restoreHistory')" type="button" @click="restoreEntry"><el-icon><RefreshRight /></el-icon></button></el-tooltip>
                <el-tooltip :content="t('kdbx.deletePermanently')" :show-after="350"><button :title="t('kdbx.deletePermanently')" type="button" @click="deleteEntry"><el-icon><Delete /></el-icon></button></el-tooltip>
              </template>
              <template v-else>
                <el-tooltip v-if="getEntryUrlType(draft)" :content="t('kdbx.connectTerminal')" :show-after="350">
                  <button class="kdbx-terminal-direct-btn" :title="t('kdbx.connectTerminal')" type="button" @click.stop="connectTerminalFromDraft">
                    <el-icon><Monitor /></el-icon>
                  </button>
                </el-tooltip>
                <el-tooltip :content="t('kdbx.edit')" :show-after="350"><button :title="t('kdbx.edit')" type="button" @click.stop="beginEdit"><el-icon><Edit /></el-icon></button></el-tooltip>
                <el-tooltip :content="t('kdbx.copy')" :show-after="350"><button :title="t('kdbx.copy')" type="button" @click.stop="copyEntry"><el-icon><DocumentCopy /></el-icon></button></el-tooltip>
                <el-tooltip :content="t('kdbx.export')" :show-after="350"><button :title="t('kdbx.export')" :disabled="exportingEntries" type="button" @click.stop="exportEntries([draft.id])"><el-icon><Download /></el-icon></button></el-tooltip>
                <el-tooltip :content="t('kdbx.moveTo')" :show-after="350"><button :title="t('kdbx.moveTo')" type="button" @click.stop="openEntryMove([draft.id])"><el-icon><FolderOpened /></el-icon></button></el-tooltip>
                <el-tooltip :content="t('kdbx.delete')" :show-after="350"><button :title="t('kdbx.delete')" type="button" @click="deleteEntry"><el-icon><Delete /></el-icon></button></el-tooltip>
              </template>
            </div>
          </div>
          <dl class="kdbx-entry-view">
            <dt>{{ t('kdbx.title') }}</dt><dd>{{ draft.title || t('kdbx.untitled') }}</dd>
            <template v-if="getEntryUrlType(draft)">
              <dt>{{ t('kdbx.entryType') }}</dt>
              <dd>
                <span class="kdbx-proto-badge" :class="`proto-${getEntryUrlType(draft)?.toLowerCase()}`">{{ getEntryUrlTypeBadge(draft) }}</span>
              </dd>
            </template>
            <dt>{{ t('kdbx.username') }}</dt><dd>{{ draft.username || '-' }}</dd>
            <dt>{{ t('kdbx.password') }}</dt><dd class="kdbx-password-view"><span>{{ showPassword ? viewPassword || '-' : viewPassword ? '••••••••' : '-' }}</span><el-tooltip v-if="viewPassword && !draft.isRecycleBin" :content="showPassword ? t('kdbx.hidePassword') : t('kdbx.showPassword')" :show-after="350"><button :title="showPassword ? t('kdbx.hidePassword') : t('kdbx.showPassword')" type="button" @click="showPassword = !showPassword"><el-icon><Hide v-if="showPassword" /><View v-else /></el-icon></button></el-tooltip><el-tooltip v-if="viewPassword && !draft.isRecycleBin" :content="t('kdbx.copy')" :show-after="350"><button :title="t('kdbx.copy')" type="button" @click="copyText(viewPassword)"><el-icon><DocumentCopy /></el-icon></button></el-tooltip></dd>
            <template v-if="viewTotpList.length === 1">
              <dt>{{ viewTotpList[0].label || t('kdbx.totp') }}</dt>
              <dd class="kdbx-totp-view">
                <span class="kdbx-totp-code">{{ viewTotpList[0].result.formattedCode }}</span>
                <div class="kdbx-totp-timer" :title="`${viewTotpList[0].result.remainingSeconds}s`">
                  <svg class="kdbx-totp-circle" viewBox="0 0 36 36">
                    <path class="kdbx-totp-circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <path class="kdbx-totp-circle-progress" :stroke-dasharray="`${viewTotpList[0].result.progress}, 100`" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  </svg>
                  <span class="kdbx-totp-seconds">{{ viewTotpList[0].result.remainingSeconds }}s</span>
                </div>
                <el-tooltip v-if="!draft.isRecycleBin" :content="t('kdbx.copyTotp')" :show-after="350">
                  <button class="kdbx-totp-copy-btn" :title="t('kdbx.copyTotp')" type="button" @click="copyTotpItem(viewTotpList[0])">
                    <el-icon><DocumentCopy /></el-icon>
                  </button>
                </el-tooltip>
              </dd>
            </template>
            <dt>{{ t('kdbx.url') }}</dt><dd>{{ draft.url || '-' }}</dd>
            <dt>{{ t('kdbx.tags') }}</dt><dd><span v-for="tag in draft.tags" :key="tag" class="kdbx-tag-chip">{{ tag }}</span><span v-if="!draft.tags.length">-</span></dd>
            <dt>{{ t('kdbx.notes') }}</dt><dd>{{ draft.notes || '-' }}</dd>
          </dl>
          <section v-if="viewTotpList.length > 1" class="kdbx-section kdbx-totp-section">
            <div class="kdbx-section-title">
              <strong>{{ t('kdbx.totpAuthCodes') }} ({{ viewTotpList.length }})</strong>
              <div v-if="viewTotpList.length > 4" class="kdbx-totp-filter">
                <el-input v-model="totpFilterQuery" size="small" :placeholder="t('kdbx.filterTotp')" clearable>
                  <template #prefix><el-icon><Search /></el-icon></template>
                </el-input>
              </div>
            </div>
            <div class="kdbx-totp-grid">
              <div v-for="item in filteredTotpList" :key="item.id" class="kdbx-totp-card">
                <div class="kdbx-totp-card-header">
                  <span class="kdbx-totp-card-name" :title="item.label">{{ item.label }}</span>
                  <div class="kdbx-totp-timer" :title="`${item.result.remainingSeconds}s`">
                    <svg class="kdbx-totp-circle" viewBox="0 0 36 36">
                      <path class="kdbx-totp-circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      <path class="kdbx-totp-circle-progress" :stroke-dasharray="`${item.result.progress}, 100`" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    </svg>
                    <span class="kdbx-totp-seconds">{{ item.result.remainingSeconds }}s</span>
                  </div>
                </div>
                <div class="kdbx-totp-card-body">
                  <span class="kdbx-totp-card-code">{{ item.result.formattedCode }}</span>
                  <el-tooltip v-if="!draft.isRecycleBin" :content="t('kdbx.copyTotp')" :show-after="350">
                    <button class="kdbx-totp-copy-btn" :title="t('kdbx.copyTotp')" type="button" @click="copyTotpItem(item)">
                      <el-icon><DocumentCopy /></el-icon>
                    </button>
                  </el-tooltip>
                </div>
              </div>
            </div>
          </section>
          <section v-if="viewCustomFields.length" class="kdbx-section"><div class="kdbx-section-title"><strong>{{ t('kdbx.customFields') }}</strong></div><dl class="kdbx-entry-view kdbx-custom-field-view"><template v-for="field in viewCustomFields" :key="field.key"><dt>{{ field.key }}</dt><dd class="kdbx-custom-field-val"><span class="kdbx-custom-field-text">{{ (isCustomFieldRevealed(field.key) || !field.protected) ? (field.value || '-') : (field.value ? '••••••••' : '-') }}</span><div v-if="!draft.isRecycleBin" class="kdbx-custom-field-actions"><el-tooltip v-if="field.protected && field.value" :content="isCustomFieldRevealed(field.key) ? t('kdbx.hidePassword') : t('kdbx.showPassword')" :show-after="350"><button :title="isCustomFieldRevealed(field.key) ? t('kdbx.hidePassword') : t('kdbx.showPassword')" type="button" @click="toggleCustomFieldReveal(field.key)"><el-icon><Hide v-if="isCustomFieldRevealed(field.key)" /><View v-else /></el-icon></button></el-tooltip><el-tooltip v-if="field.value" :content="t('kdbx.copy')" :show-after="350"><button :title="t('kdbx.copy')" type="button" @click="copyText(field.value)"><el-icon><DocumentCopy /></el-icon></button></el-tooltip></div></dd></template></dl></section>
          <section class="kdbx-section"><div class="kdbx-section-title"><strong>{{ t('kdbx.attachments') }}</strong></div><div v-if="viewAttachments.length === 0" class="kdbx-section-empty">{{ t('kdbx.noAttachments') }}</div><div v-for="attachment in viewAttachments" :key="attachment.id" class="kdbx-attachment"><div><el-icon><Document /></el-icon><span>{{ attachment.name }}</span><em>{{ formatSize(attachment.size) }}</em></div><template v-if="!draft.isRecycleBin"><el-tooltip v-if="isPreviewable(attachment)" :content="t('kdbx.previewAttachment')" :show-after="350"><button :title="t('kdbx.previewAttachment')" type="button" @click="previewAttachment(attachment)"><el-icon><View /></el-icon></button></el-tooltip><el-tooltip :content="t('kdbx.downloadAttachment')" :show-after="350"><button :title="t('kdbx.downloadAttachment')" type="button" @click="downloadAttachment(attachment)"><el-icon><Download /></el-icon></button></el-tooltip></template></div></section>
          <section v-if="draft.historyCount" class="kdbx-section kdbx-history"><div class="kdbx-section-title"><strong>{{ t('kdbx.history') }} ({{ draft.historyCount }})</strong></div><div v-for="item in draft.history" :key="item.index" class="kdbx-history-row"><div><strong>{{ item.title || t('kdbx.untitled') }}</strong><span>{{ item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '' }}</span></div><button type="button" @click="viewHistory(item.index)">{{ t('kdbx.viewHistory') }}</button><button type="button" @click="restoreHistory(item.index)">{{ t('kdbx.restoreHistory') }}</button><button class="kdbx-history-delete" :title="t('kdbx.deleteHistory')" type="button" @click="deleteHistory(item.index)"><el-icon><Delete /></el-icon></button></div></section>
        </template>
        <div v-else class="kdbx-empty">{{ t('kdbx.selectEntry') }}</div>
      </aside>
    </template>

    <div v-if="groupMenu" class="kdbx-group-menu" :style="{ left: `${groupMenu.x}px`, top: `${groupMenu.y}px` }" @click.stop><button type="button" @click="createGroup(groupMenu.group.id)"><el-icon><FolderAdd /></el-icon>{{ t('kdbx.newGroup') }}</button><button type="button" @click="importEntries(groupMenu.group.id)"><el-icon><Upload /></el-icon>{{ t('kdbx.import') }}</button><template v-if="!groupMenu.group.isRoot"><button type="button" @click="openGroupMove(groupMenu.group)"><el-icon><FolderOpened /></el-icon>{{ t('kdbx.moveTo') }}</button><button type="button" @click="renameGroup(groupMenu.group)"><el-icon><Edit /></el-icon>{{ t('kdbx.renameGroup') }}</button><button type="button" @click="deleteGroup(groupMenu.group)"><el-icon><Delete /></el-icon>{{ t('kdbx.delete') }}</button></template></div>
    <div v-if="entryMenu" class="kdbx-group-menu kdbx-entry-menu" :style="{ left: `${entryMenu.x}px`, top: `${entryMenu.y}px` }" @click.stop>
      <template v-if="entryMenu.entry.isRecycleBin">
        <button type="button" @click="runEntryMenuAction('restore')"><el-icon><RefreshRight /></el-icon>{{ t('kdbx.restoreHistory') }}</button>
        <button type="button" @click="runEntryMenuAction('delete')"><el-icon><Delete /></el-icon>{{ t('kdbx.deletePermanently') }}</button>
      </template>
      <template v-else>
        <button v-if="getEntryUrlType(entryMenu.entry)" type="button" @click="runEntryMenuAction('connect-terminal')"><el-icon><Monitor /></el-icon>{{ t('kdbx.connectTerminal') }}</button>
        <button type="button" @click="runEntryMenuAction('edit')"><el-icon><Edit /></el-icon>{{ t('kdbx.edit') }}</button>
        <button type="button" @click="runEntryMenuAction('copy')"><el-icon><DocumentCopy /></el-icon>{{ t('kdbx.copy') }}</button>
        <button type="button" @click="runEntryMenuAction('export')"><el-icon><Download /></el-icon>{{ t('kdbx.export') }}</button>
        <button type="button" @click="runEntryMenuAction('move')"><el-icon><FolderOpened /></el-icon>{{ t('kdbx.moveTo') }}</button>
        <button type="button" @click="runEntryMenuAction('delete')"><el-icon><Delete /></el-icon>{{ t('kdbx.delete') }}</button>
      </template>
    </div>
    <el-dialog v-model="moveDialogVisible" class="kdbx-dialog" :title="moveGroupSourceId ? t('kdbx.moveGroup') : t('kdbx.moveEntries')" width="460px" :close-on-click-modal="false" @closed="clearMoveDialog"><div class="kdbx-move-tree"><el-tree v-if="moveTargetTree.length" :data="moveTargetTree" node-key="id" :expand-on-click-node="false" :highlight-current="true" default-expand-all @node-click="selectMoveTarget"><template #default="{ data }"><div class="kdbx-move-tree-row"><el-icon><Folder /></el-icon><span>{{ data.label }}</span></div></template></el-tree><div v-else class="kdbx-empty">{{ t('kdbx.noEntries') }}</div></div><template #footer><el-button @click="moveDialogVisible = false">{{ t('common.cancel') }}</el-button><el-button type="primary" :loading="moving" :disabled="!moveTargetGroupId" @click="confirmMove">{{ t('common.ok') }}</el-button></template></el-dialog>
    <el-dialog v-model="historyDialogVisible" class="kdbx-dialog" :title="t('kdbx.historyVersion')" width="620px"><template v-if="historyPreview"><dl class="kdbx-history-preview"><dt>{{ t('kdbx.title') }}</dt><dd>{{ historyPreview.title || t('kdbx.untitled') }}</dd><dt>{{ t('kdbx.username') }}</dt><dd>{{ historyPreview.username }}</dd><dt>{{ t('kdbx.url') }}</dt><dd>{{ historyPreview.url }}</dd><dt>{{ t('kdbx.tags') }}</dt><dd>{{ historyPreview.tags.join(', ') }}</dd><dt>{{ t('kdbx.notes') }}</dt><dd>{{ historyPreview.notes }}</dd><dt>{{ t('kdbx.customFields') }}</dt><dd>{{ historyPreview.fields.filter(field => !standardFieldKeys.includes(field.key) && field.key.toLowerCase() !== 'key_url_type').map(field => `${field.key}: ${field.value}`).join('\n') || '-' }}</dd><dt>{{ t('kdbx.attachments') }}</dt><dd>{{ historyPreview.attachments.map(attachment => attachment.name).join(', ') || '-' }}</dd></dl></template></el-dialog>
    <el-dialog v-model="resetPasswordVisible" class="kdbx-dialog kdbx-reset-password-dialog" :title="t('kdbx.resetPassword')" width="440px" :close-on-click-modal="false" @closed="clearResetPassword">
      <el-form label-position="top" @submit.prevent="resetVaultPassword">
        <el-form-item :label="t('kdbx.currentPassword')"><el-input v-model="resetCurrentPassword" :class="{ 'is-password-invalid': currentPasswordInvalid }" type="password" show-password autocomplete="current-password" @input="currentPasswordIncorrect = false" /><div v-if="currentPasswordIncorrect" class="kdbx-password-rule error">{{ t('kdbx.currentPasswordInvalid') }}</div></el-form-item>
        <el-form-item :label="t('kdbx.newPassword')"><el-input v-model="resetNewPassword" :class="{ 'is-password-invalid': newPasswordInvalid }" type="password" show-password autocomplete="new-password" /><div class="kdbx-password-rule" :class="{ error: newPasswordInvalid }">{{ t('kdbx.passwordRule') }}</div></el-form-item>
        <el-form-item :label="t('kdbx.confirmPassword')"><el-input v-model="resetConfirmPassword" :class="{ 'is-password-invalid': resetPasswordMismatch }" type="password" show-password autocomplete="new-password" /><div v-if="resetPasswordMismatch" class="kdbx-password-rule error">{{ t('kdbx.passwordMismatch') }}</div></el-form-item>
      </el-form>
      <template #footer><el-button @click="resetPasswordVisible = false">{{ t('common.cancel') }}</el-button><el-button type="primary" :loading="resettingPassword" @click="resetVaultPassword">{{ t('kdbx.resetPassword') }}</el-button></template>
    </el-dialog>
    <el-dialog v-model="attachmentPreviewVisible" class="kdbx-dialog" :title="attachmentPreviewName" width="min(860px, calc(100vw - 48px))" @closed="clearAttachmentPreview"><img v-if="attachmentPreviewUrl" class="kdbx-attachment-preview" :src="attachmentPreviewUrl" :alt="attachmentPreviewName" /></el-dialog>
    <el-dialog v-if="editDraft" v-model="editing" class="kdbx-dialog kdbx-edit-dialog" :title="editEntryPath" width="min(760px, calc(100vw - 48px))" :close-on-click-modal="false" @closed="cancelEdit">
      <div class="kdbx-edit-form">
        <label>{{ t('kdbx.entryType') }}
          <el-select v-model="editEntryType" :placeholder="t('kdbx.selectEntryType')" popper-class="kdbx-select-popper">
            <el-option :label="t('kdbx.entryTypes.normal')" value="Normal" />
            <el-option :label="t('kdbx.entryTypes.ssh')" value="SSH" />
            <el-option :label="t('kdbx.entryTypes.telnet')" value="Telnet" />
            <!-- Serial 与 RawSocket 暂不暴露选项（后期按需启用），底层实现与解析代码完整保留
            <el-option :label="t('kdbx.entryTypes.serial')" value="Serial" />
            <el-option :label="t('kdbx.entryTypes.rawSocket')" value="RawSocket" />
            -->
          </el-select>
        </label>
        <label>{{ t('kdbx.title') }}<el-input v-model="editDraft.title" /></label>
        <label>{{ t('kdbx.username') }}<el-input v-model="editDraft.username" /></label>
        <label>{{ t('kdbx.password') }}<el-input v-model="passwordField" type="password" show-password /></label>
        <div class="kdbx-totp-input-group">
          <label class="kdbx-totp-label">{{ t('kdbx.totpSecret') }}
            <div class="kdbx-totp-input-row">
              <el-input v-model="totpField" type="password" show-password :placeholder="t('kdbx.totpPlaceholder')" />
              <el-tooltip :content="t('kdbx.scanQrCode')" :show-after="350">
                <button class="kdbx-scan-btn" :title="t('kdbx.scanQrCode')" type="button" @click="openQrScanner">
                  <el-icon><FullScreen /></el-icon>
                </button>
              </el-tooltip>
            </div>
          </label>
          <div v-if="editTotpPreview" class="kdbx-totp-preview">
            <span>{{ t('kdbx.totpCurrentCode') }}: <strong>{{ editTotpPreview.formattedCode }}</strong> ({{ editTotpPreview.remainingSeconds }}s)</span>
          </div>
        </div>
        <label>{{ getUrlLabel }}<el-input v-model="editDraft.url" :placeholder="getUrlPlaceholder" /></label>
        <label>{{ t('kdbx.tags') }}<el-select v-model="editDraft.tags" multiple filterable allow-create default-first-option popper-class="kdbx-select-popper"><el-option v-for="tag in vault?.tags" :key="tag" :label="tag" :value="tag" /></el-select></label>
        <label>{{ t('kdbx.notes') }}<el-input v-model="editDraft.notes" type="textarea" :rows="4" /></label>
        <section class="kdbx-section">
          <div class="kdbx-section-title">
            <strong>{{ t('kdbx.customFields') }}</strong>
            <div class="kdbx-section-actions">
              <el-tooltip :content="t('kdbx.batchImportTotp')" :show-after="350">
                <button :title="t('kdbx.batchImportTotp')" type="button" @click="openBatchImport">
                  <el-icon><DocumentAdd /></el-icon>
                </button>
              </el-tooltip>
              <el-tooltip :content="t('kdbx.addCustomField')" :show-after="350">
                <button :title="t('kdbx.addCustomField')" type="button" @click="addCustomField">
                  <el-icon><Plus /></el-icon>
                </button>
              </el-tooltip>
            </div>
          </div>
          <div v-for="field in customFields" :key="field.id" class="kdbx-custom-field">
            <el-input v-model="field.key" :placeholder="t('kdbx.fieldName')" />
            <div class="kdbx-field-val-wrap">
              <el-input v-model="field.value" :type="field.protected ? 'password' : 'text'" :show-password="field.protected" :placeholder="t('kdbx.fieldValue')" />
              <span v-if="getFieldTotp(field.value)" class="kdbx-field-totp-badge" :title="`${t('kdbx.totpCurrentCode')}: ${getFieldTotp(field.value)?.code}`">
                {{ getFieldTotp(field.value)?.code }}
              </span>
            </div>
            <el-checkbox v-model="field.protected" :title="t('kdbx.protectedField')"><el-icon><Lock /></el-icon></el-checkbox>
            <button :title="t('kdbx.removeCustomField')" type="button" @click="removeCustomField(field.id)"><el-icon><Delete /></el-icon></button>
          </div>
        </section>
        <section class="kdbx-section"><div class="kdbx-section-title"><strong>{{ t('kdbx.attachments') }}</strong><button :title="t('kdbx.addAttachment')" type="button" @click="attachmentInput?.click()"><el-icon><Paperclip /></el-icon></button></div><input ref="attachmentInput" class="kdbx-file-input" type="file" @change="addAttachment" /><div v-if="draftAttachments.length === 0" class="kdbx-section-empty">{{ t('kdbx.noAttachments') }}</div><div v-for="attachment in draftAttachments" :key="attachment.id" class="kdbx-attachment"><div><el-icon><Document /></el-icon><span>{{ attachment.name }}</span><em>{{ formatSize(attachment.size) }}</em></div><button v-if="isPreviewable(attachment)" :title="t('kdbx.previewAttachment')" type="button" @click="previewAttachment(attachment)"><el-icon><View /></el-icon></button><button :title="t('kdbx.downloadAttachment')" type="button" @click="downloadAttachment(attachment)"><el-icon><Download /></el-icon></button><button :title="t('kdbx.removeAttachment')" type="button" @click="removeAttachment(attachment)"><el-icon><Delete /></el-icon></button></div></section>
      </div>
      <template #footer><el-button @click="cancelEdit">{{ t('common.cancel') }}</el-button><el-button type="primary" :loading="savingEntry" @click="saveEntry">{{ t('kdbx.save') }}</el-button></template>
    </el-dialog>
    <QrScanDialog ref="qrScanDialogRef" @select="onQrCodeSelected" />
    <BatchImportTotpDialog ref="batchImportDialogRef" @import="onBatchImport" />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, ArrowRight, Delete, DeleteFilled, Document, DocumentAdd, DocumentCopy, Download, Edit, Filter, Folder, FolderAdd, FolderOpened, FullScreen, Hide, Key, Loading, Lock, Monitor, MoreFilled, Paperclip, Plus, PriceTag, RefreshRight, Search, Tickets, Upload, View } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useEditorStore } from '@/store/editor'
import { useTerminalStore } from '@/store/terminal'
import type { KdbxEntryDetail, KdbxEntryInput, KdbxEntryRevision, KdbxEntrySummary, KdbxField, KdbxGroupSummary, KdbxVaultSnapshot } from '@shared/types/kdbx'
import type { ITerminalConnectionConfig, TerminalProtocolType } from '@shared/types/terminal'
import { isKdbxPasswordValid, KDBX_PASSWORD_PATTERN } from '@shared/kdbxPassword'
import { generateTotp, isTotpField, isTotpKey, isTotpValue, parseOtpUri } from '@shared/totp'
import type { TotpGenerationResult } from '@shared/totp'
import QrScanDialog from './qrScanDialog.vue'
import BatchImportTotpDialog from './batchImportTotpDialog.vue'

interface FlatGroup extends KdbxGroupSummary { depth: number }
interface CustomField extends KdbxField { id: string }
interface GroupMenuState { group: FlatGroup; x: number; y: number }
interface EntryMenuState { entry: KdbxVaultSnapshot['entries'][number]; x: number; y: number }
interface MoveGroupOption { id: string; label: string; children?: MoveGroupOption[] }
interface AttachmentDraft { id: string; name: string; size: number; data?: ArrayBuffer; removed: boolean }
interface ViewTotpItem {
  id: string
  key: string
  label: string
  value: string
  result: TotpGenerationResult
}

const standardFieldKeys = ['Title', 'UserName', 'URL', 'Notes', 'Password']
const { t } = useI18n()
const messageBoxTheme = { customClass: 'kdbx-message-box' }
const errorMessage = (reason: unknown, fallback: string): string => {
  const message = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : ''
  return message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '').replace(/^Error:\s*/, '') || fallback
}
const editorStore = useEditorStore()
const { currentFile } = storeToRefs(editorStore)
const terminalStore = useTerminalStore()
const vault = ref<KdbxVaultSnapshot | null>(null)
const locked = ref(true); const password = ref(''); const error = ref(''); const unlocking = ref(false); const unlockPasswordVisible = ref(false)
const query = ref(''); const searchFields = ref(['title', 'username', 'url', 'notes']); const showSearchOptions = ref(false)
const selectedGroup = ref(''); const selectedTag = ref(''); const selectedUntagged = ref(false); const selectedRecycle = ref(false); const selectedEntryId = ref(''); const selectedEntryIds = ref(new Set<string>()); const draft = ref<KdbxEntryDetail | null>(null); const editDraft = ref<KdbxEntryDetail | null>(null); const passwordField = ref(''); const totpField = ref(''); const savingEntry = ref(false); const exportingEntries = ref(false); const editing = ref(false); const newEntry = ref(false); const showPassword = ref(false)
const editEntryType = ref<'Normal' | 'SSH' | 'Telnet' | 'Serial' | 'RawSocket'>('Normal')
const expandedGroups = ref(new Set<string>()); const allItemsExpanded = ref(true); const groupMenu = ref<GroupMenuState | null>(null); const entryMenu = ref<EntryMenuState | null>(null); const attachmentInput = ref<HTMLInputElement | null>(null); const qrScanDialogRef = ref<InstanceType<typeof QrScanDialog> | null>(null); const batchImportDialogRef = ref<InstanceType<typeof BatchImportTotpDialog> | null>(null); const historyDialogVisible = ref(false); const historyPreview = ref<KdbxEntryRevision | null>(null); const attachmentPreviewVisible = ref(false); const attachmentPreviewUrl = ref(''); const attachmentPreviewName = ref('')
const moveDialogVisible = ref(false); const moveTargetGroupId = ref(''); const moveGroupSourceId = ref(''); const moveEntryIds = ref<string[]>([]); const moving = ref(false)
const resetPasswordVisible = ref(false); const resettingPassword = ref(false); const resetAttempted = ref(false); const currentPasswordIncorrect = ref(false); const resetCurrentPassword = ref(''); const resetNewPassword = ref(''); const resetConfirmPassword = ref('')
const customFields = ref<CustomField[]>([])
const revealedCustomFields = ref(new Set<string>())
const attachmentDrafts = ref<AttachmentDraft[]>([])
const totpFilterQuery = ref('')
const now = ref(Date.now())
let totpTimer: number | null = null
let nextCustomFieldId = 0
let nextAttachmentDraftId = 0
const filePath = computed(() => currentFile.value?.isKdbx ? currentFile.value.pathname : '')
const displayFilename = computed(() => currentFile.value?.filename.replace(/\.kdbx$/i, '') ?? '')
const vaultDisplayName = computed(() => displayFilename.value || vault.value?.name || t('kdbx.vault'))
const normalEntries = computed(() => (vault.value?.entries || []).filter(entry => !entry.isRecycleBin))
const recycleEntries = computed(() => (vault.value?.entries || []).filter(entry => entry.isRecycleBin))
const entryTags = (entry: KdbxVaultSnapshot['entries'][number]): string[] => (entry.tags || []).filter(tag => tag.trim())
const availableTags = computed(() => (vault.value?.tags || []).filter(tag => tag.trim()))
const tagEntryCount = (tag: string): number => normalEntries.value.filter(entry => entryTags(entry).includes(tag)).length
const untaggedEntryCount = computed(() => normalEntries.value.filter(entry => entryTags(entry).length === 0).length)
const flatGroups = computed<FlatGroup[]>(() => { const flatten = (groups: KdbxGroupSummary[], depth = 0): FlatGroup[] => groups.flatMap(group => [{ ...group, depth }, ...flatten(group.groups, depth + 1)]); return flatten(vault.value?.groups || []) })
const visibleGroups = computed<FlatGroup[]>(() => { const visible = (groups: KdbxGroupSummary[], depth = 0): FlatGroup[] => groups.flatMap((group) => { const current: FlatGroup = { ...group, depth }; return expandedGroups.value.has(group.id) ? [current, ...visible(group.groups, depth + 1)] : [current] }); return visible(vault.value?.groups || []) })
const moveTargetTree = computed<MoveGroupOption[]>(() => { const sourceId = moveGroupSourceId.value; const build = (group: KdbxGroupSummary): MoveGroupOption | null => { if (group.id === sourceId) return null; const children = group.groups.map(build).filter((child): child is MoveGroupOption => !!child); return { id: group.id, label: groupDisplayName(group), ...(children.length ? { children } : {}) } }; return (vault.value?.groups || []).map(build).filter((group): group is MoveGroupOption => !!group) })
const groupDisplayName = (group: KdbxGroupSummary): string => group.isRoot ? t('kdbx.allGroups') : group.name
const displayGroupPath = (path: string[]): string[] => path.map((name, index) => index === 0 ? t('kdbx.allGroups') : name)
const filteredEntries = computed(() => { const value = query.value.trim().toLocaleLowerCase(); return (selectedRecycle.value ? recycleEntries.value : normalEntries.value).filter((entry) => { const tags = entryTags(entry); if (!selectedRecycle.value && selectedGroup.value && entry.groupId !== selectedGroup.value) return false; if (!selectedRecycle.value && selectedTag.value && !tags.includes(selectedTag.value)) return false; if (!selectedRecycle.value && selectedUntagged.value && tags.length > 0) return false; if (!value) return true; const fields: Record<string, string> = { title: entry.title, username: entry.username, url: entry.url, notes: entry.notes }; return searchFields.value.some(field => fields[field]?.toLocaleLowerCase().includes(value)) || tags.some(tag => tag.toLocaleLowerCase().includes(value)) }) })
const entryPathParts = computed(() => { if (!draft.value) return []; const vaultName = vaultDisplayName.value; const groups = displayGroupPath(draft.value.groupPath).filter((name, index) => index !== 0 || name !== vaultName); return [vaultName, ...groups, draft.value.title || t('kdbx.untitled')] })
const entryPath = computed(() => entryPathParts.value.join(' / '))
const editEntryPath = computed(() => { if (!editDraft.value) return ''; const vaultName = vaultDisplayName.value; const groups = displayGroupPath(editDraft.value.groupPath).filter((name, index) => index !== 0 || name !== vaultName); return [vaultName, ...groups, editDraft.value.title || t('kdbx.untitled')].join(' / ') })
const draftAttachments = computed(() => attachmentDrafts.value.filter(attachment => !attachment.removed))
const viewPassword = computed(() => draft.value?.fields.find(field => field.key === 'Password')?.value || '')

const getEntryUrlType = (entry: KdbxEntrySummary | KdbxEntryDetail | null | undefined): string | null => {
  if (!entry) return null
  let val: string | null = null
  if ('urlType' in entry && entry.urlType) {
    val = entry.urlType
  } else if ('fields' in entry && Array.isArray((entry as KdbxEntryDetail).fields)) {
    val = (entry as KdbxEntryDetail).fields.find(f => f.key.toLowerCase() === 'key_url_type')?.value || null
  }
  if (!val || val.toLowerCase() === 'normal' || val.toLowerCase() === 'null' || val.trim() === '') {
    return null
  }
  const norm = val.trim().toLowerCase()
  if (norm === 'ssh') return 'SSH'
  if (norm === 'telnet') return 'Telnet'
  if (norm === 'series' || norm === 'serial') return 'Serial'
  if (norm === 'rawrocket' || norm === 'rawsocket' || norm === 'raw_rocket' || norm === 'socket') return 'RawSocket'
  return val.trim()
}

const getEntryUrlTypeBadge = (entry: KdbxEntrySummary | KdbxEntryDetail | null | undefined): string => {
  const proto = getEntryUrlType(entry)
  if (!proto) return ''
  if (proto === 'RawSocket') return 'RAW SOCKET'
  return proto.toUpperCase()
}

const getUrlLabel = computed(() => {
  if (!editEntryType.value || editEntryType.value === 'Normal') {
    return t('kdbx.url')
  }
  if (editEntryType.value === 'Serial') {
    return t('kdbx.serialDeviceUrlLabel')
  }
  return t('kdbx.hostPortLabel')
})

const getUrlPlaceholder = computed(() => {
  if (editEntryType.value === 'SSH') {
    return t('kdbx.placeholders.ssh')
  }
  if (editEntryType.value === 'Serial') {
    return t('kdbx.placeholders.serial')
  }
  if (editEntryType.value === 'Telnet') {
    return t('kdbx.placeholders.telnet')
  }
  if (editEntryType.value === 'RawSocket') {
    return t('kdbx.placeholders.rawSocket')
  }
  return ''
})

const viewTotpList = computed<ViewTotpItem[]>(() => {
  if (!draft.value) return []
  const items: ViewTotpItem[] = []
  const fields = draft.value.fields || []
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]
    if (standardFieldKeys.includes(field.key) || field.key.toLowerCase() === 'key_url_type') continue
    if (isTotpField(field) || isTotpValue(field.value)) {
      const res = generateTotp(field.value, now.value)
      if (res) {
        let label = field.key
        if (isTotpKey(field.key)) {
          const parsed = parseOtpUri(field.value)
          label = parsed?.issuer || parsed?.label || t('kdbx.totp')
        }
        items.push({
          id: `totp-${i}-${field.key}`,
          key: field.key,
          label,
          value: field.value,
          result: res
        })
      }
    }
  }
  return items
})
const filteredTotpList = computed(() => {
  const q = totpFilterQuery.value.trim().toLowerCase()
  if (!q) return viewTotpList.value
  return viewTotpList.value.filter(item =>
    item.label.toLowerCase().includes(q) ||
    item.key.toLowerCase().includes(q) ||
    item.result.code.includes(q)
  )
})
const editTotpPreview = computed<TotpGenerationResult | null>(() => {
  if (!totpField.value) return null
  return generateTotp(totpField.value, now.value)
})
const viewCustomFields = computed(() => {
  if (!draft.value) return []
  const totpKeys = new Set(viewTotpList.value.map(item => item.key))
  return (draft.value.fields || []).filter(field =>
    !standardFieldKeys.includes(field.key) &&
    field.key.toLowerCase() !== 'key_url_type' &&
    !totpKeys.has(field.key) &&
    !isTotpField(field) &&
    !isTotpValue(field.value)
  )
})
const viewAttachments = computed<AttachmentDraft[]>(() => (draft.value?.attachments || []).map(attachment => ({ ...attachment, id: `view-${attachment.name}`, removed: false })))
const currentPasswordInvalid = computed(() => (resetAttempted.value && !resetCurrentPassword.value) || currentPasswordIncorrect.value)
const newPasswordInvalid = computed(() => (resetNewPassword.value.length > 0 && !isKdbxPasswordValid(resetNewPassword.value)) || (resetAttempted.value && !isKdbxPasswordValid(resetNewPassword.value)))
const resetPasswordMismatch = computed(() => (resetConfirmPassword.value.length > 0 || resetAttempted.value) && resetNewPassword.value !== resetConfirmPassword.value)
const expandAllGroups = (): void => { expandedGroups.value = new Set(flatGroups.value.map(group => group.id)) }
const refresh = async(pathname = filePath.value): Promise<void> => { if (!pathname || locked.value) return; vault.value = await window.electron.ipcRenderer.invoke('mt::kdbx::snapshot', pathname); expandAllGroups() }
const unlock = async(): Promise<void> => { if (!filePath.value || !password.value) return; unlocking.value = true; error.value = ''; try { vault.value = await window.electron.ipcRenderer.invoke('mt::kdbx::unlock', filePath.value, password.value); locked.value = false; password.value = ''; unlockPasswordVisible.value = false; expandAllGroups() } catch (err) { const message = err instanceof Error ? err.message : ''; error.value = /InvalidKey/i.test(message) ? t('kdbx.invalidPassword') : t('kdbx.unlockFailed') } finally { unlocking.value = false } }
const clearCustomFields = (): void => { customFields.value = []; totpField.value = '' }
const loadCustomFields = (detail: KdbxEntryDetail): void => {
  const totpEntry = detail.fields.find(field => isTotpField(field))
  totpField.value = totpEntry?.value || ''
  customFields.value = detail.fields.filter(field => !standardFieldKeys.includes(field.key) && field !== totpEntry && field.key.toLowerCase() !== 'key_url_type').map(field => ({ ...field, id: `custom-${nextCustomFieldId++}` }))
}
const loadAttachments = (detail: KdbxEntryDetail): void => { attachmentDrafts.value = detail.attachments.map(attachment => ({ ...attachment, id: `attachment-${nextAttachmentDraftId++}`, removed: false })) }
const clearAttachmentPreview = (): void => { if (attachmentPreviewUrl.value.startsWith('blob:')) URL.revokeObjectURL(attachmentPreviewUrl.value); attachmentPreviewUrl.value = ''; attachmentPreviewName.value = '' }
const clearEditDraft = (): void => { editDraft.value = null; passwordField.value = ''; totpField.value = ''; editEntryType.value = 'Normal'; editing.value = false; newEntry.value = false; clearCustomFields(); attachmentDrafts.value = []; clearAttachmentPreview() }
const clearDraft = (): void => { draft.value = null; selectedEntryId.value = ''; showPassword.value = false; revealedCustomFields.value = new Set(); clearEditDraft() }
const lock = async(): Promise<void> => { const pathname = filePath.value; if (!pathname) return; await window.electron.ipcRenderer.invoke('mt::kdbx::lock', pathname); if (pathname !== filePath.value) return; vault.value = null; clearDraft(); password.value = ''; unlockPasswordVisible.value = false; locked.value = true }
const clearResetPassword = (): void => { resetAttempted.value = false; currentPasswordIncorrect.value = false; resetCurrentPassword.value = ''; resetNewPassword.value = ''; resetConfirmPassword.value = '' }
const openResetPassword = (): void => { clearResetPassword(); resetPasswordVisible.value = true }
const resetVaultPassword = async(): Promise<void> => { if (!filePath.value || resettingPassword.value) return; resetAttempted.value = true; currentPasswordIncorrect.value = false; if (!resetCurrentPassword.value) { ElMessage.error(t('kdbx.passwordRequired')); return } if (!isKdbxPasswordValid(resetNewPassword.value)) { ElMessage.error(t('kdbx.passwordRule')); return } if (resetNewPassword.value !== resetConfirmPassword.value) { ElMessage.error(t('kdbx.passwordMismatch')); return } resettingPassword.value = true; try { await window.electron.ipcRenderer.invoke('mt::kdbx::reset-password', filePath.value, resetCurrentPassword.value, resetNewPassword.value); resetPasswordVisible.value = false; ElMessage.success(t('kdbx.passwordReset')) } catch (error) { const message = errorMessage(error, t('kdbx.resetPasswordFailed')); currentPasswordIncorrect.value = message.includes('当前主密码不正确') || message === t('kdbx.currentPasswordInvalid'); ElMessage.error(currentPasswordIncorrect.value ? t('kdbx.currentPasswordInvalid') : message) } finally { resettingPassword.value = false } }
const clearEntrySelection = (): void => { selectedEntryIds.value = new Set() }
const toggleEntrySelection = (id: string): void => { const next = new Set(selectedEntryIds.value); next.has(id) ? next.delete(id) : next.add(id); selectedEntryIds.value = next }
const selectAll = (): void => { selectedGroup.value = ''; selectedTag.value = ''; selectedUntagged.value = false; selectedRecycle.value = false; clearEntrySelection() }
const selectRecycle = (): void => { selectedGroup.value = ''; selectedTag.value = ''; selectedUntagged.value = false; selectedRecycle.value = true; selectedEntryId.value = ''; clearEntrySelection(); clearDraft() }
const selectGroup = (id: string): void => { selectedGroup.value = id; selectedTag.value = ''; selectedUntagged.value = false; selectedRecycle.value = false; clearEntrySelection() }
const selectTag = (tag: string): void => { selectedTag.value = selectedTag.value === tag ? '' : tag; selectedUntagged.value = false; selectedGroup.value = ''; selectedRecycle.value = false; clearEntrySelection() }
const selectUntagged = (): void => { selectedUntagged.value = !selectedUntagged.value; selectedTag.value = ''; selectedGroup.value = ''; selectedRecycle.value = false; clearEntrySelection() }
const toggleAllItems = (): void => { allItemsExpanded.value = !allItemsExpanded.value }
const toggleGroup = (id: string): void => { const next = new Set(expandedGroups.value); next.has(id) ? next.delete(id) : next.add(id); expandedGroups.value = next }
const openGroupMenu = (group: FlatGroup, event: MouseEvent): void => { entryMenu.value = null; groupMenu.value = { group, x: event.clientX, y: event.clientY } }
const openEntryMenu = (entry: KdbxVaultSnapshot['entries'][number], event: MouseEvent): void => { groupMenu.value = null; entryMenu.value = { entry, x: event.clientX, y: event.clientY } }
const groupPathFor = (targetId: string, groups = vault.value?.groups || [], ancestors: string[] = []): string[] => { for (const group of groups) { const current = [...ancestors, groupDisplayName(group)]; if (group.id === targetId) return current; const found = groupPathFor(targetId, group.groups, current); if (found.length) return found } return [] }
const selectEntry = async(id: string): Promise<void> => { if (!filePath.value) return; if (editing.value && id !== selectedEntryId.value) { try { await ElMessageBox.confirm(t('kdbx.discardChangesConfirm'), t('kdbx.cancelEdit'), { ...messageBoxTheme, confirmButtonText: t('common.ok'), cancelButtonText: t('common.cancel'), type: 'warning' }) } catch { return } clearEditDraft() } const detail = await window.electron.ipcRenderer.invoke('mt::kdbx::entry', filePath.value, id); if (!detail) return; selectedEntryId.value = id; draft.value = detail; showPassword.value = false; revealedCustomFields.value = new Set() }
const clearMoveDialog = (): void => { moveTargetGroupId.value = ''; moveGroupSourceId.value = ''; moveEntryIds.value = [] }
const openGroupMove = (group: FlatGroup): void => { groupMenu.value = null; moveGroupSourceId.value = group.id; moveEntryIds.value = []; moveTargetGroupId.value = ''; moveDialogVisible.value = true }
const openEntryMove = (entryIds: string[]): void => { if (!entryIds.length) return; entryMenu.value = null; moveGroupSourceId.value = ''; moveEntryIds.value = [...new Set(entryIds)]; moveTargetGroupId.value = ''; moveDialogVisible.value = true }
const selectMoveTarget = (group: MoveGroupOption): void => { moveTargetGroupId.value = group.id }
const confirmMove = async(): Promise<void> => { if (!filePath.value || !moveTargetGroupId.value || moving.value) return; moving.value = true; try { vault.value = moveGroupSourceId.value ? await window.electron.ipcRenderer.invoke('mt::kdbx::move-group', filePath.value, moveGroupSourceId.value, moveTargetGroupId.value) : await window.electron.ipcRenderer.invoke('mt::kdbx::move-entries', filePath.value, [...moveEntryIds.value], moveTargetGroupId.value); clearEntrySelection(); clearDraft(); expandAllGroups(); moveDialogVisible.value = false; ElMessage.success(t('kdbx.moved')) } catch (error) { ElMessage.error(errorMessage(error, t('kdbx.moveFailed'))) } finally { moving.value = false } }

function parseEntryToTerminalConfig(entry: KdbxEntryDetail | KdbxEntrySummary, fullFields?: KdbxField[]): ITerminalConnectionConfig {
  const fields = fullFields || ('fields' in entry ? (entry as KdbxEntryDetail).fields : []) || []
  const getFieldValue = (key: string) => fields.find(f => f.key.toLowerCase() === key.toLowerCase())?.value || ''

  const rawUrlType = getFieldValue('key_url_type') || ('urlType' in entry ? entry.urlType : '') || ''
  const protocolField = getFieldValue('protocol') || getFieldValue('type') || rawUrlType
  const portField = getFieldValue('port')
  const privateKeyField = getFieldValue('privatekey') || getFieldValue('ssh_key') || getFieldValue('private_key')
  const passphraseField = getFieldValue('passphrase')
  const jumpHostField = getFieldValue('jumphost') || getFieldValue('jump_host')
  const jumpPortField = getFieldValue('jumpport') || getFieldValue('jump_port')
  const jumpUserField = getFieldValue('jumpuser') || getFieldValue('jump_user')
  const jumpPassField = getFieldValue('jumppass') || getFieldValue('jump_pass')
  const baudRateField = getFieldValue('baudrate') || getFieldValue('baud_rate')
  const serialPortField = getFieldValue('serialport') || getFieldValue('serial_port')
  const socketProtoField = getFieldValue('socketproto') || getFieldValue('socket_protocol')

  let type: TerminalProtocolType = 'ssh'
  const normalizedProto = (protocolField || '').toLowerCase()
  if (normalizedProto.includes('telnet')) {
    type = 'telnet'
  } else if (normalizedProto.includes('serial') || normalizedProto.includes('series')) {
    type = 'serial'
  } else if (normalizedProto.includes('raw') || normalizedProto.includes('socket') || normalizedProto.includes('rocket')) {
    type = 'rawSocket'
  } else {
    type = 'ssh'
  }

  let rawUrl = (entry.url || '').trim()
  let host = rawUrl
  let port = type === 'telnet' ? 23 : (type === 'rawSocket' ? 9000 : 22)
  let username = entry.username || ''
  let password = fields.find(f => f.key === 'Password')?.value || ''
  let baudRate = 115200
  let serialPort = serialPortField || ''

  if (rawUrl) {
    if (rawUrl.includes('://')) {
      try {
        const u = new URL(rawUrl)
        if (u.hostname) host = u.hostname
        if (u.port) port = Number(u.port)
        if (u.username) username = decodeURIComponent(u.username)
        if (u.password) password = decodeURIComponent(u.password)
        if (u.pathname && type === 'serial' && !serialPort) {
          serialPort = u.pathname
        }
      } catch {
        const match = rawUrl.match(/^[a-zA-Z0-9_-]+:\/\/([^:/]+)(?::(\d+))?/)
        if (match) {
          host = match[1]
          if (match[2]) port = Number(match[2])
        }
      }
    } else if (type === 'serial') {
      if (rawUrl.includes(':')) {
        const [p, b] = rawUrl.split(':')
        serialPort = p.trim()
        if (b && Number(b)) baudRate = Number(b)
      } else {
        serialPort = rawUrl
      }
    } else if (rawUrl.includes(':')) {
      const parts = rawUrl.split(':')
      host = parts[0].trim()
      const parsedPort = Number(parts[1])
      if (parsedPort) port = parsedPort
    }
  }

  if (portField && Number(portField)) {
    port = Number(portField)
  }
  if (baudRateField && Number(baudRateField)) {
    baudRate = Number(baudRateField)
  }

  let totpSecret = ''
  const totpItem = fields.find(f => isTotpField(f) || isTotpValue(f.value))
  if (totpItem) {
    totpSecret = totpItem.value
  }

  return {
    id: `kdbx_${entry.id}_${Date.now()}`,
    name: entry.title || host || serialPort || t('kdbx.terminalConnection'),
    type,
    host: host || '127.0.0.1',
    port,
    username: username || (type === 'ssh' ? 'root' : ''),
    authType: privateKeyField ? 'privateKey' : 'password',
    password,
    privateKey: privateKeyField,
    passphrase: passphraseField,
    totpSecret,
    jumpHost: jumpHostField,
    jumpPort: Number(jumpPortField) || 22,
    jumpUsername: jumpUserField,
    jumpPassword: jumpPassField,
    keepaliveInterval: 0,
    serialPort: serialPort || host,
    baudRate,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    socketProtocol: (socketProtoField as any) || 'tcp'
  }
}

const connectTerminalFromEntry = async(entry: KdbxVaultSnapshot['entries'][number]): Promise<void> => {
  if (!filePath.value) return
  try {
    const detail = await window.electron.ipcRenderer.invoke('mt::kdbx::entry', filePath.value, entry.id)
    if (!detail) return
    const config = parseEntryToTerminalConfig(detail)
    const session = await terminalStore.connect(config)
    const proto = (session?.type || config?.type || 'ssh').toUpperCase()
    editorStore.OPEN_TERMINAL_TAB({
      sessionId: session.id,
      title: session.title ? `${proto}: ${session.title}` : `${proto}: ${config.name || config.host || t('terminal.title')}`,
      config: JSON.parse(JSON.stringify(config)),
      kdbxEntryId: detail.id
    })
  } catch (err: any) {
    ElMessage.error(`${t('kdbx.connectTerminalFailed')}: ${err?.message || err}`)
  }
}

const connectTerminalFromDraft = async(): Promise<void> => {
  if (!draft.value) return
  try {
    const config = parseEntryToTerminalConfig(draft.value)
    const session = await terminalStore.connect(config)
    const proto = (session?.type || config?.type || 'ssh').toUpperCase()
    editorStore.OPEN_TERMINAL_TAB({
      sessionId: session.id,
      title: session.title ? `${proto}: ${session.title}` : `${proto}: ${config.name || config.host || t('terminal.title')}`,
      config: JSON.parse(JSON.stringify(config)),
      kdbxEntryId: draft.value.id
    })
  } catch (err: any) {
    ElMessage.error(`${t('kdbx.connectTerminalFailed')}: ${err?.message || err}`)
  }
}

const runEntryMenuAction = async(action: 'edit' | 'copy' | 'export' | 'move' | 'delete' | 'restore' | 'connect-terminal'): Promise<void> => {
  const entry = entryMenu.value?.entry
  entryMenu.value = null
  if (!entry) return
  if (action === 'connect-terminal') {
    await connectTerminalFromEntry(entry)
    return
  }
  if (action === 'move') { openEntryMove([entry.id]); return }
  await selectEntry(entry.id)
  if (draft.value?.id !== entry.id) return
  if (action === 'edit') beginEdit()
  else if (action === 'copy') copyEntry()
  else if (action === 'export') await exportEntries([entry.id])
  else if (action === 'restore') await restoreEntry()
  else await deleteEntry()
}
const toInput = (): KdbxEntryInput => {
  const active = editDraft.value!
  const fields = customFields.value.filter(field => field.key.trim() && !isTotpKey(field.key.trim()) && field.key.trim().toLowerCase() !== 'key_url_type').map(field => ({ key: field.key.trim(), value: field.value, protected: field.protected }))
  if (totpField.value.trim()) {
    fields.unshift({ key: 'otp', value: totpField.value.trim(), protected: true })
  }
  if (editEntryType.value && editEntryType.value !== 'Normal') {
    fields.push({ key: 'key_url_type', value: editEntryType.value, protected: false })
  }
  fields.push({ key: 'Password', value: passwordField.value, protected: true })
  return {
    groupId: active.groupId || selectedGroup.value,
    title: active.title,
    username: active.username,
    url: active.url,
    notes: active.notes,
    tags: [...active.tags],
    fields,
    attachments: {
      add: attachmentDrafts.value.filter(attachment => attachment.data && !attachment.removed).map(attachment => ({ name: attachment.name, data: attachment.data! })),
      remove: attachmentDrafts.value.filter(attachment => attachment.removed && !attachment.data).map(attachment => attachment.name)
    }
  }
}
const createGroup = async(parentId = selectedGroup.value): Promise<void> => { if (!filePath.value) return; groupMenu.value = null; try { const { value } = await ElMessageBox.prompt(t('kdbx.groupName'), t('kdbx.newGroup'), { ...messageBoxTheme, confirmButtonText: t('common.ok'), cancelButtonText: t('common.cancel'), inputPattern: /\S/, inputErrorMessage: t('kdbx.groupNameRequired') }); vault.value = await window.electron.ipcRenderer.invoke('mt::kdbx::create-group', filePath.value, parentId, value); expandAllGroups() } catch { /* cancelled */ } }
const renameGroup = async(group: FlatGroup): Promise<void> => { if (!filePath.value) return; groupMenu.value = null; try { const { value } = await ElMessageBox.prompt(t('kdbx.groupName'), t('kdbx.renameGroup'), { ...messageBoxTheme, inputValue: group.name, confirmButtonText: t('common.ok'), cancelButtonText: t('common.cancel'), inputPattern: /\S/, inputErrorMessage: t('kdbx.groupNameRequired') }); vault.value = await window.electron.ipcRenderer.invoke('mt::kdbx::rename-group', filePath.value, group.id, value) } catch { /* cancelled */ } }
const deleteGroup = async(group: FlatGroup): Promise<void> => { if (!filePath.value) return; groupMenu.value = null; try { await ElMessageBox.confirm(t('kdbx.deleteGroupConfirm', { name: group.name }), t('kdbx.delete'), { ...messageBoxTheme, confirmButtonText: t('common.ok'), cancelButtonText: t('common.cancel'), type: 'warning' }); vault.value = await window.electron.ipcRenderer.invoke('mt::kdbx::delete-group', filePath.value, group.id); clearEntrySelection(); if (selectedGroup.value === group.id) selectAll() } catch { /* cancelled */ } }
const emptyRecycleBin = async(): Promise<void> => { if (!filePath.value) return; try { await ElMessageBox.confirm(t('kdbx.emptyRecycleBinConfirm'), t('kdbx.emptyRecycleBin'), { ...messageBoxTheme, confirmButtonText: t('kdbx.deletePermanently'), cancelButtonText: t('common.cancel'), type: 'warning' }); vault.value = await window.electron.ipcRenderer.invoke('mt::kdbx::empty-recycle-bin', filePath.value); clearEntrySelection(); selectedEntryId.value = ''; clearDraft() } catch { /* cancelled */ } }
const createEntry = async(): Promise<void> => { if (!filePath.value || selectedRecycle.value) return; if (editing.value) { try { await ElMessageBox.confirm(t('kdbx.discardChangesConfirm'), t('kdbx.cancelEdit'), { ...messageBoxTheme, confirmButtonText: t('common.ok'), cancelButtonText: t('common.cancel'), type: 'warning' }) } catch { return } clearEditDraft() } const groupId = selectedGroup.value || flatGroups.value[0]?.id || ''; if (!groupId) return; editDraft.value = { id: '', groupId, title: '', username: '', url: '', notes: '', tags: [], updatedAt: null, groupPath: groupPathFor(groupId), isRecycleBin: false, fields: [], attachments: [], historyCount: 0, history: [] }; passwordField.value = ''; totpField.value = ''; editEntryType.value = 'Normal'; clearCustomFields(); attachmentDrafts.value = []; newEntry.value = true; editing.value = true }
const beginEdit = (): void => {
  if (!draft.value) return
  editDraft.value = structuredClone(toRaw(draft.value))
  passwordField.value = viewPassword.value
  editEntryType.value = (getEntryUrlType(editDraft.value) as any) || 'Normal'
  loadCustomFields(editDraft.value)
  loadAttachments(editDraft.value)
  newEntry.value = false
  editing.value = true
}
const cancelEdit = (): void => { clearEditDraft() }
const saveEntry = async(): Promise<void> => { if (!filePath.value || !editDraft.value || savingEntry.value) return; savingEntry.value = true; try { const detail = newEntry.value ? await window.electron.ipcRenderer.invoke('mt::kdbx::create-entry', filePath.value, toInput()) : await window.electron.ipcRenderer.invoke('mt::kdbx::commit-entry', filePath.value, editDraft.value.id, toInput()); draft.value = detail; selectedEntryId.value = detail.id; showPassword.value = false; clearEditDraft(); clearEntrySelection(); await refresh(); ElMessage.success(t('kdbx.saved')) } catch (err) { ElMessage.error(errorMessage(err, t('kdbx.saveFailed'))) } finally { savingEntry.value = false } }
const deleteEntry = async(): Promise<void> => { if (!filePath.value || !draft.value) return; const permanent = draft.value.isRecycleBin; try { await ElMessageBox.confirm(permanent ? t('kdbx.deletePermanentlyConfirm') : t('kdbx.moveToRecycleBinConfirm'), permanent ? t('kdbx.deletePermanently') : t('kdbx.delete'), { ...messageBoxTheme, confirmButtonText: t('common.ok'), cancelButtonText: t('common.cancel'), type: 'warning' }); vault.value = await window.electron.ipcRenderer.invoke('mt::kdbx::delete-entry', filePath.value, draft.value.id); clearEntrySelection(); clearDraft() } catch { /* cancelled */ } }
const restoreEntry = async(): Promise<void> => { if (!filePath.value || !draft.value?.isRecycleBin) return; try { vault.value = await window.electron.ipcRenderer.invoke('mt::kdbx::restore-entry', filePath.value, draft.value.id); clearEntrySelection(); clearDraft(); ElMessage.success(t('kdbx.restoreHistory')) } catch (error) { ElMessage.error(errorMessage(error, t('kdbx.saveFailed'))) } }
const restoreSelectedEntries = async(): Promise<void> => { if (!filePath.value || !selectedRecycle.value || selectedEntryIds.value.size === 0) return; try { vault.value = await window.electron.ipcRenderer.invoke('mt::kdbx::restore-entries', filePath.value, [...selectedEntryIds.value]); clearEntrySelection(); clearDraft(); ElMessage.success(t('kdbx.restoreHistory')) } catch (error) { ElMessage.error(errorMessage(error, t('kdbx.saveFailed'))) } }
const addCustomField = (): void => { if (!editDraft.value) return; customFields.value.push({ id: `custom-${nextCustomFieldId++}`, key: '', value: '', protected: false }) }
const removeCustomField = (id: string): void => { customFields.value = customFields.value.filter(field => field.id !== id) }
const addAttachment = async(event: Event): Promise<void> => { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!editDraft.value || !file) return; try { attachmentDrafts.value.push({ id: `attachment-${nextAttachmentDraftId++}`, name: file.name, size: file.size, data: await file.arrayBuffer(), removed: false }); ElMessage.success(t('kdbx.attachmentAdded')) } catch (err) { ElMessage.error(errorMessage(err, t('kdbx.attachmentFailed'))) } finally { input.value = '' } }
const removeAttachment = async(attachment: AttachmentDraft): Promise<void> => { try { await ElMessageBox.confirm(t('kdbx.removeAttachmentConfirm', { name: attachment.name }), t('kdbx.removeAttachment'), { ...messageBoxTheme, confirmButtonText: t('common.ok'), cancelButtonText: t('common.cancel'), type: 'warning' }); if (attachment.data) attachmentDrafts.value = attachmentDrafts.value.filter(item => item.id !== attachment.id); else attachment.removed = true } catch { /* cancelled */ } }
const readAttachment = async(attachment: AttachmentDraft): Promise<ArrayBuffer> => { if (attachment.data) return attachment.data; if (!filePath.value || !draft.value) throw new Error(t('kdbx.attachmentFailed')); return window.electron.ipcRenderer.invoke('mt::kdbx::read-attachment', filePath.value, draft.value.id, attachment.name) }
const attachmentMimeType = (name: string): string => { const extension = name.split('.').pop()?.toLowerCase(); return ({ avif: 'image/avif', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp' })[extension || ''] || 'application/octet-stream' }
const downloadAttachment = async(attachment: AttachmentDraft): Promise<void> => { try { const data = await readAttachment(attachment); const link = document.createElement('a'); const url = URL.createObjectURL(new Blob([data], { type: attachmentMimeType(attachment.name) })); link.href = url; link.download = attachment.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0) } catch (err) { ElMessage.error(errorMessage(err, t('kdbx.attachmentFailed'))) } }
const isPreviewable = (attachment: AttachmentDraft): boolean => /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(attachment.name)
const previewAttachment = async(attachment: AttachmentDraft): Promise<void> => { try { clearAttachmentPreview(); if (attachment.data) attachmentPreviewUrl.value = URL.createObjectURL(new Blob([attachment.data], { type: attachmentMimeType(attachment.name) })); else { if (!filePath.value || !draft.value) throw new Error(t('kdbx.attachmentFailed')); attachmentPreviewUrl.value = await window.electron.ipcRenderer.invoke('mt::kdbx::preview-attachment', filePath.value, draft.value.id, attachment.name) } attachmentPreviewName.value = attachment.name; attachmentPreviewVisible.value = true } catch (err) { ElMessage.error(errorMessage(err, t('kdbx.attachmentFailed'))) } }
const copyTotpItem = (item: ViewTotpItem): void => {
  window.electron.clipboard.writeText(item.result.code)
  ElMessage.success(t('kdbx.totpCopied'))
}
const copyText = (text: string): void => {
  if (!text) return
  window.electron.clipboard.writeText(text)
  ElMessage.success(t('kdbx.copied'))
}
const isCustomFieldRevealed = (key: string): boolean => revealedCustomFields.value.has(key)
const toggleCustomFieldReveal = (key: string): void => {
  const next = new Set(revealedCustomFields.value)
  next.has(key) ? next.delete(key) : next.add(key)
  revealedCustomFields.value = next
}
const getFieldTotp = (val: string): TotpGenerationResult | null => {
  if (!val || typeof val !== 'string') return null
  if (!isTotpValue(val) && !val.startsWith('otpauth://') && !val.startsWith('otpauth-migration://')) return null
  return generateTotp(val, now.value)
}
const openQrScanner = (): void => {
  qrScanDialogRef.value?.open()
}
const openBatchImport = (): void => {
  const existingKeys = customFields.value.map(f => f.key.trim()).filter(Boolean)
  batchImportDialogRef.value?.open(existingKeys)
}
const onBatchImport = (
  items: Array<{ key: string; value: string; protected: boolean }>,
  mode: 'append' | 'replace'
): void => {
  if (mode === 'replace') {
    const nonTotpFields = customFields.value.filter(f => !isTotpKey(f.key) && !isTotpValue(f.value))
    const importedCustom = items.map(item => ({
      id: `custom-${nextCustomFieldId++}`,
      key: item.key,
      value: item.value,
      protected: item.protected
    }))
    customFields.value = [...nonTotpFields, ...importedCustom]
  } else {
    const importedCustom = items.map(item => ({
      id: `custom-${nextCustomFieldId++}`,
      key: item.key,
      value: item.value,
      protected: item.protected
    }))
    customFields.value.push(...importedCustom)
  }
  ElMessage.success(t('kdbx.batchImportSuccess', { count: items.length }))
}
const onQrCodeSelected = (result: { secret: string; uri: string; issuer?: string; account?: string; label?: string }): void => {
  totpField.value = result.secret
  if (editDraft.value) {
    if (!editDraft.value.title && (result.issuer || result.label)) {
      editDraft.value.title = result.issuer || result.label || ''
    }
    if (!editDraft.value.username && result.account) {
      editDraft.value.username = result.account
    }
  }
  ElMessage.success(t('kdbx.totpParsed'))
}
const copyEntry = (): void => {
  if (!draft.value) return
  const totpLines = viewTotpList.value.map(item => `${item.label || t('kdbx.totp')}: ${item.result.code}`)
  const lines = [
    `${t('kdbx.title')}: ${draft.value.title}`,
    `${t('kdbx.username')}: ${draft.value.username}`,
    `${t('kdbx.password')}: ${viewPassword.value}`,
    ...totpLines,
    `${t('kdbx.url')}: ${draft.value.url}`,
    `${t('kdbx.tags')}: ${draft.value.tags.join(', ')}`,
    `${t('kdbx.notes')}: ${draft.value.notes}`,
    ...viewCustomFields.value.map(field => `${field.key}: ${field.value}`)
  ]
  window.electron.clipboard.writeText(lines.join('\n'))
  ElMessage.success(t('kdbx.copied'))
}
const exportEntries = async(entryIds: string[]): Promise<void> => { if (!filePath.value || entryIds.length === 0 || exportingEntries.value) return; try { const { value } = await ElMessageBox.prompt(t('kdbx.extractionCode'), t('kdbx.exportEntries'), { ...messageBoxTheme, confirmButtonText: t('kdbx.export'), cancelButtonText: t('common.cancel'), inputType: 'password', inputPattern: KDBX_PASSWORD_PATTERN, inputErrorMessage: t('kdbx.passwordRule') }); exportingEntries.value = true; const exported = await window.electron.ipcRenderer.invoke('mt::kdbx::export-entries', filePath.value, entryIds, value); if (exported) { clearEntrySelection(); ElMessage.success(t('kdbx.exported')) } } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(errorMessage(error, t('kdbx.exportFailed'))) } finally { exportingEntries.value = false } }
const exportSelectedEntries = (): Promise<void> => exportEntries([...selectedEntryIds.value])
const importEntries = async(groupId: string): Promise<void> => { if (!filePath.value) return; groupMenu.value = null; try { const importFilePath = await window.electron.ipcRenderer.invoke('mt::kdbx::select-import-file'); if (!importFilePath) return; const { value } = await ElMessageBox.prompt(t('kdbx.extractionCode'), t('kdbx.importEntries'), { ...messageBoxTheme, confirmButtonText: t('kdbx.import'), cancelButtonText: t('common.cancel'), inputType: 'password', inputPattern: /\S/, inputErrorMessage: t('kdbx.extractionCodeRequired') }); vault.value = await window.electron.ipcRenderer.invoke('mt::kdbx::import-entries', filePath.value, groupId, importFilePath, value); clearEntrySelection(); expandAllGroups(); ElMessage.success(t('kdbx.imported')) } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(errorMessage(error, t('kdbx.importFailed'))) } }
const formatSize = (size: number): string => size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`
const viewHistory = async(historyIndex: number): Promise<void> => { if (!filePath.value || !draft.value) return; try { historyPreview.value = await window.electron.ipcRenderer.invoke('mt::kdbx::history-entry', filePath.value, draft.value.id, historyIndex); historyDialogVisible.value = true } catch (err) { ElMessage.error(errorMessage(err, t('kdbx.historyFailed'))) } }
const restoreHistory = async(historyIndex: number): Promise<void> => { if (!filePath.value || !draft.value) return; try { await ElMessageBox.confirm(t('kdbx.restoreHistoryConfirm'), t('kdbx.restoreHistory'), { ...messageBoxTheme, confirmButtonText: t('common.ok'), cancelButtonText: t('common.cancel'), type: 'warning' }); const detail = await window.electron.ipcRenderer.invoke('mt::kdbx::restore-history', filePath.value, draft.value.id, historyIndex); draft.value = detail; showPassword.value = false; clearEntrySelection(); await refresh(); ElMessage.success(t('kdbx.restored')) } catch { /* cancelled */ } }
const deleteHistory = async(historyIndex: number): Promise<void> => { if (!filePath.value || !draft.value) return; try { await ElMessageBox.confirm(t('kdbx.deleteHistoryConfirm'), t('kdbx.deleteHistory'), { ...messageBoxTheme, confirmButtonText: t('kdbx.deletePermanently'), cancelButtonText: t('common.cancel'), type: 'warning' }); draft.value = await window.electron.ipcRenderer.invoke('mt::kdbx::delete-history', filePath.value, draft.value.id, historyIndex); clearEntrySelection(); await refresh() } catch { /* cancelled */ } }
const activate = async(pathname: string): Promise<void> => { locked.value = true; vault.value = null; clearDraft(); password.value = ''; unlockPasswordVisible.value = false; error.value = ''; selectedGroup.value = ''; selectedTag.value = ''; selectedUntagged.value = false; selectedRecycle.value = false; if (!pathname) return; const value = await window.electron.ipcRenderer.invoke('mt::kdbx::snapshot', pathname) as KdbxVaultSnapshot | null; if (value && pathname === filePath.value) { vault.value = value; locked.value = false; expandAllGroups() } }
watch([query, searchFields], clearEntrySelection, { deep: true })
watch(filePath, next => { void activate(next) }, { immediate: true })
onMounted(() => {
  window.electron.ipcRenderer.on('mt::kdbx-lock', lock)
  totpTimer = window.setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onBeforeUnmount(() => {
  window.electron.ipcRenderer.removeAllListeners('mt::kdbx-lock')
  if (totpTimer !== null) {
    clearInterval(totpTimer)
    totpTimer = null
  }
  clearAttachmentPreview()
})
</script>

<style scoped>
.kdbx-surface { position: relative; flex: 1; min-height: 0; display: grid; grid-template-columns: 228px minmax(230px, .72fr) minmax(350px, 1.28fr); overflow: hidden; background: var(--editorBgColor); color: var(--editorColor); }.kdbx-surface :deep(.el-input__wrapper), .kdbx-surface :deep(.el-select__wrapper), .kdbx-surface :deep(.el-textarea__inner) { background: var(--inputBgColor) !important; box-shadow: 0 0 0 1px var(--floatBorderColor) inset !important; color: var(--editorColor) !important; }.kdbx-surface :deep(input.el-input__inner) { border: 0 !important; background: transparent !important; box-shadow: none !important; color: var(--editorColor80) !important; padding: 0 !important; }.kdbx-surface :deep(.el-input__inner::placeholder), .kdbx-surface :deep(.el-textarea__inner::placeholder) { color: var(--editorColor50) !important; }.kdbx-unlock { grid-column: 1 / -1; display: grid; place-items: center; }.kdbx-unlock-panel { width: min(420px, calc(100vw - 48px)); display: grid; gap: 12px; text-align: center; }.kdbx-unlock-panel h2, .kdbx-unlock-panel p { margin: 0; }.kdbx-unlock-panel h2 { font-size: 24px; }.kdbx-unlock-input { min-width: 0; }.kdbx-unlock-input :deep(.el-input__suffix) { display: flex; align-items: center; gap: 2px; }.kdbx-unlock-action { display: inline-flex; width: 26px; height: 26px; align-items: center; justify-content: center; border: 0; border-radius: 3px; background: transparent; color: var(--editorColor50); cursor: pointer; }.kdbx-unlock-action:hover:not(:disabled) { background: var(--floatHoverColor); color: var(--themeColor); }.kdbx-unlock-action:disabled { cursor: not-allowed; opacity: .45; }.kdbx-return-icon { font-size: 19px; line-height: 1; }.kdbx-error { color: var(--dangerColor, #d14343); }
.kdbx-groups, .kdbx-entries { min-height: 0; border-right: 1px solid var(--itemBgColor); }.kdbx-groups { display: flex; flex-direction: column; overflow: hidden; }.kdbx-entries { overflow: auto; }.kdbx-pane-title, .kdbx-toolbar, .kdbx-detail-title { min-height: 42px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 10px; border-bottom: 1px solid var(--itemBgColor); }.kdbx-vault-title > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.kdbx-vault-title > div, .kdbx-detail-title > div:last-child { display: flex; }
button { border: 0; background: transparent; color: inherit; cursor: pointer; } button:disabled { cursor: not-allowed; opacity: .45; }.kdbx-toolbar > button, .kdbx-pane-title button, .kdbx-detail-title button, .kdbx-section-title button, .kdbx-more { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 28px; height: 28px; }.kdbx-toolbar > button:hover, .kdbx-toolbar > button.active, .kdbx-pane-title button:hover, .kdbx-detail-title button:hover, .kdbx-section-title button:hover, .kdbx-more:hover { background: var(--floatHoverColor); }
.kdbx-nav-item { width: 100%; min-height: 34px; display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 7px; align-items: center; padding: 6px 12px; text-align: left; }.kdbx-nav-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.kdbx-nav-item em, .kdbx-tree-label em { color: var(--editorColor50); font-size: 12px; font-style: normal; }.kdbx-nav-item.active, .kdbx-tree-row.active { background: var(--floatHoverColor); color: var(--themeColor); }.kdbx-tree { flex: 1; min-height: 0; overflow: auto; padding: 6px 0; }.kdbx-all-root { display: flex; align-items: stretch; padding-left: 8px; }.kdbx-all-root .kdbx-nav-item { min-width: 0; padding-left: 3px; padding-right: 40px; }.kdbx-all-toggle { display: inline-flex; flex: 0 0 18px; width: 18px; align-items: center; justify-content: center; color: var(--editorColor50); }.kdbx-all-toggle:hover { background: var(--floatHoverColor); color: var(--editorColor); }.kdbx-all-children { padding-left: 20px; }.kdbx-tags { padding-bottom: 6px; margin-bottom: 6px; border-bottom: 1px solid var(--itemBgColor); }.kdbx-tag { padding-left: 9px; padding-right: 40px; color: var(--editorColor50); }.kdbx-tree-row { display: flex; align-items: center; min-height: 30px; padding-right: 7px; }.kdbx-tree-label { min-width: 0; flex: 1; display: grid; grid-template-columns: 17px minmax(0, 1fr) auto; gap: 6px; align-items: center; padding: 5px 3px; text-align: left; }.kdbx-tree-label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.kdbx-tree-toggle { display: inline-flex; width: 18px; justify-content: center; color: var(--editorColor50); }.kdbx-more { visibility: hidden; }.kdbx-tree-row:hover { background: var(--floatHoverColor); }.kdbx-tree-row:hover .kdbx-more, .kdbx-recycle:hover .kdbx-more { visibility: visible; }.kdbx-recycle { position: relative; display: flex; border-top: 1px solid var(--itemBgColor); }.kdbx-recycle .kdbx-nav-item { padding-right: 34px; }.kdbx-recycle > .kdbx-more { position: absolute; right: 5px; top: 3px; }
.kdbx-toolbar { position: sticky; top: 0; z-index: 1; background: var(--editorBgColor); }.kdbx-toolbar .el-input { min-width: 0; }.kdbx-export-selected { position: relative; }.kdbx-export-selected sup { position: absolute; top: 1px; right: 1px; min-width: 12px; height: 12px; border-radius: 6px; background: var(--themeColor); color: var(--editorBgColor); font-size: 9px; line-height: 12px; text-align: center; }.kdbx-search-options { display: grid; gap: 7px; padding: 10px 12px; border-bottom: 1px solid var(--itemBgColor); background: var(--floatBgColor); font-size: 12px; }.kdbx-search-options :deep(.el-checkbox-group) { display: flex; flex-wrap: wrap; gap: 10px; }.kdbx-search-options :deep(.el-checkbox) { margin-right: 0; }.kdbx-entry-row { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; gap: 8px; align-items: center; min-height: 56px; padding: 0 12px; border-bottom: 1px solid var(--itemBgColor); }.kdbx-entry-select { display: grid; gap: 3px; min-width: 0; min-height: 56px; padding: 9px 0; text-align: left; }.kdbx-entry-more { visibility: hidden; display: inline-flex; width: 28px; height: 28px; align-items: center; justify-content: center; }.kdbx-entry-row:hover .kdbx-entry-more, .kdbx-entry-row.active .kdbx-entry-more { visibility: visible; }.kdbx-entry-more:hover { background: var(--floatHoverColor); }.kdbx-entry-row:hover, .kdbx-entry-row.active { background: var(--floatHoverColor); }.kdbx-entry-title, .kdbx-entry-username { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.kdbx-entry-title { font-weight: 600; display: flex; align-items: center; gap: 6px; }.kdbx-entry-username { color: var(--editorColor50); font-size: 12px; }
.kdbx-entry-actions { display: flex; align-items: center; gap: 2px; }
.kdbx-entry-actions .kdbx-entry-terminal-btn { visibility: hidden; display: inline-flex; width: 28px; height: 28px; align-items: center; justify-content: center; color: var(--themeColor, #409eff); border-radius: 4px; transition: all 0.2s; }
.kdbx-entry-row:hover .kdbx-entry-actions .kdbx-entry-terminal-btn, .kdbx-entry-row.active .kdbx-entry-actions .kdbx-entry-terminal-btn { visibility: visible; }
.kdbx-entry-actions .kdbx-entry-terminal-btn:hover { background: var(--floatHoverColor); transform: scale(1.1); }
.kdbx-terminal-direct-btn { display: inline-flex; width: 28px; height: 28px; align-items: center; justify-content: center; color: var(--themeColor, #409eff); border-radius: 4px; transition: all 0.2s; }
.kdbx-terminal-direct-btn:hover { background: var(--floatHoverColor); transform: scale(1.1); }

.kdbx-proto-badge { display: inline-flex; align-items: center; font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 3px; line-height: 1.2; vertical-align: middle; text-transform: uppercase; flex: 0 0 auto; }
.kdbx-proto-badge.proto-ssh { background: rgba(64, 158, 255, 0.15); color: #409eff; border: 1px solid rgba(64, 158, 255, 0.35); }
.kdbx-proto-badge.proto-telnet { background: rgba(230, 162, 60, 0.15); color: #e6a23c; border: 1px solid rgba(230, 162, 60, 0.35); }
.kdbx-proto-badge.proto-series, .kdbx-proto-badge.proto-serial { background: rgba(103, 194, 58, 0.15); color: #67c23a; border: 1px solid rgba(103, 194, 58, 0.35); }
.kdbx-proto-badge.proto-rawrocket, .kdbx-proto-badge.proto-rawsocket { background: rgba(144, 147, 153, 0.18); color: #909399; border: 1px solid rgba(144, 147, 153, 0.35); }

.kdbx-detail { min-width: 0; overflow: auto; padding: 0 16px 24px; }.kdbx-detail label { display: grid; gap: 6px; margin-top: 14px; font-size: 12px; color: var(--editorColor50); }.kdbx-detail :deep(.el-input__wrapper), .kdbx-detail :deep(.el-select__wrapper), .kdbx-detail :deep(.el-textarea__inner) { background: var(--inputBgColor); box-shadow: 0 0 0 1px var(--floatBorderColor) inset; color: var(--editorColor); }.kdbx-detail :deep(.el-input__inner), .kdbx-detail :deep(.el-textarea__inner), .kdbx-detail :deep(.el-select__selected-item) { color: var(--editorColor80); }.kdbx-detail-title { position: sticky; top: 0; z-index: 2; margin: 0 -16px; padding: 0 16px; background: var(--editorBgColor); }.kdbx-breadcrumb { min-width: 0; display: flex; overflow: hidden; color: var(--editorColor50); font-size: 12px; white-space: nowrap; }.kdbx-breadcrumb span { overflow: hidden; text-overflow: ellipsis; }.kdbx-breadcrumb span + span::before { content: '/'; padding: 0 5px; color: var(--editorColor50); }
.kdbx-section { margin-top: 18px; border-top: 1px solid var(--itemBgColor); padding-top: 10px; }.kdbx-section-title { display: flex; align-items: center; justify-content: space-between; min-height: 28px; }.kdbx-custom-field { display: grid; grid-template-columns: minmax(110px, .6fr) minmax(150px, 1fr) 28px 28px; gap: 6px; align-items: center; margin-top: 7px; }.kdbx-custom-field :deep(.el-checkbox) { display: inline-flex; justify-self: center; width: 28px; height: 28px; margin: 0; }.kdbx-custom-field :deep(.el-checkbox__label) { display: inline-flex; padding-left: 4px; color: var(--editorColor50); }.kdbx-file-input { display: none; }.kdbx-section-empty { padding: 8px 0; color: var(--editorColor50); font-size: 12px; }.kdbx-entry-view { display: grid; grid-template-columns: 116px minmax(0, 1fr); gap: 10px 14px; margin: 16px 0 0; }.kdbx-entry-view dt { color: var(--editorColor50); font-size: 12px; }.kdbx-entry-view dd { min-width: 0; margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }.kdbx-custom-field-view { margin-top: 10px; }.kdbx-tag-chip { display: inline-flex; margin: 0 5px 4px 0; padding: 2px 7px; border: 1px solid var(--floatBorderColor); border-radius: 3px; background: var(--floatHoverColor); color: var(--editorColor); font-size: 12px; }.kdbx-attachment { display: flex; align-items: center; gap: 4px; min-height: 32px; }.kdbx-attachment > div { min-width: 0; flex: 1; display: grid; grid-template-columns: 17px minmax(0, 1fr) auto; gap: 6px; align-items: center; text-align: left; }.kdbx-attachment span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.kdbx-attachment em { color: var(--editorColor50); font-size: 12px; font-style: normal; }.kdbx-attachment > button { display: inline-flex; width: 28px; height: 28px; align-items: center; justify-content: center; }.kdbx-attachment:hover { background: var(--floatHoverColor); }.kdbx-attachment-preview { display: block; width: auto; max-width: 100%; height: auto; max-height: calc(100vh - 180px); margin: 0 auto; object-fit: contain; }
.kdbx-history-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; gap: 8px; align-items: center; min-height: 43px; border-bottom: 1px solid var(--itemBgColor); }.kdbx-history-row > div { min-width: 0; display: grid; gap: 2px; }.kdbx-history-row strong, .kdbx-history-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.kdbx-history-row span { color: var(--editorColor50); font-size: 11px; }.kdbx-history-row > button { padding: 4px 6px; color: var(--themeColor); font-size: 12px; }.kdbx-history-delete { display: inline-flex; width: 28px; height: 28px; align-items: center; justify-content: center; padding: 0 !important; color: var(--editorColor50) !important; }.kdbx-history-row > button:hover { background: var(--floatHoverColor); }.kdbx-empty { display: grid; place-items: center; min-height: 120px; color: var(--editorColor50); }.kdbx-group-menu { position: fixed; z-index: 30; display: grid; min-width: 142px; padding: 4px; border: 1px solid var(--floatBorderColor); background: var(--floatBgColor); box-shadow: 0 5px 16px rgb(0 0 0 / 18%); }.kdbx-group-menu button { display: grid; grid-template-columns: 18px 1fr; gap: 7px; align-items: center; padding: 7px; text-align: left; font-size: 13px; }.kdbx-group-menu button:hover { background: var(--floatHoverColor); }.kdbx-move-tree { min-height: 220px; max-height: 420px; overflow: auto; padding: 4px 0; border: 1px solid var(--floatBorderColor); border-radius: 6px; background: var(--sideBarBgColor); }.kdbx-move-tree-row { display: flex; align-items: center; gap: 8px; min-width: 0; }.kdbx-move-tree-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.kdbx-move-tree :deep(.el-tree) { background: transparent; color: var(--editorColor); }.kdbx-move-tree :deep(.el-tree-node__content) { height: 30px; }.kdbx-move-tree :deep(.el-tree-node__content:hover), .kdbx-move-tree :deep(.el-tree-node.is-current > .el-tree-node__content) { background: var(--floatHoverColor); }.kdbx-history-preview { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 10px 14px; margin: 0; }.kdbx-history-preview dt { color: var(--editorColor50); }.kdbx-history-preview dd { min-width: 0; margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }.kdbx-edit-form { display: grid; gap: 14px; }.kdbx-edit-form > label { display: grid; gap: 6px; color: var(--editorColor50); font-size: 12px; }.kdbx-edit-form :deep(.el-input__wrapper), .kdbx-edit-form :deep(.el-select__wrapper), .kdbx-edit-form :deep(.el-textarea__inner) { background: var(--inputBgColor); box-shadow: 0 0 0 1px var(--floatBorderColor) inset; color: var(--editorColor); }.kdbx-edit-form :deep(.el-input__inner), .kdbx-edit-form :deep(.el-textarea__inner), .kdbx-edit-form :deep(.el-select__selected-item) { color: var(--editorColor80); }.kdbx-password-rule { margin-top: 6px; color: var(--editorColor50); font-size: 12px; line-height: 1.4; }.kdbx-password-rule.error { color: var(--deleteColor, #ff6969) !important; }:global(.kdbx-reset-password-dialog .el-input.is-password-invalid .el-input__wrapper) { box-shadow: 0 0 0 1px var(--deleteColor, #ff6969) inset !important; }.kdbx-password-view { display: flex; align-items: center; gap: 6px; }.kdbx-password-view > span { min-width: 0; flex: 1; }.kdbx-password-view > button { display: inline-flex; width: 28px; height: 28px; align-items: center; justify-content: center; color: var(--editorColor50); }.kdbx-password-view > button:hover { background: var(--floatHoverColor); color: var(--editorColor); }
.kdbx-totp-view { display: flex; align-items: center; gap: 10px; }
.kdbx-totp-code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 18px; font-weight: 700; letter-spacing: 2px; color: var(--themeColor); }
.kdbx-totp-timer { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--editorColor50); }
.kdbx-totp-circle { width: 18px; height: 18px; transform: rotate(-90deg); }
.kdbx-totp-circle-bg { fill: none; stroke: var(--floatBorderColor); stroke-width: 3.5; }
.kdbx-totp-circle-progress { fill: none; stroke: var(--themeColor); stroke-width: 3.5; stroke-linecap: round; transition: stroke-dasharray 0.3s ease; }
.kdbx-totp-seconds { min-width: 22px; font-family: monospace; }
.kdbx-totp-copy-btn { display: inline-flex; width: 28px; height: 28px; align-items: center; justify-content: center; color: var(--editorColor50); border-radius: 4px; }
.kdbx-totp-copy-btn:hover { background: var(--floatHoverColor); color: var(--editorColor); }
.kdbx-totp-input-group { display: grid; gap: 6px; }
.kdbx-totp-label { display: grid; gap: 6px; color: var(--editorColor50); font-size: 12px; }
.kdbx-totp-input-row { display: flex; align-items: center; gap: 8px; }
.kdbx-totp-input-row .el-input { flex: 1; }
.kdbx-scan-btn { display: inline-flex; width: 32px; height: 32px; align-items: center; justify-content: center; flex: 0 0 auto; border-radius: 4px; background: var(--inputBgColor); border: 1px solid var(--floatBorderColor); color: var(--editorColor80); cursor: pointer; transition: all 0.2s; }
.kdbx-scan-btn:hover { background: var(--floatHoverColor); color: var(--themeColor); border-color: var(--themeColor); }
.kdbx-totp-preview { font-size: 12px; color: var(--editorColor60, #888); padding: 4px 8px; background: var(--floatHoverColor); border-radius: 4px; display: inline-flex; align-items: center; }
.kdbx-totp-preview strong { font-family: monospace; font-size: 13px; letter-spacing: 1px; color: var(--themeColor); margin: 0 4px; }
:global(.el-popper.is-dark) { background: var(--floatBgColor) !important; border: 1px solid var(--floatBorderColor) !important; box-shadow: 0 3px 8px var(--floatShadow) !important; color: var(--editorColor) !important; }:global(.el-popper.is-dark .el-popper__arrow::before) { background: var(--floatBgColor) !important; border-color: var(--floatBorderColor) !important; } @media (max-width: 900px) { .kdbx-surface { grid-template-columns: 190px minmax(0, 1fr); }.kdbx-detail { display: none; } }
:global(.kdbx-dialog), :global(.kdbx-message-box) { --el-bg-color: var(--floatBgColor); --el-bg-color-overlay: var(--floatBgColor); --el-fill-color-blank: var(--floatBgColor); --el-fill-color-light: var(--floatHoverColor); --el-fill-color: var(--inputBgColor); --el-text-color-primary: var(--editorColor); --el-text-color-regular: var(--editorColor80); --el-text-color-secondary: var(--editorColor50); --el-border-color: var(--floatBorderColor); --el-border-color-light: var(--floatBorderColor); background: var(--floatBgColor) !important; border-color: var(--floatBorderColor) !important; color: var(--editorColor) !important; }
:global(.kdbx-dialog .el-dialog__title), :global(.kdbx-dialog .el-dialog__body), :global(.kdbx-message-box .el-message-box__title), :global(.kdbx-message-box .el-message-box__content) { color: var(--editorColor) !important; }
:global(.kdbx-dialog .el-dialog__close), :global(.kdbx-message-box .el-message-box__headerbtn) { color: var(--editorColor50) !important; }
:global(.kdbx-dialog .el-input__wrapper), :global(.kdbx-dialog .el-select__wrapper), :global(.kdbx-dialog .el-textarea__inner), :global(.kdbx-message-box .el-input__wrapper) { background: var(--inputBgColor) !important; box-shadow: 0 0 0 1px var(--floatBorderColor) inset !important; }
:global(.kdbx-dialog input.el-input__inner), :global(.kdbx-message-box input.el-input__inner) { border: 0 !important; background: transparent !important; box-shadow: none !important; color: var(--editorColor80) !important; padding: 0 !important; }
:global(.kdbx-dialog .el-input__inner::placeholder), :global(.kdbx-message-box .el-input__inner::placeholder) { color: var(--editorColor50) !important; }
:global(.kdbx-dialog .el-button--default), :global(.kdbx-message-box .el-button--default) { background: var(--buttonBgColor) !important; border-color: var(--floatBorderColor) !important; color: var(--buttonFontColor) !important; }
:global(.kdbx-dialog .el-button--primary), :global(.kdbx-message-box .el-button--primary) { background: var(--buttonPrimaryBgColor) !important; border-color: var(--buttonPrimaryBorder) !important; color: var(--buttonPrimaryFontColor) !important; }
:global(.kdbx-dialog .el-tag) { background: var(--floatHoverColor) !important; border-color: var(--floatBorderColor) !important; color: var(--editorColor80) !important; }
:global(.kdbx-dialog .el-tag .el-tag__close) { background: transparent !important; color: var(--editorColor50) !important; }
:global(.kdbx-dialog .el-tag .el-tag__close:hover) { background: var(--buttonBgColorHover) !important; color: var(--editorColor) !important; }
:global(.kdbx-select-popper) { --el-bg-color: var(--floatBgColor); --el-fill-color-blank: var(--floatBgColor); --el-fill-color-light: var(--floatHoverColor); --el-text-color-primary: var(--editorColor); --el-text-color-regular: var(--editorColor80); --el-text-color-secondary: var(--editorColor50); --el-border-color: var(--floatBorderColor); --el-border-color-light: var(--floatBorderColor); background: var(--floatBgColor) !important; border-color: var(--floatBorderColor) !important; color: var(--editorColor) !important; }
:global(.kdbx-select-popper .el-select-dropdown__wrap), :global(.kdbx-select-popper .el-select-dropdown__list), :global(.kdbx-select-popper .el-select-dropdown__empty) { background: var(--floatBgColor) !important; color: var(--editorColor50) !important; }
:global(.kdbx-select-popper .el-select-dropdown__item) { color: var(--editorColor80) !important; }
:global(.kdbx-select-popper .el-select-dropdown__item.hover), :global(.kdbx-select-popper .el-select-dropdown__item:hover) { background: var(--floatHoverColor) !important; }
.kdbx-section-actions { display: flex; align-items: center; gap: 4px; }
.kdbx-field-val-wrap { position: relative; display: flex; align-items: center; width: 100%; }
.kdbx-field-val-wrap .el-input { width: 100%; }
.kdbx-field-totp-badge { position: absolute; right: 30px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; font-weight: 700; color: var(--themeColor); background: var(--floatBgColor); padding: 1px 5px; border-radius: 3px; border: 1px solid var(--floatBorderColor); pointer-events: none; }
.kdbx-totp-section { margin-top: 18px; }
.kdbx-totp-filter { width: 140px; }
.kdbx-totp-filter :deep(.el-input__wrapper) { height: 26px; }
.kdbx-totp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; margin-top: 10px; }
.kdbx-totp-card { display: flex; flex-direction: column; gap: 6px; padding: 10px; border-radius: 6px; background: var(--sideBarBgColor); border: 1px solid var(--floatBorderColor); }
.kdbx-totp-card-header { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.kdbx-totp-card-name { font-size: 12px; font-weight: 600; color: var(--editorColor80); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kdbx-totp-card-body { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.kdbx-totp-card-code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 16px; font-weight: 700; letter-spacing: 1px; color: var(--themeColor); }
:global(.kdbx-select-popper .el-popper__arrow::before) { background: var(--floatBgColor) !important; border-color: var(--floatBorderColor) !important; }
.kdbx-custom-field-val { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-width: 0; }
.kdbx-custom-field-text { min-width: 0; flex: 1; white-space: pre-wrap; overflow-wrap: anywhere; }
.kdbx-custom-field-actions { display: flex; align-items: center; gap: 2px; flex: 0 0 auto; }
.kdbx-custom-field-actions button { display: inline-flex; width: 28px; height: 28px; align-items: center; justify-content: center; color: var(--editorColor50); border-radius: 4px; }
.kdbx-custom-field-actions button:hover { background: var(--floatHoverColor); color: var(--editorColor); }
</style>
