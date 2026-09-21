# Draw.io 集成说明

MarkNotePro 当前将 Draw.io 嵌入到编辑窗口内：

- `src/drawioWebApp/drawio` 内置 MarkNotePro 适配版 Draw.io Web 绘图引擎。
- `src/main/drawio` 实现 `postMessage` 通信约定和宿主页，负责与内置引擎连接。
- MarkNotePro 主进程负责 `.drawio` 文件读取、保存和内嵌视图生命周期。
- Draw.io 通过 `BrowserView` 显示在当前 MarkNotePro 编辑区，保留左侧笔记树、列表和应用标题栏。
- 工作区中的 `.drawio` 会进入笔记树和列表；Markdown 仍仅在 `AREA_` 分区内展示，绘图仅能在根目录或 `AREA_` 分区目录中新建。
- Muya 暂不在 Markdown 文本中直接渲染绘图；点击工作区内 Markdown 链接会切换到同一窗口的 Draw.io 编辑区。
- 工作区外的绘图链接保持原来的系统默认打开逻辑。

## 本地开发

默认查找顺序如下：

1. 打包后的 `resources/drawio`
2. 开发目录的 `packages/desktop/src/drawioWebApp/drawio`

当前源码目录结构：

```text
MarkNotePro/packages/desktop/src/
├── githubDesktop/
└── drawioWebApp/
    ├── drawio/
    │   ├── index.html
    │   ├── js/
    │   ├── images/
    │   └── stencils/
    └── drawio-integration/
```

## 当前入口

- 工作区侧边栏树或列表中 `AREA_` 分区右键菜单：`新建绘图`
- 工作区内 Markdown 链接：点击 `.drawio` 文件后打开 Draw.io

Draw.io 会跟随 MarkNotePro 当前语言与浅色、深色皮肤；切换时会重新加载绘图界面，并保留最近一次已保存的 XML。

保存时通过以下协议消息落盘：

```text
init -> load
save/autosave -> 主进程写入 XML
exit -> 保存后隐藏内嵌视图并回到笔记界面
```

生产打包会将项目内 `src/drawioWebApp/drawio` 复制到应用资源目录 `drawio`，因此完整 Draw.io Web 引擎会增加安装包体积。GitHub Release 会在构建开始时校验项目内的 `index.html` 和 MarkNotePro 补丁；如果引擎缺失，构建会直接失败，不会生成缺少绘图引擎的安装包。
