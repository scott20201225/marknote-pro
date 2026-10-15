# PDF.js Web 资源

本目录集中维护 MarkTextPro 使用的 PDF 阅读器运行代码，避免依赖外部 CDN 或同级目录：

- `pdfjs/`：内置 Mozilla PDF.js 运行资源，入口为 `pdfjs/web/viewer.html`。
- 源码仓库位于用户本地与 GitHub：`scott20201225/pdf.js`。

MarkTextPro 自己的宿主、状态管理、保存与窗口通信实现位于 `../main/pdf/` 与渲染进程组件。生产打包由 electron-builder 将 `pdfjs/` 复制到应用资源目录（`resources/pdfjs`）。
