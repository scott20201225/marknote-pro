; installer.nsh — include via electron-builder’s nsis.include

;======================================================================
; customUnInstall macro cleans up on uninstall
!macro customUnInstall
  MessageBox MB_YESNO "Do you want to delete user settings?" /SD IDNO IDNO SkipRemoval
    SetShellVarContext current
    RMDir /r "$APPDATA\marknotepro"
  SkipRemoval:
!macroend