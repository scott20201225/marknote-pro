## 🇨🇳 中文说明

### 产品定位

MarkNotePro 是一款集成 Git、Draw.io、GeoGebra、MindMap 思维导图、KDBX 加密密码库（含 2FA & SSH 终端直连）与 PDF 专业阅读批注的本地结构化笔记与多模态知识工作台。它面向长期笔记、个人知识库、工程绘图、数学建模、思维导图、密钥管理、专业资料管理以及 PDF 批注阅读，使用“笔记工作区 + 分区组 + 分区 + 多模态文档（Markdown / Draw.io / GeoGebra / MindMap / KDBX / PDF）”的结构组织内容，所有模块均可本地离线使用，并通过内置 Git 工作区完成版本管理、远程同步和多设备协作。

### 内置多模态创作与阅读引擎

- **Markdown 笔记（.md）**：所见即所得编辑、代码高亮、数学公式、Mermaid 图表、Callouts 警告块、表格增强与 Excel 互操作。
- **Draw.io 绘图引擎（.drawio）**：本地离线集成完整 Draw.io 编辑器，支持系统架构图、流程图、UML、网络拓扑图等专业图表，支持多格式导出。
- **GeoGebra 数学套件（.ggb）**：本地离线集成官方 GeoGebra 全功能引擎，支持绘图计算、几何、3D 计算器、CAS 计算机代数、概率统计与科学计算器。
- **MindMap 思维导图（.smm）**：本地离线集成专业思维导图工作台，原生支持思维导图、逻辑结构图、目录组织图、组织结构图、时间轴、鱼骨图等 6 种结构；支持节点富文本、LaTeX 公式、关联线、外框与大纲视图；支持直接导入 `.xmind`、`.md`、`.smm`、`.json`、`.mind` 并自动新建独立文件，支持导出多格式与系统打印。
- **KDBX 加密密码库（.kdbx）**：基于 KDBXWeb 集成 KeePass 兼容的本地密码库读写能力。支持独立主密码、分组、密钥条目、自定义字段、标签、附件、历史记录、回收站、批量移动以及受提取码保护的批量导入导出。原生集成 **2FA 双因素动态口令**（支持二维码扫描、截图粘贴与 URI 批量导入，实时倒计时与防重放）以及 **SSH / 终端快捷直连**（一键打开终端、图形化 SFTP 文件管理器与 ZMODEM 传输）。
- **PDF 阅读与批注引擎（.pdf）**：本地离线集成 Mozilla PDF.js 全功能引擎，支持页面流式阅读、目录大纲、缩略图、多语言字符检索与旋转缩放；深度集成丰富批注工具：**文本高亮**（多色标记与透明度控制）、**下划线/删除线**、**自由手绘涂鸦 (Ink)**、**文字批注**、**添加图片/图章**与**电子签名**；快捷键 `Cmd+S / Ctrl+S` 原地覆盖保存源文件（无需额外弹窗），修改红点精准双向同步，明暗主题自适应。

### 与 MarkTextPro 的关系

MarkNotePro 和 MarkTextPro 是两个相互独立、但能力互补的产品：

- **MarkNotePro**：结构化笔记与多模态知识工作台，适合长期笔记、知识库、专业项目资料、分区组 / 分区 / 结构化文档体系。
- **MarkTextPro**：自由文件与项目多模态工作区管理器，适合真实文件夹、代码仓库、外部独立文档、项目 README 和自由编辑。

两者均具备 **Markdown、Draw.io、GeoGebra、MindMap、KDBX 密码库与 PDF 专业阅读批注**核心本地能力，并都集成 Git 工作区；这些核心能力与 Git 是二者的共同底座。

### 产品选择对比图

下面是同一个项目在两个产品里的展示差异：MarkNotePro 只会展示符合笔记标准的目录和受支持的多模态文档（`.md` / `.drawio` / `.ggb` / `.smm` / `.kdbx` / `.pdf`），收敛为分区组 / 分区 / 文档视图；MarkTextPro 则展示真实文件系统结构，更适合完整项目目录和外部文件管理。

