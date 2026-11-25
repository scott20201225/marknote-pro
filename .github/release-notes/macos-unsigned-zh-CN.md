## 安装说明 / Installation Guide

- **Windows**：下载 `-setup.exe` 安装向导运行安装，或下载 `.zip` 绿色压缩包解压即用。
- **Linux**：按发行版选择 `.deb`、`.rpm`、`.snap` 安装包，或解压 `.tar.gz` 运行。
- **macOS（未签名提示处理 / Unsigned App Notice）**：
  由于当前 macOS 安装包采用 Ad-hoc 签名（暂未接入 Apple Developer ID 公证），若系统提示“**已损坏**”或“**无法验证开发者**”，请在终端执行以下命令后重新打开：

  ```bash
  sudo xattr -r -d com.apple.quarantine /Applications/MarkNotePro.app
  ```

  > 若未安装在 `/Applications` 目录，可输入 `sudo xattr -r -d com.apple.quarantine `（末尾保留空格），再将 `MarkNotePro.app` 拖入终端回车即可；如仍无“任何来源”选项，可执行 `sudo spctl --master-disable`。

  *For macOS users seeing "is damaged and can't be opened" or "unidentified developer", run `sudo xattr -r -d com.apple.quarantine /Applications/MarkNotePro.app` in Terminal (or drag the app after `sudo xattr -r -d com.apple.quarantine ` if placed elsewhere).*
