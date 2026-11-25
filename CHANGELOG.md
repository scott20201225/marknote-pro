# Changelog

All notable changes to **MarkNotePro** are documented in this file.

## [1.3.3] - 2026-11-25

### ✨ Features & Improvements
- **工作区统一管理弹窗 / Unified Switch Workspace Modal**：
  - 将“切换 Git 工作区”升级为“**切换工作区**”，同屏展示当前工作区（排在首位并默认选中）、Git 工作区列表与历史工作区列表，并支持直接选择 Windows / macOS / Linux 系统本地文件夹。
  - 自动检测工作区目录存在性：对已删除路径标记“**工作区已被删除**”，仍允许选中并在切换时自动重建目录；非 Git 历史工作区支持悬停提示“移除该工作区历史记录”并仅清理历史记录而不删除磁盘文件夹。
  - 新增键盘交互支持：`ArrowUp` / `ArrowDown` 循环切换选中项并自动滚动定位，`Enter` 直接确认切换。
- **工作区智能迁移合并 / Workspace Migration Workflow**：
  - 无 Git 非空原工作区切换至 Git 工作区时自动弹窗询问，默认勾选并首位展示“**不迁移**”（*不迁移原工作区数据，仅切换工作区*），其次为“跳过”与“覆盖”；当目标工作区同样无 Git 时跳过提示直接切换。
  - 从侧边栏手动触发“合并其他工作区至此工作区”时隐藏“不迁移”选项，默认“跳过（默认推荐）”，源目录改为纯手动浏览选择不预填默认值。
- **GitHub 视图与多语言体验增强 / GitHub Desktop UX & i18n**：
  - 修复在 GitHub 视图下弹出“切换 / 迁移工作区”与“设置为工作区”弹窗被 `BrowserView` 遮挡及 Toast 被截断的问题；点击“设置为工作区”精简为“确定 / 取消”并修复确定后立即切换生效与完整分支切换链路。
  - 在“偏好设置 → 通用”重新选择工作区目录后，即时刷新并切换当前主窗口工作区。
  - 修复 GitHub 视图下摘要与描述输入框的复制、粘贴、剪切、全选、撤销/重做快捷键路由；补全提交按钮（如 `Commit N files to main`）与文件变更操作（`Create / Delete / Update`）等 11 国语言动态翻译。

## [1.3.2] - 2026-11-25

### ✨ Features & Improvements
- **局域网零配置分享（LAN Share）/ Zero-Config LAN File Sharing**：
  - 新增本地笔记局域网一键分享能力与标准二维码展示，支持 11 种语言界面适配。
  - 升级在线 Markdown 阅读器为完整 GFM 解析器（支持任务列表与表格渲染）。
  - 新增“无密码快速分享”快捷按钮并修复侧边栏 Tooltip 与分享弹窗多语言细节。

### 🐛 Bug Fixes
- **Draw.io 编辑器**：修复手动保存与自动保存期间丢失当前文字选区与光标位置的问题。

## [1.3.1] - 2026-11-23

### ✨ Features & Improvements
- **KDBX 密码库**：新增自动锁定倒计时显示，并支持主密码中的特殊字符。

### 🐛 Bug Fixes
- **KDBX 密码库**：在解锁时快照固定自动锁定超时时长，防止会话期间修改偏好设置意外延长已解锁会话。
- **桌面贴图 / Mermaid**：修复 macOS 下 Mermaid 图表弹出贴图失败的问题。

## [1.3.0] - 2026-11-20

### 🐛 Bug Fixes & Security
- **GitHub 认证**：启用独立的 MarkNotePro GitHub OAuth 应用及专属回调协议（`marknotepro-github-auth://`），修复内置 Git 登录授权问题。

## [1.2.9] - 2026-11-20

### ✨ Features & Improvements
- **Markdown 编辑器**：支持有序列表换行自动延续编号，并支持自定义起始序号重启编号。

## [1.2.8] - 2026-11-18

### 🐛 Bug Fixes
- **终端与 SSH**：修复 Windows 和 Linux 下的终端重复粘贴问题，恢复粘贴功能并将终端快捷键限制在终端聚焦状态下触发；为 Electron SSH 连接补充 `chacha20-poly1305` 加密算法回退兼容。
- **KDBX 密码库**：修复右键上下文菜单超出视口边界问题，并适配动态传送菜单的主题文字颜色。
- **视图快捷键**：修复 `Command+K` 触发 `toggleLayout` 在打包时被 Tree-Shaking 移除的问题。

## [1.2.7] - 2026-11-08

### ✨ Features & Improvements
- **图片悬停快捷贴图**：支持正文行内图片悬停直接弹出贴图按钮（样式与 Mermaid 保持一致），支持脱离编辑工具栏自动追踪以及将贴图保存至工作区附件目录。

### 🐛 Bug Fixes
- **跨屏与输入体验**：修复全屏模式下跨 Space 切换与交通灯按钮丢失问题，确保输入法（IME）候选词与批注点击停留在当前桌面空间；修复行内图片 `eventCenter` 引用问题。
- **贴图样式与剪贴板**：适配水印颜色与主题样式，修复浅色模式下标签缺口与文字颜色，编辑态标签文本同步应用所选色值，并在工具栏色块增加勾选状态标识；修复剪贴板历史“清空全部”确认按钮默认红色背景。

## [1.2.6] - 2026-11-03

### 🐛 Bug Fixes
- **桌面贴图（Pin）**：修复 Windows 环境下贴图窗口光标不可见、底部边缘被裁剪以及跨屏定位异常的问题。

## [1.2.4] - 2026-10-20

### ✨ Features & Improvements
- **Mermaid 与排版**：支持 Mermaid 图表拖拽平移与缩放，优化编辑器响应式排版宽度。
- **发布流程**：精简并规范双语 Release 说明模板。

## [1.2.3] - 2026-10-16

### ✨ Features & Improvements
- **界面交互**：优化 Git 视图顶部工具栏工作区动态提示，并恢复上栏搜索按钮 Tooltip。
- **自动化同步与文档**：新增 GitHub 向 Gitee 自动镜像同步代码、Tag 与 Release 的 CI 流水线；新增英文版 `README_en.md`，完善双语 Release 说明模板、关联仓库链接及百度网盘下载入口。

## [1.2.0] - 2026-10-16

### ✨ Features & Improvements
- **原生 PDF 阅读与批注引擎**：集成内置 PDF 阅读器与全套批注能力，注册 `.pdf` 等文件关联。
- **Git 与工具栏主题适配**：使用 GitHub 图标与“Git 管理 / 返回工作区”多语言提示，全面适配亮暗主题与即时 Tooltip 交互，移除上栏多余 Tooltip 并柔和浅色主题文字。

### 🐛 Bug Fixes & Security
- **KDBX 密码库**：修复关闭 KDBX 标签页异常问题，并将主密码安全建议校准为 16 位大小写字母与数字组合；补充 Git 私有仓库与 KDBX 数据安全建议。
- **安全性加固**：清洗 GeoGebra `BrowserLauncher.java` 中的 Shell / 子进程调用（修复 CWE-78 安全隐患）。
