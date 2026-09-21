# Draw.io Web 资源

本目录集中维护 MarkNotePro 使用的 Draw.io 相关代码，避免依赖项目外的同级目录或其他仓库：

- `drawio/`：内置 Draw.io Web 编辑器运行资源，入口为 `drawio/index.html`。
- `drawio-integration/`：Draw.io embed 协议的本地参考示例。

MarkNotePro 自己的宿主、保存、导出和窗口通信实现位于 `../main/drawio/`。生产打包只将 `drawio/` 复制到应用资源目录，不会把参考示例打入安装包。
