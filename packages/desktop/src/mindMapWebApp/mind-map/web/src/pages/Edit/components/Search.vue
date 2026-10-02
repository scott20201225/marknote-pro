<template>
  <div class="searchContainer" :class="{ isDark: isDark, show: show }">
    <div class="closeBtnBox" @click.stop="close" :title="$t('search.close') || '关闭'">
      <span class="closeBtn el-icon-close"></span>
    </div>
    <div class="searchInputBox">
      <el-input
        ref="searchInputRef"
        :placeholder="$t('search.searchPlaceholder')"
        size="small"
        v-model="searchText"
        @keyup.native.enter.stop="onSearchNext"
        @keydown.native.esc.stop="close"
        @keydown.native.stop
        @focus="onFocus"
        @blur="onBlur"
      >
        <i slot="prefix" class="el-input__icon el-icon-search"></i>
        <el-button
          size="small"
          slot="append"
          v-if="!isUndef(searchText)"
          @click="showReplaceInput = true"
          >{{ $t('search.replace') }}</el-button
        >
      </el-input>
      <div class="searchInfo" v-if="showSearchInfo && !isUndef(searchText)">
        {{ currentIndex }} / {{ total }}
      </div>
    </div>
    <el-input
      v-if="showReplaceInput"
      ref="replaceInputRef"
      :placeholder="$t('search.replacePlaceholder')"
      size="small"
      v-model="replaceText"
      style="margin: 12px 0;"
      @keyup.native.enter.stop="replace"
      @keydown.native.esc.stop="hideReplaceInput"
      @keydown.native.stop
      @focus="onFocus"
      @blur="onBlur"
    >
      <i slot="prefix" class="el-input__icon el-icon-edit"></i>
      <el-button size="small" slot="append" @click="hideReplaceInput">{{
        $t('search.cancel')
      }}</el-button>
    </el-input>
    <div class="btnList" v-if="showReplaceInput">
      <el-button size="small" :disabled="isReadonly" @click="replace">{{
        $t('search.replace')
      }}</el-button>
      <el-button size="small" :disabled="isReadonly" @click="replaceAll">{{
        $t('search.replaceAll')
      }}</el-button>
    </div>
    <div
      class="searchResultList"
      :style="{ height: searchResultListHeight + 'px' }"
      v-if="showSearchResultList"
    >
      <div
        class="searchResultItem"
        :class="{ active: index === currentIndex - 1 }"
        v-for="(item, index) in searchResultList"
        :key="item.id || index"
        :title="item.name"
        v-html="item.text"
        @click.stop="onSearchResultItemClick(index)"
      ></div>
      <div class="empty" v-if="searchResultList.length <= 0">
        <span class="iconfont iconwushuju"></span>
        <span class="text">{{ $t('search.noResult') }}</span>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import { isUndef, getTextFromHtml } from 'simple-mind-map/src/utils/index'

