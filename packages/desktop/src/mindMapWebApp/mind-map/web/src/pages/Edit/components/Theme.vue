<template>
  <Sidebar ref="sidebar" :title="$t('theme.title')">
    <div class="themeGroupList" :class="{ isDark: isDark }">
      <el-tabs v-model="activeName" class="tabBox">
        <el-tab-pane
          v-for="group in groupList"
          :key="group.name"
          :label="group.name"
          :name="group.name"
        ></el-tab-pane>
      </el-tabs>
      <div class="themeListTheme customScrollbar">
        <div
          class="themeItem"
          v-for="item in currentList"
          :key="item.value"
          @click="useTheme(item)"
          :class="{ active: item.value === theme }"
        >
          <div class="imgBox">
            <img :src="item.img || themeImgMap[item.value]" alt="" />
          </div>
          <div class="name">{{ item.name }}</div>
        </div>
      </div>
    </div>
  </Sidebar>
</template>

<script>
import Sidebar from './Sidebar.vue'
import { storeData } from '@/api'
import { mapState, mapMutations } from 'vuex'
import themeImgMap from 'simple-mind-map-plugin-themes/themeImgMap'
import themeList from 'simple-mind-map-plugin-themes/themeList'

// 主题
export default {
  components: {
    Sidebar
  },
  props: {
    data: {
      type: [Object, null],
      default: null
    },
    mindMap: {
      type: Object
    }
  },
  data() {
    return {
      themeList: [
        {
          name: '默认主题',
          value: 'default',
          dark: false
        },
        ...themeList
      ].reverse(),
      themeImgMap,
      theme: '',
      activeName: '',
      defaultGroupList: []
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      activeSidebar: state => state.activeSidebar,
      extendThemeGroupList: state => state.extendThemeGroupList
    }),

    groupList() {
      let list = []
      if (this.isDark) {
        list = this.defaultGroupList.filter(item => item.name === this.$t('theme.dark'))
      } else {
        list = this.defaultGroupList.filter(
          item => item.name === this.$t('theme.classics') || item.name === this.$t('theme.simple')
        )
      }
      return [...list, ...this.extendThemeGroupList]
    },

    currentList() {
      const target = this.groupList.find(item => {
        return item.name === this.activeName
      })
      return target ? target.list : (this.groupList[0] ? this.groupList[0].list : [])
    }
  },
  watch: {
    activeSidebar(val) {
      if (val === 'theme') {
        this.theme = this.mindMap.getTheme()
        this.$refs.sidebar.show = true
      } else {
        this.$refs.sidebar.show = false
      }
    },
    isDark() {
      this.$nextTick(() => {
        if (!this.groupList.some(item => item.name === this.activeName)) {
          this.activeName = this.groupList[0]?.name || ''
        }
      })
    }
  },
  created() {
    this.initGroup()
    this.theme = this.mindMap.getTheme()
    this.mindMap.on('view_theme_change', this.handleViewThemeChange)
  },
  beforeDestroy() {
    this.mindMap.off('view_theme_change', this.handleViewThemeChange)
  },
  methods: {
    ...mapMutations(['setLocalConfig']),

    handleViewThemeChange() {
      this.theme = this.mindMap.getTheme()
      this.handleDark()
    },

    initGroup() {
      const baiduThemes = [
        'default',
        'skyGreen',
        'classic2',
        'classic3',
        'classicGreen',
        'classicBlue',
        'blueSky',
        'brainImpairedPink',
        'earthYellow',
        'freshGreen',
        'freshRed',
        'romanticPurple',
        'pinkGrape',
        'mint'
      ]
      const baiduList = []
      const classicsList = []
      this.themeList.forEach(item => {
        if (baiduThemes.includes(item.value)) {
          baiduList.push(item)
        } else if (!item.dark) {
          classicsList.push(item)
        }
      })
      this.defaultGroupList = [
        {
          name: this.$t('theme.classics'),
          list: classicsList
        },
        {
          name: this.$t('theme.dark'),
          list: this.themeList.filter(item => {
            return item.dark
          })
        },
        {
          name: this.$t('theme.simple'),
          list: baiduList
        }
      ]
      this.activeName = this.defaultGroupList[0].name
    },

    useTheme(theme) {
      if (theme.value === this.theme) return
      this.theme = theme.value
      this.handleDark()
      const customThemeConfig = this.mindMap.getCustomThemeConfig()
      const hasCustomThemeConfig = Object.keys(customThemeConfig).length > 0
      if (hasCustomThemeConfig) {
        this.$confirm(this.$t('theme.coverTip'), this.$t('theme.tip'), {
          confirmButtonText: this.$t('theme.cover'),
          cancelButtonText: this.$t('theme.reserve'),
          type: 'warning',
          distinguishCancelAndClose: true,
          callback: action => {
            if (action === 'confirm') {
              this.changeTheme(theme, {})
            } else if (action === 'cancel') {
              this.changeTheme(theme, customThemeConfig)
            }
          }
        })
      } else {
        this.changeTheme(theme, customThemeConfig)
      }
    },

    changeTheme(theme, config) {
      this.$bus.$emit('showLoading')
      const currentBg = window.__currentBackgroundColor || ''
      const isDark = typeof this.isDark === 'boolean' ? this.isDark : Boolean(this.isDark)
      const customConfig = {
        ...(config || {}),
        backgroundColor: currentBg,
        _isCustomTheme: true,
        _customThemeIsDark: isDark
      }
      this.mindMap.setTheme(theme.value, true)
      if (typeof this.mindMap.setThemeConfig === 'function') {
        this.mindMap.setThemeConfig(customConfig)
      }
      if (this.mindMap.el && currentBg) {
        this.mindMap.el.style.backgroundColor = currentBg
        this.mindMap.el.style.backgroundImage = 'none'
      }
      if (this.$bus) {
        const payload = {
          template: theme.value,
          isDark: isDark,
          config: customConfig
        }
        this.$bus.$emit('marknotepro::custom_theme_chosen', payload)
        this.$bus.$emit('marktextpro::custom_theme_chosen', payload)
      }
      storeData({
        theme: {
          template: theme.value,
          config: customConfig,
          _isCustomTheme: true,
          _customThemeIsDark: isDark
        }
      })
    },

    handleDark() {
      const extendThemeList = []
      this.extendThemeGroupList.forEach(group => {
        extendThemeList.push(...group.list)
      })
      let target = [...this.themeList, ...extendThemeList].find(item => {
        return item.value === this.theme
      })
      this.setLocalConfig({
        isDark: Boolean(target && target.dark)
      })
    }
  }
}
</script>

