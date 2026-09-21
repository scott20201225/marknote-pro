# Draw.io 集成说明

MarkNotePro 当前将 Draw.io 嵌入到编辑窗口内：

- `drawio` fork 提供本地 Web 绘图引擎。
- `drawio-integration` fork 提供 `postMessage` 通信约定，本目录按该约定实现宿主页。
- MarkNotePro 主进程负责 `.drawio` 文件读取、保存和内嵌视图生命周期。
- Draw.io 通过 `BrowserView` 显示在当前 MarkNotePro 编辑区，保留左侧笔记树、列表和应用标题栏。
- 工作区中的 `.drawio` 会进入笔记树和列表；Markdown 仍仅在 `AREA_` 分区内展示，绘图仅能在根目录或 `AREA_` 分区目录中新建。
- Muya 暂不在 Markdown 文本中直接渲染绘图；点击工作区内 Markdown 链接会切换到同一窗口的 Draw.io 编辑区。
- 工作区外的绘图链接保持原来的系统默认打开逻辑。

## 本地开发

默认查找顺序如下：

1. `MARKNOTEPRO_DRAWIO_WEBAPP`
2. 打包后的 `resources/drawio`
3. MarkNotePro 同级目录的 `../drawio/src/main/webapp`

当前源码目录结构已经满足第 3 项：

```text
02_源码/
├── MarkNotePro/
├── drawio/
└── drawio-integration/
```

如果目录不同，可以显式指定：

```bash
export MARKNOTEPRO_DRAWIO_WEBAPP=/绝对路径/drawio/src/main/webapp
pnpm --filter marknotepro dev
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

生产打包会将同级 `drawio/src/main/webapp` 复制到应用资源目录 `drawio`，因此完整 Draw.io Web 引擎会增加安装包体积。当前阶段先验证功能闭环，暂不复制资源到 MarkNotePro Git 仓库。