// 搜索替换
export default {
  props: {
    mindMap: {
      type: Object
    }
  },
  data() {
    return {
      show: false,
      searchText: '',
      replaceText: '',
      showReplaceInput: false,
      currentIndex: 0,
      total: 0,
      showSearchInfo: false,
      searchResultListHeight: 0,
      searchResultList: [],
      showSearchResultList: false
    }
  },
  computed: {
    ...mapState({
      isReadonly: state => state.isReadonly,
      isDark: state => state.localConfig.isDark
    })
  },
  watch: {
    searchText() {
      if (isUndef(this.searchText) || this.searchText === '') {
        this.currentIndex = 0
        this.total = 0
        this.showSearchInfo = false
        this.searchResultList = []
        if (this.mindMap && this.mindMap.search) {
          this.mindMap.search.endSearch()
        }
      }
    }
  },
  created() {
    this.$bus.$on('show_search', this.showSearch)
    this.mindMap.on('search_info_change', this.handleSearchInfoChange, this)
    this.mindMap.on('node_click', this.blur, this)
    this.mindMap.on('draw_click', this.blur, this)
    this.mindMap.on('expand_btn_click', this.blur, this)
    this.mindMap.on(
      'search_match_node_list_change',
      this.onSearchMatchNodeListChange,
      this
    )
    this.mindMap.keyCommand.addShortcut('Control+f', this.showSearch)
    window.addEventListener('resize', this.setSearchResultListHeight)
    window.addEventListener('keydown', this.handleGlobalKeydown, true)
    this.$bus.$on('setData', this.close)
  },
  mounted() {
    this.setSearchResultListHeight()
  },
  beforeDestroy() {
    this.$bus.$off('show_search', this.showSearch)
    this.mindMap.off('search_info_change', this.handleSearchInfoChange, this)
    this.mindMap.off('node_click', this.blur, this)
    this.mindMap.off('draw_click', this.blur, this)
    this.mindMap.off('expand_btn_click', this.blur, this)
    this.mindMap.off(
      'search_match_node_list_change',
      this.onSearchMatchNodeListChange,
      this
    )
    this.mindMap.keyCommand.removeShortcut('Control+f', this.showSearch)
    window.removeEventListener('resize', this.setSearchResultListHeight)
    window.removeEventListener('keydown', this.handleGlobalKeydown, true)
    this.$bus.$off('setData', this.close)
  },
  methods: {
    isUndef,

    handleGlobalKeydown(e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        if (this.show) {
          e.preventDefault()
          e.stopPropagation()
          this.close()
        }
      }
    },

    handleSearchInfoChange(data) {
      this.currentIndex = data.currentIndex + 1
      this.total = data.total
      this.showSearchInfo = true
    },

    showSearch() {
      this.$bus.$emit('closeSideBar')
      this.show = true
      this.$nextTick(() => {
        if (this.$refs.searchInputRef) {
          this.$refs.searchInputRef.focus()
          if (this.$refs.searchInputRef.select) {
            this.$refs.searchInputRef.select()
          }
        }
      })
    },

    hideReplaceInput() {
      this.showReplaceInput = false
      this.replaceText = ''
    },

    // 输入框聚焦时，禁止思维导图节点响应按键事件自动进入文本编辑
    onFocus() {
      this.mindMap.updateConfig({
        enableAutoEnterTextEditWhenKeydown: false
      })
    },

    // 输入框失焦时恢复
    onBlur() {
      this.mindMap.updateConfig({
        enableAutoEnterTextEditWhenKeydown: true
      })
    },

    // 画布，节点点击时让输入框失焦
    blur() {
      if (this.$refs.searchInputRef) {
        this.$refs.searchInputRef.blur()
      }
      if (this.$refs.replaceInputRef) {
        this.$refs.replaceInputRef.blur()
      }
    },

    onSearchNext() {
      this.showSearchResultList = true
      this.mindMap.search.search(this.searchText)
    },

    replace() {
      if (!this.mindMap.search.isSearching || this.mindMap.search.searchText !== this.searchText) {
        this.mindMap.search.search(this.searchText)
      }
      this.mindMap.search.replace(this.replaceText, true)
    },

    replaceAll() {
      if (!this.mindMap.search.isSearching || this.mindMap.search.searchText !== this.searchText) {
        this.mindMap.search.search(this.searchText)
      }
      this.mindMap.search.replaceAll(this.replaceText)
    },

    close() {
      this.show = false
      this.showSearchResultList = false
      this.showSearchInfo = false
      this.total = 0
      this.currentIndex = 0
      this.searchText = ''
      this.hideReplaceInput()
      this.mindMap.search.endSearch()
    },

    onSearchMatchNodeListChange(list) {
      if (!Array.isArray(list)) {
        this.searchResultList = []
        return
      }
      const escapeRegExp = s => (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const trimmed = (this.searchText || '').trim()
      const escaped = escapeRegExp(trimmed)
      const reg = escaped ? new RegExp(escaped, 'g') : null

      this.searchResultList = list.map((item, idx) => {
        const nodeData =
          (typeof item.getData === 'function' ? item.getData() : null) ||
          item.data ||
          (item.nodeData && item.nodeData.data) ||
          item ||
          {}
        let name = nodeData.text || ''
        const id = nodeData.uid || item.uid || idx
        if (nodeData.richText) {
          name = getTextFromHtml(name)
        }
        const text = reg
          ? String(name).replace(reg, a => `<span class="match">${a}</span>`)
          : String(name)
        return {
          data: item,
          id,
          text,
          name
        }
      })
    },

    setSearchResultListHeight() {
      this.searchResultListHeight = window.innerHeight - 267 - 24
    },

    onSearchResultItemClick(index) {
      this.currentIndex = index + 1
      this.mindMap.search.jump(index)
    }
  }
}
</script>