<style lang="less" scoped>
.themeGroupList {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;

  &.isDark {
    .name {
      color: #fff;
    }
    .themeItem {
      .imgBox {
        border-color: var(--mm-card-border, rgba(255, 255, 255, 0.15));
      }
    }
  }

  .tabBox {
    flex-shrink: 0;

    /deep/ .el-tabs__nav-wrap {
      display: flex;
      justify-content: center;
    }
  }

  .themeListTheme {
    height: 100%;
    overflow-y: auto;
    padding: 0 20px;

    .themeItem {
      width: 100%;
      cursor: pointer;
      margin-bottom: 16px;
      padding-bottom: 10px;
      transition: all 0.2s;
      border: 3px solid transparent;
      border-radius: 8px;
      overflow: hidden;
      box-sizing: border-box;

      &:hover {
        box-shadow: 0 1px 2px -2px rgba(0, 0, 0, 0.16),
          0 3px 6px 0 rgba(0, 0, 0, 0.12), 0 5px 12px 4px rgba(0, 0, 0, 0.09);
      }

      &.active {
        border: 3px solid var(--mm-theme-color, rgb(154, 198, 250));
        border-radius: 8px;
      }

      .imgBox {
        width: 100%;
        border-radius: 8px;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--mm-card-border, rgba(0, 0, 0, 0.08));
        box-sizing: border-box;

        img {
          width: 100%;
          height: auto;
          display: block;
          border-radius: 7px;
        }
      }
      .name {
        text-align: center;
        font-size: 14px;
        margin-top: 6px;
      }
    }
  }
}
</style>
