; installer.nsh — include via electron-builder’s nsis.include

;======================================================================
; customInstall macro is invoked by electron-builder after files are in $INSTDIR
!macro customInstall
  ; Ask the user if they want to register file associations
  MessageBox MB_YESNO|MB_ICONQUESTION \
  "Do you want to associate Markdown files (.md, .markdown, .mmd, .mdown, .mdtext, .mdx) with MarkNotePro?" /SD IDNO IDNO SkipAssoc

  ;— User clicked YES, perform the registry writes —
  WriteRegStr HKCU "Software\Classes\.md"       "" "MarkNotePro.Document"
  WriteRegStr HKCU "Software\Classes\.markdown" "" "MarkNotePro.Document"
  WriteRegStr HKCU "Software\Classes\.mmd"      "" "MarkNotePro.Document"
  WriteRegStr HKCU "Software\Classes\.mdown"    "" "MarkNotePro.Document"
  WriteRegStr HKCU "Software\Classes\.mdtxt"    "" "MarkNotePro.Document"
  WriteRegStr HKCU "Software\Classes\.mdtext"   "" "MarkNotePro.Document"
  WriteRegStr HKCU "Software\Classes\.mdx"      "" "MarkNotePro.Document"

  WriteRegStr HKCU "Software\Classes\MarkNotePro.Document" \
    "" "MarkNotePro Markdown Document"
  WriteRegExpandStr HKCU "Software\Classes\MarkNotePro.Document\DefaultIcon" \
    "" "$INSTDIR\resources\icons\md.ico,0"
  WriteRegExpandStr HKCU "Software\Classes\MarkNotePro.Document\shell\open\command" \
    "" '"$INSTDIR\marknotepro.exe" "%1"'

SkipAssoc:
!macroend

;======================================================================
; customUnInstall macro cleans up on uninstall
!macro customUnInstall
  ; Delete the open command subtree
  DeleteRegKey HKCU "Software\Classes\MarkNotePro.Document\shell\open\command"
  DeleteRegKey HKCU "Software\Classes\MarkNotePro.Document\shell\open"
  DeleteRegKey HKCU "Software\Classes\MarkNotePro.Document\shell"

  ; Delete the DefaultIcon and ProgID
  DeleteRegKey HKCU "Software\Classes\MarkNotePro.Document\DefaultIcon"
  DeleteRegKey HKCU "Software\Classes\MarkNotePro.Document"

  ; Delete each extension mapping
  DeleteRegKey HKCU "Software\Classes\.md"
  DeleteRegKey HKCU "Software\Classes\.markdown"
  DeleteRegKey HKCU "Software\Classes\.mmd"
  DeleteRegKey HKCU "Software\Classes\.mdown"
  DeleteRegKey HKCU "Software\Classes\.mdtxt"
  DeleteRegKey HKCU "Software\Classes\.mdtext"
  DeleteRegKey HKCU "Software\Classes\.mdx"

  MessageBox MB_YESNO "Do you want to delete user settings?" /SD IDNO IDNO SkipRemoval
    SetShellVarContext current
    RMDir /r "$APPDATA\marknotepro"
  SkipRemoval:
!macroend