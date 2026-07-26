## macOS 安装说明

因为当前 macOS 安装包未进行 Apple Developer ID 签名，若软件提示“已损坏”或者“未知来源”，可参照下列方法进行处理：

- 先打开【系统偏好设置】→【安全性与隐私】→【通用】，查看是否允许“任何来源”；若无此选项，打开终端输入：

  ```
  sudo spctl --master-disable
  ```

  回车并输入管理员密码。

- 若仍报错，在终端执行：

  ```
  sudo xattr -r -d com.apple.quarantine /Applications/MarkNotePro.app
  ```

  回车并输入管理员密码。

- 若默认路径命令仍不成功，说明软件可能没有安装在默认位置。此时在终端执行：

  ```
  sudo xattr -r -d com.apple.quarantine 
  ```

  注意命令最后保留一个空格，然后将 MarkNotePro 从 `Applications` 文件夹拖入终端窗口补全路径，回车并输入管理员密码。