<style lang="less" scoped>
.searchContainer {
  position: relative;
  background-color: var(--mm-panel-bg, #ffffff);
  color: var(--mm-panel-text, #333333);
  padding: 16px;
  width: 296px;
  border-radius: 12px;
  border: 1px solid var(--mm-panel-border, rgba(0, 0, 0, 0.08));
  box-shadow: 0 4px 16px 0 var(--mm-panel-shadow, rgba(0, 0, 0, 0.1));
  position: fixed;
  top: 110px;
  right: -360px;
  transition: all 0.3s;
  z-index: 100;

  &:not(.show) {
    box-shadow: none !important;
    pointer-events: none;
  }

  &.show {
    right: 20px;
  }

  .btnList {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .closeBtnBox {
    position: absolute;
    right: -8px;
    top: -8px;
    width: 24px;
    height: 24px;
    background-color: var(--mm-btn-icon-bg, var(--mm-panel-bg, #fff));
    color: var(--mm-panel-text, #333);
    border: 1px solid var(--mm-panel-border, rgba(0, 0, 0, 0.08));
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    box-shadow: 0 2px 8px 0 var(--mm-panel-shadow, rgba(0, 0, 0, 0.1));
    transition: all 0.2s ease;
    z-index: 10;

    &:hover {
      color: var(--mm-theme-color, #409eff);
      border-color: var(--mm-theme-color, #409eff);
      transform: scale(1.08);
    }

    .closeBtn {
      font-size: 14px;
    }
  }

  .searchInputBox {
    position: relative;

    .searchInfo {
      position: absolute;
      right: 70px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--mm-panel-text-secondary, #909090);
      font-size: 13px;
    }
  }

  .searchResultList {
    position: absolute;
    left: 0;
    top: 100%;
    width: 100%;
    background-color: var(--mm-panel-bg, #ffffff);
    color: var(--mm-panel-text, #333333);
    border: 1px solid var(--mm-panel-border, rgba(0, 0, 0, 0.08));
    box-shadow: 0 4px 16px 0 var(--mm-panel-shadow, rgba(0, 0, 0, 0.1));
    border-radius: 12px;
    margin-top: 5px;
    overflow-y: auto;
    padding: 8px 0;

    .searchResultItem {
      height: 32px;
      line-height: 32px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 0 12px 0 24px;
      font-size: 13px;
      cursor: pointer;
      position: relative;
      color: var(--mm-panel-text, #333333);
      transition: background-color 0.15s ease, color 0.15s ease;

      &::before {
        content: '';
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        width: 5px;
        height: 5px;
        background-color: var(--mm-panel-text-secondary, #606266);
        border-radius: 50%;
      }

      &:hover {
        background-color: var(--mm-item-hover-bg, #f2f4f7);
        color: var(--mm-theme-color, #409eff);
      }

      &.active {
        background-color: var(--mm-item-active-bg, rgba(64, 158, 255, 0.1));
        color: var(--mm-theme-color, #409eff);
        font-weight: 600;
      }

      /deep/.match {
        color: var(--mm-theme-color, #409eff);
        font-weight: bold;
      }
    }

    .empty {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--mm-panel-text-secondary, rgba(26, 26, 26, 0.8));

      .iconfont {
        font-size: 40px;
        margin-bottom: 12px;
        color: var(--mm-panel-text-secondary, #909090);
      }

      .text {
        font-size: 13px;
        color: var(--mm-panel-text-secondary, rgba(26, 26, 26, 0.8));
      }
    }
  }
}
</style>