| MarkNotePro：结构化笔记视图 | MarkTextPro：真实文件系统视图 |
| --- | --- |
| ![MarkNotePro 结构化笔记视图](https://raw.githubusercontent.com/scott20201225/marknote-pro/main/docs/assets/screenshots/product-compare-note.png) | ![MarkTextPro 真实文件系统视图](https://raw.githubusercontent.com/scott20201225/marknote-pro/main/docs/assets/screenshots/product-compare-text.png) |

### 🔒 数据安全与 Git 使用建议

- **强烈建议使用私有仓库（Private Repository）**：知识工作区通常包含大量个人笔记、生活备忘、内部技术资料与服务器配置。请务必将远程 Git 仓库（如 GitHub、Gitee、GitLab 等）设为**私有项目**，从源头防止个人或团队敏感资料被公开发布或被搜索引擎收录。
- **严禁将 KDBX 密码库暴露到公有仓库**：即便 KDBX 文件拥有工业级强加密和独立主密码保护，**切勿将其推送到任何公开仓库（Public Repository）**！公开发布密码库会使其面临无限期离线字典与暴力破解的风险。如果项目为开源公有仓库，请务必在 `.gitignore` 中加入 `*.kdbx` 排除密码库。
- **设置高强度主密码**：KDBX 密码库的安全防线完全取决于主密码强度。软件支持 8-16 位大小写字母及数字，强烈建议设置满 16 位混合大小写字母与数字的高强度密码，杜绝弱密码与重复密码。

---

## 🇬🇧 English Description

### Overview

MarkNotePro is a local-first structured Markdown note-taking and multimodal knowledge workbench integrated with Git. Designed for long-term notes, personal knowledge bases, mathematical modeling, mind mapping, and PDF annotation, it organizes content using "Notebook Workspaces + Section Groups + Sections + Multimodal Documents (Markdown / Draw.io / GeoGebra / MindMap / KDBX / PDF)". All modules are 100% locally available offline.

### Built-in Multimodal Creation & Reading Engines

- **Markdown Notes (.md)**: WYSIWYG editing, syntax highlighting, math formulas, Mermaid diagrams, warning callouts, and enhanced tables with Excel interoperability.
- **Draw.io Diagramming (.drawio)**: Complete offline Draw.io editor supporting architecture diagrams, flowcharts, UML, network topologies, and multi-format export.
- **GeoGebra Math Suite (.ggb)**: Official GeoGebra engine supporting Graphing, Geometry, 3D Calculator, CAS, Probability, and Scientific Calculator.
- **MindMap Mind Mapping (.smm)**: 6 classic structures (mind map, logical, organization, timeline, fishbone), rich text, LaTeX, outline sync, and smart import/export.
- **KDBX Encrypted Keystore (.kdbx)**: KeePass-compatible encrypted password database with groups, tags, history, custom fields, attachments, recycle bin, bulk import/export, master password reset, built-in **2FA TOTP**, and **SSH/terminal direct connection** (with graphical SFTP file drawer and ZMODEM).
- **PDF Reader & Annotator (.pdf)**: Offline Mozilla PDF.js engine supporting outline navigation, search, **text highlight/underline**, **freehand drawing (Ink)**, **text comments**, **stamps/images**, **digital signatures**, and in-place overwrite saving via `Cmd+S / Ctrl+S`.

### Comparison with MarkTextPro

MarkNotePro and MarkTextPro are two independent, complementary products:
- **MarkNotePro**: Structured local note-taking & knowledge workbench, tailored for long-term notes, notebooks, section groups, sections, and document hierarchies.
- **MarkTextPro**: Free file & project multimodal workspace manager, tailored for authentic directory trees, code repositories, external documents, and flexible editing.

### 🔒 Data Security & Git Guidelines

- **Strongly Recommend Private Repositories**: Please set remote Git repositories (GitHub, Gitee, GitLab) to **Private** to prevent personal notes, tech assets, and server credentials from being publicly indexed.
- **Never Expose KDBX Keystores to Public Repositories**: Even with strong encryption, never push `.kdbx` files to public repositories. Add `*.kdbx` to `.gitignore`.
- **Use Strong Master Passwords**: We strongly recommend setting a full 16-character mixed-case alphanumeric master password.

---

## 🔗 相关地址与下载 / Official Links & Downloads

- **MarkNotePro**（结构化本地笔记与多模态知识工作台 / Structured Local Notes Workbench）:
  - 百度网盘下载 / Baidu Netdisk: https://pan.baidu.com/s/17s0JYmzCbqhq2AHpKa2YAA?pwd=dec2
  - GitHub 官方 Releases 下载 / Official Download: https://github.com/scott20201225/marknote-pro/releases/latest
  - Gitee 镜像仓库 / Mirror (China): https://gitee.com/cmflovekm/marknote-pro
  - GitHub 仓库 / Official Repo: https://github.com/scott20201225/marknote-pro
- **MarkTextPro**（自由文件与项目多模态工作区 / Free File & Project Workspace）:
  - 百度网盘下载 / Baidu Netdisk: https://pan.baidu.com/s/1UVWciYMIAZmI6y-H9KUuNQ?pwd=ddun
  - GitHub 官方 Releases 下载 / Official Download: https://github.com/scott20201225/marktext-pro/releases/latest
  - Gitee 镜像仓库 / Mirror (China): https://gitee.com/cmflovekm/marktext-pro
  - GitHub 仓库 / Official Repo: https://github.com/scott20201225/marktext-pro
