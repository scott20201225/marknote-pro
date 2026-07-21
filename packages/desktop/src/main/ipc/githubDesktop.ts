import path from 'path'
import fs from 'fs-extra'
import {
  app,
  BrowserView,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  session,
  shell,
  systemPreferences,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
  type Rectangle
} from 'electron'
import keytar from 'keytar'
import log from 'electron-log'
import { resolveEmbeddedGitDir } from 'dugite'
import { parseAppURL } from '../../githubDesktop/upstream/src/lib/parse-app-url'
import type { URLActionType } from '../../githubDesktop/upstream/src/lib/parse-app-url'
import { buildDefaultMenu } from '../../githubDesktop/upstream/src/main-process/menu/build-default-menu'
import type { MenuEvent } from '../../githubDesktop/upstream/src/main-process/menu/menu-event'
import type { MenuLabelsEvent } from '../../githubDesktop/upstream/src/models/menu-labels'
import { menuFromElectronMenu } from '../../githubDesktop/upstream/src/models/app-menu'
import type { IMenu, MenuItem } from '../../githubDesktop/upstream/src/models/app-menu'
import type { GitHubDesktopLocalePayload, GitHubDesktopThemePayload } from '../../shared/types/ipc'

interface GitHubDesktopViewEntry {
  view: BrowserView
  loaded: boolean
  currentRepositoryPath: string | null
  currentThemePayload: GitHubDesktopThemePayload | null
  currentLocalePayload: GitHubDesktopLocalePayload | null
}

const views = new Map<number, GitHubDesktopViewEntry>()
const pendingURLActions: URLActionType[] = []
let protocolsRegistered = false
let protocolHandlersRegistered = false
let currentMenuLabels: MenuLabelsEvent = {
  selectedShell: null,
  selectedExternalEditor: null,
  askForConfirmationOnForcePush: false,
  askForConfirmationOnRepositoryRemoval: false
}
let githubDesktopMenu = buildDefaultMenu(currentMenuLabels)

const githubDesktopProtocols = [
  'x-github-client',
  'x-github-desktop-dev-auth',
  'x-github-desktop-auth',
  process.platform === 'darwin' ? 'github-mac' : 'github-windows'
].filter(Boolean)

const menuEventById: Record<string, MenuEvent> = {
  about: 'show-about',
  preferences: 'show-preferences',
  'install-cli': 'install-darwin-cli',
  'new-repository': 'create-repository',
  'add-local-repository': 'add-local-repository',
  'clone-repository': 'clone-repository',
  find: 'find-text',
  'show-changes': 'show-changes',
  'show-history': 'show-history',
  'show-repository-list': 'choose-repository',
  'show-branches-list': 'show-branches',
  'show-worktrees-list': 'show-worktrees',
  'go-to-commit-message': 'go-to-commit-message',
  'toggle-changes-filter': 'toggle-changes-filter',
  'increase-active-resizable-width': 'increase-active-resizable-width',
  'decrease-active-resizable-width': 'decrease-active-resizable-width',
  pull: 'pull',
  fetch: 'fetch',
  'remove-repository': 'remove-repository',
  'view-repository-on-github': 'view-repository-on-github',
  'open-in-shell': 'open-in-shell',
  'open-working-directory': 'open-working-directory',
  'open-external-editor': 'open-external-editor',
  'open-with-external-editor': 'open-with-external-editor',
  'create-issue-in-repository-on-github': 'create-issue-in-repository-on-github',
  'create-worktree': 'create-worktree',
  'show-repository-settings': 'show-repository-settings',
  'create-branch': 'create-branch',
  'rename-branch': 'rename-branch',
  'delete-branch': 'delete-branch',
  'discard-all-changes': 'discard-all-changes',
  'stash-all-changes': 'stash-all-changes',
  'update-branch-with-contribution-target-branch': 'update-branch-with-contribution-target-branch',
  'compare-to-branch': 'compare-to-branch',
  'merge-branch': 'merge-branch',
  'squash-and-merge-branch': 'squash-and-merge-branch',
  'rebase-branch': 'rebase-branch',
  'compare-on-github': 'compare-on-github',
  'branch-on-github': 'branch-on-github',
  'preview-pull-request': 'preview-pull-request',
  'create-pull-request': 'open-pull-request'
}

const appMenuRootTranslations: Record<string, Record<string, string>> = {
  de: {
    'GitHub Desktop': 'GitHub Desktop',
    File: 'Datei',
    Edit: 'Bearbeiten',
    View: 'Ansicht',
    Repository: 'Repository',
    Branch: 'Branch',
    Window: 'Fenster',
    Help: 'Hilfe'
  },
  en: {
    'GitHub Desktop': 'GitHub Desktop',
    File: 'File',
    Edit: 'Edit',
    View: 'View',
    Repository: 'Repository',
    Branch: 'Branch',
    Window: 'Window',
    Help: 'Help'
  },
  es: {
    'GitHub Desktop': 'GitHub Desktop',
    File: 'Archivo',
    Edit: 'Editar',
    View: 'Ver',
    Repository: 'Repositorio',
    Branch: 'Rama',
    Window: 'Ventana',
    Help: 'Ayuda'
  },
  fr: {
    'GitHub Desktop': 'GitHub Desktop',
    File: 'Fichier',
    Edit: 'Modifier',
    View: 'Affichage',
    Repository: 'Depot',
    Branch: 'Branche',
    Window: 'Fenetre',
    Help: 'Aide'
  },
  it: {
    'GitHub Desktop': 'GitHub Desktop',
    File: 'File',
    Edit: 'Modifica',
    View: 'Vista',
    Repository: 'Repository',
    Branch: 'Branch',
    Window: 'Finestra',
    Help: 'Aiuto'
  },
  ja: {
    'GitHub Desktop': 'GitHub Desktop',
    File: 'ファイル',
    Edit: '編集',
    View: '表示',
    Repository: 'リポジトリ',
    Branch: 'ブランチ',
    Window: 'ウィンドウ',
    Help: 'ヘルプ'
  },
  ko: {
    'GitHub Desktop': 'GitHub Desktop',
    File: '파일',
    Edit: '편집',
    View: '보기',
    Repository: '저장소',
    Branch: '브랜치',
    Window: '창',
    Help: '도움말'
  },
  pt: {
    'GitHub Desktop': 'GitHub Desktop',
    File: 'Arquivo',
    Edit: 'Editar',
    View: 'Ver',
    Repository: 'Repositorio',
    Branch: 'Branch',
    Window: 'Janela',
    Help: 'Ajuda'
  },
  tr: {
    'GitHub Desktop': 'GitHub Desktop',
    File: 'Dosya',
    Edit: 'Duzenle',
    View: 'Gorunum',
    Repository: 'Depo',
    Branch: 'Dal',
    Window: 'Pencere',
    Help: 'Yardim'
  },
  'zh-CN': {
    'GitHub Desktop': 'GitHub Desktop',
    File: '文件',
    Edit: '编辑',
    View: '视图',
    Repository: '仓库',
    Branch: '分支',
    Window: '窗口',
    Help: '帮助',
    'About GitHub Desktop': '关于 GitHub Desktop',
    Settings: '设置',
    'Install Command Line Tool': '安装命令行工具',
    Services: '服务',
    'Hide marknotepro': '隐藏 MarkNotePro',
    'Hide Others': '隐藏其他',
    'Show All': '全部显示',
    'Quit marknotepro': '退出 MarkNotePro',
    'New Repository': '新建仓库',
    'Add Local Repository': '添加本地仓库',
    'Clone Repository': '克隆仓库',
    Options: '选项',
    Exit: '退出',
    Undo: '撤销',
    Redo: '重做',
    Cut: '剪切',
    Copy: '复制',
    Paste: '粘贴',
    'Select All': '全选',
    Find: '查找',
    'Show Changes': '显示变更',
    Changes: '变更',
    'Show History': '显示历史',
    History: '历史',
    'Show Repository List': '显示仓库列表',
    'Repository list': '仓库列表',
    'Show Branches List': '显示分支列表',
    'Branches list': '分支列表',
    'Show Worktrees List': '显示工作树列表',
    'Worktrees list': '工作树列表',
    'Go to Summary': '跳到提交摘要',
    'Show Stashed Changes': '显示暂存变更',
    'Hide Stashed Changes': '隐藏暂存变更',
    'Show Changes Filter': '显示变更过滤器',
    'Hide Changes Filter': '隐藏变更过滤器',
    'Toggle Full Screen': '切换全屏',
    'Reset Zoom': '重置缩放',
    'Zoom In': '放大',
    'Zoom Out': '缩小',
    'Expand Active Resizable': '展开当前可调整区域',
    'Contract Active Resizable': '收起当前可调整区域',
    Reload: '重新加载',
    'Toggle Developer Tools': '切换开发者工具',
    Push: '推送',
    'Force Push': '强制推送',
    Pull: '拉取',
    Fetch: '获取',
    Remove: '移除',
    'View on GitHub': '在 GitHub 查看',
    'Open in Shell': '在 Shell 中打开',
    'Show in Finder': '在访达中显示',
    'Show in Explorer': '在资源管理器中显示',
    'Show in your File Manager': '在文件管理器中显示',
    'Open in External Editor': '在外部编辑器中打开',
    'Open With': '打开方式',
    'Create Issue on GitHub': '在 GitHub 创建 Issue',
    'New Worktree': '新建工作树',
    'Repository Settings': '仓库设置',
    'New Branch': '新建分支',
    Rename: '重命名',
    Delete: '删除',
    'Discard All Changes': '放弃所有变更',
    'Stash All Changes': '暂存所有变更',
    'Compare to Branch': '与分支比较',
    'Merge into Current Branch': '合并到当前分支',
    'Squash and Merge into Current Branch': '压缩并合并到当前分支',
    'Rebase Current Branch': '变基当前分支',
    'Compare on GitHub': '在 GitHub 比较',
    'View Branch on GitHub': '在 GitHub 查看分支',
    'Preview Pull Request': '预览 Pull Request',
    'Create Pull Request': '创建 Pull Request',
    'View Pull Request on GitHub': '在 GitHub 查看 Pull Request',
    'Report Issue': '反馈问题',
    'Contact GitHub Support': '联系 GitHub 支持',
    'Show User Guides': '显示用户指南',
    'Show Keyboard Shortcuts': '显示键盘快捷键',
    'Show Logs in Finder': '在访达中显示日志',
    'Show logs in Explorer': '在资源管理器中显示日志',
    'Show logs in your File Manager': '在文件管理器中显示日志'
  },
  'zh-TW': {
    'GitHub Desktop': 'GitHub Desktop',
    File: '檔案',
    Edit: '編輯',
    View: '檢視',
    Repository: '倉庫',
    Branch: '分支',
    Window: '視窗',
    Help: '說明',
    'About GitHub Desktop': '關於 GitHub Desktop',
    Settings: '設定',
    'Install Command Line Tool': '安裝命令列工具',
    Services: '服務',
    'Hide marknotepro': '隱藏 MarkNotePro',
    'Hide Others': '隱藏其他',
    'Show All': '全部顯示',
    'Quit marknotepro': '退出 MarkNotePro',
    'New Repository': '新增倉庫',
    'Add Local Repository': '新增本地倉庫',
    'Clone Repository': '複製倉庫',
    Options: '選項',
    Exit: '退出',
    Undo: '復原',
    Redo: '重做',
    Cut: '剪下',
    Copy: '複製',
    Paste: '貼上',
    'Select All': '全選',
    Find: '尋找',
    'Show Changes': '顯示變更',
    Changes: '變更',
    'Show History': '顯示歷史',
    History: '歷史',
    'Show Repository List': '顯示倉庫清單',
    'Repository list': '倉庫清單',
    'Show Branches List': '顯示分支清單',
    'Branches list': '分支清單',
    'Show Worktrees List': '顯示工作樹清單',
    'Worktrees list': '工作樹清單',
    'Go to Summary': '跳到提交摘要',
    'Show Stashed Changes': '顯示暫存變更',
    'Hide Stashed Changes': '隱藏暫存變更',
    'Show Changes Filter': '顯示變更篩選器',
    'Hide Changes Filter': '隱藏變更篩選器',
    'Toggle Full Screen': '切換全螢幕',
    'Reset Zoom': '重設縮放',
    'Zoom In': '放大',
    'Zoom Out': '縮小',
    'Expand Active Resizable': '展開目前可調整區域',
    'Contract Active Resizable': '收起目前可調整區域',
    Reload: '重新載入',
    'Toggle Developer Tools': '切換開發者工具',
    Push: '推送',
    'Force Push': '強制推送',
    Pull: '拉取',
    Fetch: '擷取',
    Remove: '移除',
    'View on GitHub': '在 GitHub 檢視',
    'Open in Shell': '在 Shell 中開啟',
    'Show in Finder': '在 Finder 中顯示',
    'Show in Explorer': '在檔案總管中顯示',
    'Show in your File Manager': '在檔案管理器中顯示',
    'Open in External Editor': '在外部編輯器中開啟',
    'Open With': '開啟方式',
    'Create Issue on GitHub': '在 GitHub 建立 Issue',
    'New Worktree': '新增工作樹',
    'Repository Settings': '倉庫設定',
    'New Branch': '新增分支',
    Rename: '重新命名',
    Delete: '刪除',
    'Discard All Changes': '放棄所有變更',
    'Stash All Changes': '暫存所有變更',
    'Compare to Branch': '與分支比較',
    'Merge into Current Branch': '合併到目前分支',
    'Squash and Merge into Current Branch': '壓縮並合併到目前分支',
    'Rebase Current Branch': '變基目前分支',
    'Compare on GitHub': '在 GitHub 比較',
    'View Branch on GitHub': '在 GitHub 檢視分支',
    'Preview Pull Request': '預覽 Pull Request',
    'Create Pull Request': '建立 Pull Request',
    'View Pull Request on GitHub': '在 GitHub 檢視 Pull Request',
    'Report Issue': '回報問題',
    'Contact GitHub Support': '聯絡 GitHub 支援',
    'Show User Guides': '顯示使用指南',
    'Show Keyboard Shortcuts': '顯示鍵盤快捷鍵',
    'Show Logs in Finder': '在 Finder 中顯示日誌',
    'Show logs in Explorer': '在檔案總管中顯示日誌',
    'Show logs in your File Manager': '在檔案管理器中顯示日誌'
  }
}

const additionalAppMenuTranslations: Record<string, Record<string, string>> = {
  de: {
    'About GitHub Desktop': 'Über GitHub Desktop',
    Settings: 'Einstellungen',
    'Install Command Line Tool': 'Befehlszeilentool installieren',
    Services: 'Dienste',
    'Hide Others': 'Andere ausblenden',
    'Show All': 'Alle anzeigen',
    'New Repository': 'Neues Repository',
    'Add Local Repository': 'Lokales Repository hinzufügen',
    'Clone Repository': 'Repository klonen',
    Options: 'Optionen',
    Exit: 'Beenden',
    Undo: 'Rückgängig',
    Redo: 'Wiederholen',
    Cut: 'Ausschneiden',
    Copy: 'Kopieren',
    Paste: 'Einfügen',
    'Select All': 'Alles auswählen',
    Find: 'Suchen',
    'Show Changes': 'Änderungen anzeigen',
    Changes: 'Änderungen',
    'Show History': 'Verlauf anzeigen',
    History: 'Verlauf',
    'Show Repository List': 'Repositoryliste anzeigen',
    'Repository list': 'Repositoryliste',
    'Show Branches List': 'Branchliste anzeigen',
    'Branches list': 'Branchliste',
    'Show Worktrees List': 'Worktree-Liste anzeigen',
    'Worktrees list': 'Worktree-Liste',
    'Go to Summary': 'Zur Zusammenfassung',
    'Show Stashed Changes': 'Stash-Änderungen anzeigen',
    'Hide Stashed Changes': 'Stash-Änderungen ausblenden',
    'Show Changes Filter': 'Änderungsfilter anzeigen',
    'Hide Changes Filter': 'Änderungsfilter ausblenden',
    'Toggle Full Screen': 'Vollbild umschalten',
    'Reset Zoom': 'Zoom zurücksetzen',
    'Zoom In': 'Vergrößern',
    'Zoom Out': 'Verkleinern',
    'Expand Active Resizable': 'Aktiven Bereich erweitern',
    'Contract Active Resizable': 'Aktiven Bereich verkleinern',
    Reload: 'Neu laden',
    'Toggle Developer Tools': 'Entwicklertools umschalten',
    Push: 'Push',
    'Force Push': 'Force Push',
    Pull: 'Pull',
    Fetch: 'Fetch',
    Remove: 'Entfernen',
    'View on GitHub': 'Auf GitHub anzeigen',
    'Open in Shell': 'In Shell öffnen',
    'Show in Finder': 'Im Finder anzeigen',
    'Show in Explorer': 'Im Explorer anzeigen',
    'Show in your File Manager': 'Im Dateimanager anzeigen',
    'Open in External Editor': 'In externem Editor öffnen',
    'Open With': 'Öffnen mit',
    'Create Issue on GitHub': 'Issue auf GitHub erstellen',
    'New Worktree': 'Neuer Worktree',
    'Repository Settings': 'Repository-Einstellungen',
    'New Branch': 'Neuer Branch',
    Rename: 'Umbenennen',
    Delete: 'Löschen',
    'Discard All Changes': 'Alle Änderungen verwerfen',
    'Stash All Changes': 'Alle Änderungen stashen',
    'Compare to Branch': 'Mit Branch vergleichen',
    'Merge into Current Branch': 'In aktuellen Branch mergen',
    'Squash and Merge into Current Branch': 'Squash und Merge in aktuellen Branch',
    'Rebase Current Branch': 'Aktuellen Branch rebasen',
    'Compare on GitHub': 'Auf GitHub vergleichen',
    'View Branch on GitHub': 'Branch auf GitHub anzeigen',
    'Preview Pull Request': 'Pull Request vorschauen',
    'Create Pull Request': 'Pull Request erstellen',
    'View Pull Request on GitHub': 'Pull Request auf GitHub anzeigen',
    'Report Issue': 'Problem melden',
    'Contact GitHub Support': 'GitHub Support kontaktieren',
    'Show User Guides': 'Benutzerhandbücher anzeigen',
    'Show Keyboard Shortcuts': 'Tastenkürzel anzeigen',
    'Show Logs in Finder': 'Logs im Finder anzeigen',
    'Show logs in Explorer': 'Logs im Explorer anzeigen',
    'Show logs in your File Manager': 'Logs im Dateimanager anzeigen'
  },
  es: {
    'About GitHub Desktop': 'Acerca de GitHub Desktop',
    Settings: 'Configuración',
    'Install Command Line Tool': 'Instalar herramienta de línea de comandos',
    Services: 'Servicios',
    'Hide Others': 'Ocultar otros',
    'Show All': 'Mostrar todo',
    'New Repository': 'Nuevo repositorio',
    'Add Local Repository': 'Añadir repositorio local',
    'Clone Repository': 'Clonar repositorio',
    Options: 'Opciones',
    Exit: 'Salir',
    Undo: 'Deshacer',
    Redo: 'Rehacer',
    Cut: 'Cortar',
    Copy: 'Copiar',
    Paste: 'Pegar',
    'Select All': 'Seleccionar todo',
    Find: 'Buscar',
    'Show Changes': 'Mostrar cambios',
    Changes: 'Cambios',
    'Show History': 'Mostrar historial',
    History: 'Historial',
    'Show Repository List': 'Mostrar lista de repositorios',
    'Repository list': 'Lista de repositorios',
    'Show Branches List': 'Mostrar lista de ramas',
    'Branches list': 'Lista de ramas',
    'Show Worktrees List': 'Mostrar lista de worktrees',
    'Worktrees list': 'Lista de worktrees',
    'Go to Summary': 'Ir al resumen',
    'Show Stashed Changes': 'Mostrar cambios guardados',
    'Hide Stashed Changes': 'Ocultar cambios guardados',
    'Show Changes Filter': 'Mostrar filtro de cambios',
    'Hide Changes Filter': 'Ocultar filtro de cambios',
    'Toggle Full Screen': 'Alternar pantalla completa',
    'Reset Zoom': 'Restablecer zoom',
    'Zoom In': 'Acercar',
    'Zoom Out': 'Alejar',
    'Expand Active Resizable': 'Expandir área activa',
    'Contract Active Resizable': 'Contraer área activa',
    Reload: 'Recargar',
    'Toggle Developer Tools': 'Alternar herramientas de desarrollo',
    Push: 'Enviar',
    'Force Push': 'Forzar envío',
    Pull: 'Traer',
    Fetch: 'Obtener',
    Remove: 'Eliminar',
    'View on GitHub': 'Ver en GitHub',
    'Open in Shell': 'Abrir en shell',
    'Show in Finder': 'Mostrar en Finder',
    'Show in Explorer': 'Mostrar en Explorer',
    'Show in your File Manager': 'Mostrar en el gestor de archivos',
    'Open in External Editor': 'Abrir en editor externo',
    'Open With': 'Abrir con',
    'Create Issue on GitHub': 'Crear issue en GitHub',
    'New Worktree': 'Nuevo worktree',
    'Repository Settings': 'Configuración del repositorio',
    'New Branch': 'Nueva rama',
    Rename: 'Renombrar',
    Delete: 'Eliminar',
    'Discard All Changes': 'Descartar todos los cambios',
    'Stash All Changes': 'Guardar todos los cambios',
    'Compare to Branch': 'Comparar con rama',
    'Merge into Current Branch': 'Fusionar en la rama actual',
    'Squash and Merge into Current Branch': 'Squash y fusionar en la rama actual',
    'Rebase Current Branch': 'Rebase de la rama actual',
    'Compare on GitHub': 'Comparar en GitHub',
    'View Branch on GitHub': 'Ver rama en GitHub',
    'Preview Pull Request': 'Previsualizar pull request',
    'Create Pull Request': 'Crear pull request',
    'View Pull Request on GitHub': 'Ver pull request en GitHub',
    'Report Issue': 'Informar de un problema',
    'Contact GitHub Support': 'Contactar soporte de GitHub',
    'Show User Guides': 'Mostrar guías de usuario',
    'Show Keyboard Shortcuts': 'Mostrar atajos de teclado',
    'Show Logs in Finder': 'Mostrar logs en Finder',
    'Show logs in Explorer': 'Mostrar logs en Explorer',
    'Show logs in your File Manager': 'Mostrar logs en el gestor de archivos'
  },
  fr: {
    'About GitHub Desktop': 'À propos de GitHub Desktop',
    Settings: 'Paramètres',
    'Install Command Line Tool': 'Installer l’outil en ligne de commande',
    Services: 'Services',
    'Hide Others': 'Masquer les autres',
    'Show All': 'Tout afficher',
    'New Repository': 'Nouveau dépôt',
    'Add Local Repository': 'Ajouter un dépôt local',
    'Clone Repository': 'Cloner un dépôt',
    Options: 'Options',
    Exit: 'Quitter',
    Undo: 'Annuler',
    Redo: 'Rétablir',
    Cut: 'Couper',
    Copy: 'Copier',
    Paste: 'Coller',
    'Select All': 'Tout sélectionner',
    Find: 'Rechercher',
    'Show Changes': 'Afficher les changements',
    Changes: 'Changements',
    'Show History': 'Afficher l’historique',
    History: 'Historique',
    'Show Repository List': 'Afficher la liste des dépôts',
    'Repository list': 'Liste des dépôts',
    'Show Branches List': 'Afficher la liste des branches',
    'Branches list': 'Liste des branches',
    'Show Worktrees List': 'Afficher la liste des worktrees',
    'Worktrees list': 'Liste des worktrees',
    'Go to Summary': 'Aller au résumé',
    'Show Stashed Changes': 'Afficher les changements remisés',
    'Hide Stashed Changes': 'Masquer les changements remisés',
    'Show Changes Filter': 'Afficher le filtre des changements',
    'Hide Changes Filter': 'Masquer le filtre des changements',
    'Toggle Full Screen': 'Basculer en plein écran',
    'Reset Zoom': 'Réinitialiser le zoom',
    'Zoom In': 'Zoom avant',
    'Zoom Out': 'Zoom arrière',
    'Expand Active Resizable': 'Agrandir la zone active',
    'Contract Active Resizable': 'Réduire la zone active',
    Reload: 'Recharger',
    'Toggle Developer Tools': 'Basculer les outils de développement',
    Push: 'Pousser',
    'Force Push': 'Forcer le push',
    Pull: 'Tirer',
    Fetch: 'Récupérer',
    Remove: 'Supprimer',
    'View on GitHub': 'Voir sur GitHub',
    'Open in Shell': 'Ouvrir dans le shell',
    'Show in Finder': 'Afficher dans le Finder',
    'Show in Explorer': 'Afficher dans l’Explorer',
    'Show in your File Manager': 'Afficher dans le gestionnaire de fichiers',
    'Open in External Editor': 'Ouvrir dans l’éditeur externe',
    'Open With': 'Ouvrir avec',
    'Create Issue on GitHub': 'Créer une issue sur GitHub',
    'New Worktree': 'Nouveau worktree',
    'Repository Settings': 'Paramètres du dépôt',
    'New Branch': 'Nouvelle branche',
    Rename: 'Renommer',
    Delete: 'Supprimer',
    'Discard All Changes': 'Ignorer tous les changements',
    'Stash All Changes': 'Remiser tous les changements',
    'Compare to Branch': 'Comparer à une branche',
    'Merge into Current Branch': 'Fusionner dans la branche actuelle',
    'Squash and Merge into Current Branch': 'Squash et fusionner dans la branche actuelle',
    'Rebase Current Branch': 'Rebaser la branche actuelle',
    'Compare on GitHub': 'Comparer sur GitHub',
    'View Branch on GitHub': 'Voir la branche sur GitHub',
    'Preview Pull Request': 'Prévisualiser la pull request',
    'Create Pull Request': 'Créer une pull request',
    'View Pull Request on GitHub': 'Voir la pull request sur GitHub',
    'Report Issue': 'Signaler un problème',
    'Contact GitHub Support': 'Contacter le support GitHub',
    'Show User Guides': 'Afficher les guides utilisateur',
    'Show Keyboard Shortcuts': 'Afficher les raccourcis clavier',
    'Show Logs in Finder': 'Afficher les journaux dans le Finder',
    'Show logs in Explorer': 'Afficher les journaux dans l’Explorer',
    'Show logs in your File Manager': 'Afficher les journaux dans le gestionnaire de fichiers'
  },
  it: {
    'About GitHub Desktop': 'Informazioni su GitHub Desktop',
    Settings: 'Impostazioni',
    'Install Command Line Tool': 'Installa strumento da riga di comando',
    Services: 'Servizi',
    'Hide Others': 'Nascondi altri',
    'Show All': 'Mostra tutto',
    'New Repository': 'Nuovo repository',
    'Add Local Repository': 'Aggiungi repository locale',
    'Clone Repository': 'Clona repository',
    Options: 'Opzioni',
    Exit: 'Esci',
    Undo: 'Annulla',
    Redo: 'Ripeti',
    Cut: 'Taglia',
    Copy: 'Copia',
    Paste: 'Incolla',
    'Select All': 'Seleziona tutto',
    Find: 'Trova',
    'Show Changes': 'Mostra modifiche',
    Changes: 'Modifiche',
    'Show History': 'Mostra cronologia',
    History: 'Cronologia',
    'Show Repository List': 'Mostra elenco repository',
    'Repository list': 'Elenco repository',
    'Show Branches List': 'Mostra elenco branch',
    'Branches list': 'Elenco branch',
    'Show Worktrees List': 'Mostra elenco worktree',
    'Worktrees list': 'Elenco worktree',
    'Go to Summary': 'Vai al riepilogo',
    'Show Stashed Changes': 'Mostra modifiche in stash',
    'Hide Stashed Changes': 'Nascondi modifiche in stash',
    'Show Changes Filter': 'Mostra filtro modifiche',
    'Hide Changes Filter': 'Nascondi filtro modifiche',
    'Toggle Full Screen': 'Attiva/disattiva schermo intero',
    'Reset Zoom': 'Reimposta zoom',
    'Zoom In': 'Aumenta zoom',
    'Zoom Out': 'Riduci zoom',
    'Expand Active Resizable': 'Espandi area attiva',
    'Contract Active Resizable': 'Riduci area attiva',
    Reload: 'Ricarica',
    'Toggle Developer Tools': 'Attiva/disattiva strumenti sviluppatore',
    Push: 'Push',
    'Force Push': 'Force push',
    Pull: 'Pull',
    Fetch: 'Fetch',
    Remove: 'Rimuovi',
    'View on GitHub': 'Visualizza su GitHub',
    'Open in Shell': 'Apri nella shell',
    'Show in Finder': 'Mostra nel Finder',
    'Show in Explorer': 'Mostra in Explorer',
    'Show in your File Manager': 'Mostra nel file manager',
    'Open in External Editor': 'Apri nell’editor esterno',
    'Open With': 'Apri con',
    'Create Issue on GitHub': 'Crea issue su GitHub',
    'New Worktree': 'Nuovo worktree',
    'Repository Settings': 'Impostazioni repository',
    'New Branch': 'Nuovo branch',
    Rename: 'Rinomina',
    Delete: 'Elimina',
    'Discard All Changes': 'Scarta tutte le modifiche',
    'Stash All Changes': 'Metti tutte le modifiche in stash',
    'Compare to Branch': 'Confronta con branch',
    'Merge into Current Branch': 'Unisci nel branch corrente',
    'Squash and Merge into Current Branch': 'Squash e unisci nel branch corrente',
    'Rebase Current Branch': 'Rebase del branch corrente',
    'Compare on GitHub': 'Confronta su GitHub',
    'View Branch on GitHub': 'Visualizza branch su GitHub',
    'Preview Pull Request': 'Anteprima pull request',
    'Create Pull Request': 'Crea pull request',
    'View Pull Request on GitHub': 'Visualizza pull request su GitHub',
    'Report Issue': 'Segnala problema',
    'Contact GitHub Support': 'Contatta supporto GitHub',
    'Show User Guides': 'Mostra guide utente',
    'Show Keyboard Shortcuts': 'Mostra scorciatoie da tastiera',
    'Show Logs in Finder': 'Mostra log nel Finder',
    'Show logs in Explorer': 'Mostra log in Explorer',
    'Show logs in your File Manager': 'Mostra log nel file manager'
  },
  ja: {
    'About GitHub Desktop': 'GitHub Desktop について',
    Settings: '設定',
    'Install Command Line Tool': 'コマンドラインツールをインストール',
    Services: 'サービス',
    'Hide Others': 'ほかを隠す',
    'Show All': 'すべて表示',
    'New Repository': '新しいリポジトリ',
    'Add Local Repository': 'ローカルリポジトリを追加',
    'Clone Repository': 'リポジトリをクローン',
    Options: 'オプション',
    Exit: '終了',
    Undo: '元に戻す',
    Redo: 'やり直す',
    Cut: '切り取り',
    Copy: 'コピー',
    Paste: '貼り付け',
    'Select All': 'すべて選択',
    Find: '検索',
    'Show Changes': '変更を表示',
    Changes: '変更',
    'Show History': '履歴を表示',
    History: '履歴',
    'Show Repository List': 'リポジトリ一覧を表示',
    'Repository list': 'リポジトリ一覧',
    'Show Branches List': 'ブランチ一覧を表示',
    'Branches list': 'ブランチ一覧',
    'Show Worktrees List': 'ワークツリー一覧を表示',
    'Worktrees list': 'ワークツリー一覧',
    'Go to Summary': '概要へ移動',
    'Show Stashed Changes': '退避した変更を表示',
    'Hide Stashed Changes': '退避した変更を隠す',
    'Show Changes Filter': '変更フィルターを表示',
    'Hide Changes Filter': '変更フィルターを隠す',
    'Toggle Full Screen': 'フルスクリーン切り替え',
    'Reset Zoom': 'ズームをリセット',
    'Zoom In': '拡大',
    'Zoom Out': '縮小',
    'Expand Active Resizable': 'アクティブ領域を拡大',
    'Contract Active Resizable': 'アクティブ領域を縮小',
    Reload: '再読み込み',
    'Toggle Developer Tools': '開発者ツールを切り替え',
    Push: 'プッシュ',
    'Force Push': '強制プッシュ',
    Pull: 'プル',
    Fetch: 'フェッチ',
    Remove: '削除',
    'View on GitHub': 'GitHub で表示',
    'Open in Shell': 'シェルで開く',
    'Show in Finder': 'Finder で表示',
    'Show in Explorer': 'Explorer で表示',
    'Show in your File Manager': 'ファイルマネージャーで表示',
    'Open in External Editor': '外部エディターで開く',
    'Open With': 'このアプリで開く',
    'Create Issue on GitHub': 'GitHub で Issue を作成',
    'New Worktree': '新しいワークツリー',
    'Repository Settings': 'リポジトリ設定',
    'New Branch': '新しいブランチ',
    Rename: '名前を変更',
    Delete: '削除',
    'Discard All Changes': 'すべての変更を破棄',
    'Stash All Changes': 'すべての変更を退避',
    'Compare to Branch': 'ブランチと比較',
    'Merge into Current Branch': '現在のブランチへマージ',
    'Squash and Merge into Current Branch': 'スカッシュして現在のブランチへマージ',
    'Rebase Current Branch': '現在のブランチをリベース',
    'Compare on GitHub': 'GitHub で比較',
    'View Branch on GitHub': 'GitHub でブランチを表示',
    'Preview Pull Request': 'Pull Request をプレビュー',
    'Create Pull Request': 'Pull Request を作成',
    'View Pull Request on GitHub': 'GitHub で Pull Request を表示',
    'Report Issue': '問題を報告',
    'Contact GitHub Support': 'GitHub サポートに連絡',
    'Show User Guides': 'ユーザーガイドを表示',
    'Show Keyboard Shortcuts': 'キーボードショートカットを表示',
    'Show Logs in Finder': 'Finder でログを表示',
    'Show logs in Explorer': 'Explorer でログを表示',
    'Show logs in your File Manager': 'ファイルマネージャーでログを表示'
  },
  ko: {
    'About GitHub Desktop': 'GitHub Desktop 정보',
    Settings: '설정',
    'Install Command Line Tool': '명령줄 도구 설치',
    Services: '서비스',
    'Hide Others': '다른 항목 숨기기',
    'Show All': '모두 보기',
    'New Repository': '새 저장소',
    'Add Local Repository': '로컬 저장소 추가',
    'Clone Repository': '저장소 클론',
    Options: '옵션',
    Exit: '종료',
    Undo: '실행 취소',
    Redo: '다시 실행',
    Cut: '잘라내기',
    Copy: '복사',
    Paste: '붙여넣기',
    'Select All': '모두 선택',
    Find: '찾기',
    'Show Changes': '변경 사항 보기',
    Changes: '변경 사항',
    'Show History': '기록 보기',
    History: '기록',
    'Show Repository List': '저장소 목록 보기',
    'Repository list': '저장소 목록',
    'Show Branches List': '브랜치 목록 보기',
    'Branches list': '브랜치 목록',
    'Show Worktrees List': '워크트리 목록 보기',
    'Worktrees list': '워크트리 목록',
    'Go to Summary': '요약으로 이동',
    'Show Stashed Changes': '스태시된 변경 사항 보기',
    'Hide Stashed Changes': '스태시된 변경 사항 숨기기',
    'Show Changes Filter': '변경 필터 보기',
    'Hide Changes Filter': '변경 필터 숨기기',
    'Toggle Full Screen': '전체 화면 전환',
    'Reset Zoom': '확대/축소 재설정',
    'Zoom In': '확대',
    'Zoom Out': '축소',
    'Expand Active Resizable': '활성 영역 확장',
    'Contract Active Resizable': '활성 영역 축소',
    Reload: '새로고침',
    'Toggle Developer Tools': '개발자 도구 전환',
    Push: '푸시',
    'Force Push': '강제 푸시',
    Pull: '풀',
    Fetch: '페치',
    Remove: '제거',
    'View on GitHub': 'GitHub에서 보기',
    'Open in Shell': '셸에서 열기',
    'Show in Finder': 'Finder에서 보기',
    'Show in Explorer': 'Explorer에서 보기',
    'Show in your File Manager': '파일 관리자에서 보기',
    'Open in External Editor': '외부 편집기에서 열기',
    'Open With': '다음으로 열기',
    'Create Issue on GitHub': 'GitHub에서 Issue 만들기',
    'New Worktree': '새 워크트리',
    'Repository Settings': '저장소 설정',
    'New Branch': '새 브랜치',
    Rename: '이름 변경',
    Delete: '삭제',
    'Discard All Changes': '모든 변경 사항 버리기',
    'Stash All Changes': '모든 변경 사항 스태시',
    'Compare to Branch': '브랜치와 비교',
    'Merge into Current Branch': '현재 브랜치에 병합',
    'Squash and Merge into Current Branch': '스쿼시 후 현재 브랜치에 병합',
    'Rebase Current Branch': '현재 브랜치 리베이스',
    'Compare on GitHub': 'GitHub에서 비교',
    'View Branch on GitHub': 'GitHub에서 브랜치 보기',
    'Preview Pull Request': 'Pull Request 미리보기',
    'Create Pull Request': 'Pull Request 만들기',
    'View Pull Request on GitHub': 'GitHub에서 Pull Request 보기',
    'Report Issue': '문제 신고',
    'Contact GitHub Support': 'GitHub 지원에 문의',
    'Show User Guides': '사용자 가이드 보기',
    'Show Keyboard Shortcuts': '키보드 단축키 보기',
    'Show Logs in Finder': 'Finder에서 로그 보기',
    'Show logs in Explorer': 'Explorer에서 로그 보기',
    'Show logs in your File Manager': '파일 관리자에서 로그 보기'
  },
  pt: {
    'About GitHub Desktop': 'Sobre o GitHub Desktop',
    Settings: 'Configurações',
    'Install Command Line Tool': 'Instalar ferramenta de linha de comando',
    Services: 'Serviços',
    'Hide Others': 'Ocultar outros',
    'Show All': 'Mostrar tudo',
    'New Repository': 'Novo repositório',
    'Add Local Repository': 'Adicionar repositório local',
    'Clone Repository': 'Clonar repositório',
    Options: 'Opções',
    Exit: 'Sair',
    Undo: 'Desfazer',
    Redo: 'Refazer',
    Cut: 'Recortar',
    Copy: 'Copiar',
    Paste: 'Colar',
    'Select All': 'Selecionar tudo',
    Find: 'Buscar',
    'Show Changes': 'Mostrar alterações',
    Changes: 'Alterações',
    'Show History': 'Mostrar histórico',
    History: 'Histórico',
    'Show Repository List': 'Mostrar lista de repositórios',
    'Repository list': 'Lista de repositórios',
    'Show Branches List': 'Mostrar lista de branches',
    'Branches list': 'Lista de branches',
    'Show Worktrees List': 'Mostrar lista de worktrees',
    'Worktrees list': 'Lista de worktrees',
    'Go to Summary': 'Ir para o resumo',
    'Show Stashed Changes': 'Mostrar alterações em stash',
    'Hide Stashed Changes': 'Ocultar alterações em stash',
    'Show Changes Filter': 'Mostrar filtro de alterações',
    'Hide Changes Filter': 'Ocultar filtro de alterações',
    'Toggle Full Screen': 'Alternar tela cheia',
    'Reset Zoom': 'Redefinir zoom',
    'Zoom In': 'Aumentar zoom',
    'Zoom Out': 'Diminuir zoom',
    'Expand Active Resizable': 'Expandir área ativa',
    'Contract Active Resizable': 'Reduzir área ativa',
    Reload: 'Recarregar',
    'Toggle Developer Tools': 'Alternar ferramentas de desenvolvedor',
    Push: 'Push',
    'Force Push': 'Force push',
    Pull: 'Pull',
    Fetch: 'Fetch',
    Remove: 'Remover',
    'View on GitHub': 'Ver no GitHub',
    'Open in Shell': 'Abrir no shell',
    'Show in Finder': 'Mostrar no Finder',
    'Show in Explorer': 'Mostrar no Explorer',
    'Show in your File Manager': 'Mostrar no gerenciador de arquivos',
    'Open in External Editor': 'Abrir no editor externo',
    'Open With': 'Abrir com',
    'Create Issue on GitHub': 'Criar issue no GitHub',
    'New Worktree': 'Novo worktree',
    'Repository Settings': 'Configurações do repositório',
    'New Branch': 'Novo branch',
    Rename: 'Renomear',
    Delete: 'Excluir',
    'Discard All Changes': 'Descartar todas as alterações',
    'Stash All Changes': 'Guardar todas as alterações em stash',
    'Compare to Branch': 'Comparar com branch',
    'Merge into Current Branch': 'Mesclar no branch atual',
    'Squash and Merge into Current Branch': 'Squash e mesclar no branch atual',
    'Rebase Current Branch': 'Rebase do branch atual',
    'Compare on GitHub': 'Comparar no GitHub',
    'View Branch on GitHub': 'Ver branch no GitHub',
    'Preview Pull Request': 'Visualizar pull request',
    'Create Pull Request': 'Criar pull request',
    'View Pull Request on GitHub': 'Ver pull request no GitHub',
    'Report Issue': 'Relatar problema',
    'Contact GitHub Support': 'Contatar suporte do GitHub',
    'Show User Guides': 'Mostrar guias do usuário',
    'Show Keyboard Shortcuts': 'Mostrar atalhos de teclado',
    'Show Logs in Finder': 'Mostrar logs no Finder',
    'Show logs in Explorer': 'Mostrar logs no Explorer',
    'Show logs in your File Manager': 'Mostrar logs no gerenciador de arquivos'
  },
  tr: {
    'About GitHub Desktop': 'GitHub Desktop Hakkında',
    Settings: 'Ayarlar',
    'Install Command Line Tool': 'Komut satırı aracını yükle',
    Services: 'Servisler',
    'Hide Others': 'Diğerlerini gizle',
    'Show All': 'Tümünü göster',
    'New Repository': 'Yeni depo',
    'Add Local Repository': 'Yerel depo ekle',
    'Clone Repository': 'Depoyu klonla',
    Options: 'Seçenekler',
    Exit: 'Çıkış',
    Undo: 'Geri al',
    Redo: 'Yinele',
    Cut: 'Kes',
    Copy: 'Kopyala',
    Paste: 'Yapıştır',
    'Select All': 'Tümünü seç',
    Find: 'Bul',
    'Show Changes': 'Değişiklikleri göster',
    Changes: 'Değişiklikler',
    'Show History': 'Geçmişi göster',
    History: 'Geçmiş',
    'Show Repository List': 'Depo listesini göster',
    'Repository list': 'Depo listesi',
    'Show Branches List': 'Dal listesini göster',
    'Branches list': 'Dal listesi',
    'Show Worktrees List': 'Worktree listesini göster',
    'Worktrees list': 'Worktree listesi',
    'Go to Summary': 'Özete git',
    'Show Stashed Changes': 'Stash değişikliklerini göster',
    'Hide Stashed Changes': 'Stash değişikliklerini gizle',
    'Show Changes Filter': 'Değişiklik filtresini göster',
    'Hide Changes Filter': 'Değişiklik filtresini gizle',
    'Toggle Full Screen': 'Tam ekranı değiştir',
    'Reset Zoom': 'Yakınlaştırmayı sıfırla',
    'Zoom In': 'Yakınlaştır',
    'Zoom Out': 'Uzaklaştır',
    'Expand Active Resizable': 'Aktif alanı genişlet',
    'Contract Active Resizable': 'Aktif alanı daralt',
    Reload: 'Yeniden yükle',
    'Toggle Developer Tools': 'Geliştirici araçlarını değiştir',
    Push: 'Push',
    'Force Push': 'Force push',
    Pull: 'Pull',
    Fetch: 'Fetch',
    Remove: 'Kaldır',
    'View on GitHub': 'GitHub’da görüntüle',
    'Open in Shell': 'Shell’de aç',
    'Show in Finder': 'Finder’da göster',
    'Show in Explorer': 'Explorer’da göster',
    'Show in your File Manager': 'Dosya yöneticisinde göster',
    'Open in External Editor': 'Harici düzenleyicide aç',
    'Open With': 'Birlikte aç',
    'Create Issue on GitHub': 'GitHub’da issue oluştur',
    'New Worktree': 'Yeni worktree',
    'Repository Settings': 'Depo ayarları',
    'New Branch': 'Yeni dal',
    Rename: 'Yeniden adlandır',
    Delete: 'Sil',
    'Discard All Changes': 'Tüm değişiklikleri at',
    'Stash All Changes': 'Tüm değişiklikleri stashle',
    'Compare to Branch': 'Dalla karşılaştır',
    'Merge into Current Branch': 'Geçerli dala birleştir',
    'Squash and Merge into Current Branch': 'Squash edip geçerli dala birleştir',
    'Rebase Current Branch': 'Geçerli dalı rebase et',
    'Compare on GitHub': 'GitHub’da karşılaştır',
    'View Branch on GitHub': 'Dalı GitHub’da görüntüle',
    'Preview Pull Request': 'Pull request önizle',
    'Create Pull Request': 'Pull request oluştur',
    'View Pull Request on GitHub': 'Pull request’i GitHub’da görüntüle',
    'Report Issue': 'Sorun bildir',
    'Contact GitHub Support': 'GitHub desteğiyle iletişime geç',
    'Show User Guides': 'Kullanıcı kılavuzlarını göster',
    'Show Keyboard Shortcuts': 'Klavye kısayollarını göster',
    'Show Logs in Finder': 'Logları Finder’da göster',
    'Show logs in Explorer': 'Logları Explorer’da göster',
    'Show logs in your File Manager': 'Logları dosya yöneticisinde göster'
  }
}

for (const [language, translations] of Object.entries(additionalAppMenuTranslations)) {
  Object.assign(appMenuRootTranslations[language], translations)
}

const dialogTranslations: Record<string, {
  selectRepositoryFirst: string
  ok: string
  setWorkspaceTitle: string
  setWorkspaceDetail: string
  useRepositoryRoot: string
  selectSubdirectory: string
  cancel: string
  selectRepositorySubdirectory: string
}> = {
  de: {
    selectRepositoryFirst: 'Bitte zuerst ein Git-Repository auswaehlen.',
    ok: 'OK',
    setWorkspaceTitle: 'Notiz-Arbeitsbereich festlegen',
    setWorkspaceDetail: 'Dies wechselt den Notizordner. Standardmaessig wird das aktuelle Git-Projektstammverzeichnis verwendet; optional kann ein Unterordner gewaehlt werden.',
    useRepositoryRoot: 'Projektstamm verwenden',
    selectSubdirectory: 'Unterordner waehlen',
    cancel: 'Abbrechen',
    selectRepositorySubdirectory: 'Bitte einen Unterordner des aktuellen Git-Projekts waehlen.'
  },
  en: {
    selectRepositoryFirst: 'Please select a Git repository first.',
    ok: 'OK',
    setWorkspaceTitle: 'Set notes workspace',
    setWorkspaceDetail: 'This will switch the notes directory. By default it uses the current Git project root; you can also choose a subdirectory inside the project.',
    useRepositoryRoot: 'Use project root',
    selectSubdirectory: 'Choose subdirectory',
    cancel: 'Cancel',
    selectRepositorySubdirectory: 'Please choose a subdirectory inside the current Git project.'
  },
  es: {
    selectRepositoryFirst: 'Selecciona primero un repositorio Git.',
    ok: 'Aceptar',
    setWorkspaceTitle: 'Definir espacio de notas',
    setWorkspaceDetail: 'Esto cambiara el directorio de notas. De forma predeterminada usa la raiz del proyecto Git actual; tambien puedes elegir un subdirectorio del proyecto.',
    useRepositoryRoot: 'Usar raiz del proyecto',
    selectSubdirectory: 'Elegir subdirectorio',
    cancel: 'Cancelar',
    selectRepositorySubdirectory: 'Elige un subdirectorio dentro del proyecto Git actual.'
  },
  fr: {
    selectRepositoryFirst: 'Selectionnez d abord un depot Git.',
    ok: 'OK',
    setWorkspaceTitle: 'Definir l espace de notes',
    setWorkspaceDetail: 'Cela changera le dossier des notes. Par defaut, la racine du projet Git actuel est utilisee; vous pouvez aussi choisir un sous-dossier du projet.',
    useRepositoryRoot: 'Utiliser la racine du projet',
    selectSubdirectory: 'Choisir un sous-dossier',
    cancel: 'Annuler',
    selectRepositorySubdirectory: 'Veuillez choisir un sous-dossier du projet Git actuel.'
  },
  it: {
    selectRepositoryFirst: 'Seleziona prima un repository Git.',
    ok: 'OK',
    setWorkspaceTitle: 'Imposta area note',
    setWorkspaceDetail: 'Questo cambiera la cartella delle note. Per impostazione predefinita usa la radice del progetto Git corrente; puoi anche scegliere una sottocartella del progetto.',
    useRepositoryRoot: 'Usa radice progetto',
    selectSubdirectory: 'Scegli sottocartella',
    cancel: 'Annulla',
    selectRepositorySubdirectory: 'Scegli una sottocartella del progetto Git corrente.'
  },
  ja: {
    selectRepositoryFirst: '先に Git リポジトリを選択してください。',
    ok: 'OK',
    setWorkspaceTitle: 'ノート作業領域を設定',
    setWorkspaceDetail: 'ノートディレクトリを切り替えます。既定では現在の Git プロジェクトのルートを使用します。プロジェクト内のサブディレクトリも選択できます。',
    useRepositoryRoot: 'プロジェクトルートを使用',
    selectSubdirectory: 'サブディレクトリを選択',
    cancel: 'キャンセル',
    selectRepositorySubdirectory: '現在の Git プロジェクト内のサブディレクトリを選択してください。'
  },
  ko: {
    selectRepositoryFirst: '먼저 Git 저장소를 선택하세요.',
    ok: '확인',
    setWorkspaceTitle: '노트 작업 영역 설정',
    setWorkspaceDetail: '노트 디렉터리를 전환합니다. 기본값은 현재 Git 프로젝트 루트이며, 프로젝트 안의 하위 디렉터리를 선택할 수도 있습니다.',
    useRepositoryRoot: '프로젝트 루트 사용',
    selectSubdirectory: '하위 디렉터리 선택',
    cancel: '취소',
    selectRepositorySubdirectory: '현재 Git 프로젝트 안의 하위 디렉터리를 선택하세요.'
  },
  pt: {
    selectRepositoryFirst: 'Selecione primeiro um repositorio Git.',
    ok: 'OK',
    setWorkspaceTitle: 'Definir area de notas',
    setWorkspaceDetail: 'Isto vai trocar o diretorio de notas. Por padrao usa a raiz do projeto Git atual; voce tambem pode escolher um subdiretorio do projeto.',
    useRepositoryRoot: 'Usar raiz do projeto',
    selectSubdirectory: 'Escolher subdiretorio',
    cancel: 'Cancelar',
    selectRepositorySubdirectory: 'Escolha um subdiretorio dentro do projeto Git atual.'
  },
  tr: {
    selectRepositoryFirst: 'Lutfen once bir Git deposu secin.',
    ok: 'Tamam',
    setWorkspaceTitle: 'Not calisma alanini ayarla',
    setWorkspaceDetail: 'Bu islem not dizinini degistirir. Varsayilan olarak mevcut Git proje kok dizini kullanilir; proje icindeki bir alt dizini de secebilirsiniz.',
    useRepositoryRoot: 'Proje kokunu kullan',
    selectSubdirectory: 'Alt dizin sec',
    cancel: 'Iptal',
    selectRepositorySubdirectory: 'Lutfen mevcut Git projesi icinde bir alt dizin secin.'
  },
  'zh-CN': {
    selectRepositoryFirst: '请先选择一个 Git 仓库。',
    ok: '确定',
    setWorkspaceTitle: '设置笔记工作区',
    setWorkspaceDetail: '这将会切换笔记目录。默认使用当前 Git 项目根目录，也可以选择项目下的子目录。',
    useRepositoryRoot: '使用项目根目录',
    selectSubdirectory: '选择子目录',
    cancel: '取消',
    selectRepositorySubdirectory: '请选择当前 Git 项目下的子目录。'
  },
  'zh-TW': {
    selectRepositoryFirst: '請先選擇一個 Git 倉庫。',
    ok: '確定',
    setWorkspaceTitle: '設定筆記工作區',
    setWorkspaceDetail: '這將會切換筆記目錄。預設使用目前 Git 專案根目錄，也可以選擇專案下的子目錄。',
    useRepositoryRoot: '使用專案根目錄',
    selectSubdirectory: '選擇子目錄',
    cancel: '取消',
    selectRepositorySubdirectory: '請選擇目前 Git 專案下的子目錄。'
  }
}

const getDialogText = (language: string | null | undefined): typeof dialogTranslations.en =>
  dialogTranslations[language || ''] ?? dialogTranslations.en

const normalizeMenuLabel = (label: string): string =>
  label.replace(/&/g, '').replace(/\.\.\.$/, '').replace(/…$/, '')

const cloneMenuItemWithLocale = (item: MenuItem, translations: Record<string, string>): MenuItem => {
  if (item.type === 'separator') return item

  const label = translations[normalizeMenuLabel(item.label)] ?? item.label

  if (item.type === 'submenuItem') {
    return {
      ...item,
      label,
      accessKey: null,
      menu: localizeAppMenu(item.menu, translations)
    }
  }

  return {
    ...item,
    label,
    accelerator: null,
    accessKey: null
  }
}

const localizeAppMenu = (menu: IMenu, translations: Record<string, string>): IMenu => ({
  ...menu,
  selectedItem: menu.selectedItem
    ? cloneMenuItemWithLocale(menu.selectedItem, translations)
    : undefined,
  items: menu.items.map(item => cloneMenuItemWithLocale(item, translations))
})

const getLocalizedAppMenu = (language: string | null | undefined): IMenu => {
  const menu = menuFromElectronMenu(githubDesktopMenu)
  const translations = appMenuRootTranslations[language || ''] ?? appMenuRootTranslations.en
  return localizeAppMenu(menu, translations)
}

const sendAppMenu = (event: IpcMainEvent | IpcMainInvokeEvent): void => {
  const win = getWindowFromSender(event)
  const language = win ? views.get(win.id)?.currentLocalePayload?.language : null
  event.sender.send('app-menu', getLocalizedAppMenu(language))
}

const rebuildAppMenu = (): void => {
  githubDesktopMenu = buildDefaultMenu(currentMenuLabels)
}

const getMenuEventForId = (id: string): MenuEvent | null => {
  if (id === 'push') {
    return currentMenuLabels.isForcePushForCurrentRepository ? 'force-push' : 'push'
  }

  if (id === 'toggle-stashed-changes') {
    return currentMenuLabels.isStashedChangesVisible
      ? 'hide-stashed-changes'
      : 'show-stashed-changes'
  }

  return menuEventById[id] ?? null
}

const executeRoleMenuItem = (
  event: IpcMainEvent,
  role: string | undefined
): boolean => {
  switch (role) {
    case 'undo':
      event.sender.undo()
      return true
    case 'redo':
      event.sender.redo()
      return true
    case 'cut':
      event.sender.cut()
      return true
    case 'copy':
      event.sender.copy()
      return true
    case 'paste':
      event.sender.paste()
      return true
    case 'selectAll':
    case 'selectall':
      event.sender.selectAll()
      return true
    case 'togglefullscreen': {
      const win = getWindowFromSender(event)
      if (win) {
        win.setFullScreen(!win.isFullScreen())
        return true
      }
      return false
    }
    case 'minimize':
      getWindowFromSender(event)?.minimize()
      return true
    case 'zoom': {
      const win = getWindowFromSender(event)
      if (win?.isMaximized()) win.unmaximize()
      else win?.maximize()
      return true
    }
    case 'close':
      getWindowFromSender(event)?.close()
      return true
    case 'quit':
      app.quit()
      return true
    default:
      return false
  }
}

const getWindowFromSender = (
  event: IpcMainEvent | IpcMainInvokeEvent
): BrowserWindow | null => {
  const directWindow = BrowserWindow.fromWebContents(event.sender)
  if (directWindow) return directWindow

  for (const [windowId, entry] of views) {
    if (entry.view.webContents.id === event.sender.id) {
      return BrowserWindow.fromId(windowId)
    }
  }

  return null
}

const getGitHubDesktopIndexPath = (): string => {
  const devPath = path.join(process.cwd(), 'src', 'githubDesktop', 'out', 'index.html')
  if (fs.existsSync(devPath)) return devPath

  const resourcePath = path.join(
    process.resourcesPath,
    'githubDesktop',
    'out',
    'index.html'
  )
  if (fs.existsSync(resourcePath)) return resourcePath

  return path.join(__dirname, '..', 'githubDesktop', 'out', 'index.html')
}

const normalizeBounds = (bounds: Rectangle): Rectangle => ({
  x: Math.max(0, Math.floor(bounds.x || 0)),
  y: Math.max(0, Math.floor(bounds.y || 0)),
  width: Math.max(1, Math.floor(bounds.width || 1)),
  height: Math.max(1, Math.floor(bounds.height || 1))
})

const isChildPath = (parentPath: string, candidatePath: string): boolean => {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(candidatePath))
  return !!relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}

const getOrCreateView = (win: BrowserWindow): GitHubDesktopViewEntry => {
  const existing = views.get(win.id)
  if (existing) return existing

  const view = new BrowserView({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      spellcheck: true
    }
  })

  view.webContents.on('render-process-gone', (_event, details) => {
    log.error('GitHub Desktop renderer gone:', details)
  })
  view.webContents.on('did-fail-load', (_event, code, description, url) => {
    log.error(`GitHub Desktop failed to load: ${code}; ${description}; ${url}`)
  })

  const entry = {
    view,
    loaded: false,
    currentRepositoryPath: null,
    currentThemePayload: null,
    currentLocalePayload: null
  }
  views.set(win.id, entry)

  win.on('closed', () => {
    views.delete(win.id)
  })

  return entry
}

const showGitHubDesktop = async (win: BrowserWindow, bounds: Rectangle): Promise<void> => {
  const entry = getOrCreateView(win)
  if (!win.getBrowserViews().includes(entry.view)) {
    win.addBrowserView(entry.view)
  }

  entry.view.setBounds(normalizeBounds(bounds))
  entry.view.setAutoResize({ width: true, height: true })

  if (!entry.loaded) {
    entry.loaded = true
    await entry.view.webContents.loadFile(getGitHubDesktopIndexPath())
    flushURLActions(entry)
    if (entry.currentThemePayload) {
      entry.view.webContents.send('marknotepro-theme-updated', entry.currentThemePayload)
    }
    if (entry.currentLocalePayload) {
      entry.view.webContents.send('marknotepro-locale-updated', entry.currentLocalePayload)
      entry.view.webContents.send('app-menu', getLocalizedAppMenu(entry.currentLocalePayload.language))
    }
  }
}

const hideGitHubDesktop = (win: BrowserWindow): void => {
  const entry = views.get(win.id)
  if (!entry) return
  if (win.getBrowserViews().includes(entry.view)) {
    win.removeBrowserView(entry.view)
  }
}

const getWindowState = (win: BrowserWindow): string => {
  if (win.isFullScreen()) return 'full-screen'
  if (win.isMaximized()) return 'maximized'
  if (win.isMinimized()) return 'minimized'
  if (!win.isVisible()) return 'hidden'
  return 'normal'
}

const getGuidPath = (): string => path.join(app.getPath('userData'), '.github-desktop-guid')

const configureGitHubDesktopGitEnvironment = (): void => {
  if (process.env.MARKNOTEPRO_GITHUB_DESKTOP_GIT_DIR) return

  try {
    process.env.MARKNOTEPRO_GITHUB_DESKTOP_GIT_DIR = resolveEmbeddedGitDir()
  } catch (err) {
    log.error('Failed to resolve GitHub Desktop embedded Git directory', err)
  }
}

const flushURLActions = (entry?: GitHubDesktopViewEntry): void => {
  const entries = entry ? [entry] : Array.from(views.values()).filter(item => item.loaded)
  if (!entries.length || !pendingURLActions.length) return

  const actions = pendingURLActions.splice(0, pendingURLActions.length)
  for (const action of actions) {
    for (const target of entries) {
      target.view.webContents.send('url-action', action)
    }
  }
}

const dispatchURLAction = (action: URLActionType): void => {
  const loadedEntries = Array.from(views.values()).filter(entry => entry.loaded)
  if (!loadedEntries.length) {
    pendingURLActions.push(action)
    return
  }

  for (const entry of loadedEntries) {
    entry.view.webContents.send('url-action', action)
  }
}

const handleProtocolURL = (url: string): void => {
  if (!githubDesktopProtocols.some(protocol => url.startsWith(`${protocol}:`))) {
    return
  }

  log.info(`GitHub Desktop protocol callback received: ${url.split('?')[0]}`)
  dispatchURLAction(parseAppURL(url))
}

const registerGitHubDesktopProtocols = (): void => {
  if (protocolsRegistered) return
  protocolsRegistered = true

  const protocolArgs = app.isPackaged ? [] : [app.getAppPath()]

  for (const protocol of githubDesktopProtocols) {
    try {
      if (process.platform === 'win32') {
        app.setAsDefaultProtocolClient(protocol, process.execPath, [
          ...protocolArgs,
          '--protocol-launcher'
        ])
      } else {
        app.setAsDefaultProtocolClient(protocol, process.execPath, protocolArgs)
      }
    } catch (err) {
      log.error(`Failed to register GitHub Desktop protocol '${protocol}'`, err)
    }
  }
}

const registerGitHubDesktopProtocolHandlers = (): void => {
  if (protocolHandlersRegistered) return
  protocolHandlersRegistered = true

  app.whenReady().then(registerGitHubDesktopProtocols).catch(err => {
    log.error('Failed to register GitHub Desktop protocols', err)
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleProtocolURL(url)
  })

  app.on('second-instance', (_event, argv) => {
    for (const arg of argv) {
      handleProtocolURL(arg)
    }
  })
}

const registerGitHubDesktopViewHandlers = (): void => {
  ipcMain.handle('mt::github-desktop::show', async (event, bounds: Rectangle) => {
    const win = getWindowFromSender(event)
    if (!win) return
    await showGitHubDesktop(win, bounds)
  })

  ipcMain.handle('mt::github-desktop::get-selected-repository-path', (event) => {
    const win = getWindowFromSender(event)
    if (!win) return null
    return views.get(win.id)?.currentRepositoryPath ?? null
  })

  ipcMain.handle('mt::github-desktop::select-workspace-directory', async (event, defaultPath: string) => {
    const win = getWindowFromSender(event)
    const options: OpenDialogOptions = {
      defaultPath,
      properties: ['openDirectory', 'createDirectory']
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : result.filePaths[0] ?? null
  })

  ipcMain.handle('mt::github-desktop::choose-workspace-from-current-repository', async (event) => {
    const win = getWindowFromSender(event)
    if (!win) return null

    const viewEntry = views.get(win.id)
    const text = getDialogText(viewEntry?.currentLocalePayload?.language)
    const repositoryPath = viewEntry?.currentRepositoryPath
    if (!repositoryPath) {
      await dialog.showMessageBox(win, {
        type: 'warning',
        message: text.selectRepositoryFirst,
        buttons: [text.ok]
      })
      return null
    }

    const normalizedRepositoryPath = path.normalize(repositoryPath)
    const choice = await dialog.showMessageBox(win, {
      type: 'question',
      message: text.setWorkspaceTitle,
      detail: text.setWorkspaceDetail,
      buttons: [text.useRepositoryRoot, text.selectSubdirectory, text.cancel],
      defaultId: 0,
      cancelId: 2
    })

    if (choice.response === 2) return null

    let workspacePath = normalizedRepositoryPath
    if (choice.response === 1) {
      const result = await dialog.showOpenDialog(win, {
        defaultPath: normalizedRepositoryPath,
        properties: ['openDirectory', 'createDirectory']
      })
      if (result.canceled) return null

      const selectedPath = path.normalize(result.filePaths[0] ?? '')
      if (!selectedPath || !isChildPath(normalizedRepositoryPath, selectedPath)) {
        await dialog.showMessageBox(win, {
          type: 'warning',
          message: text.selectRepositorySubdirectory,
          buttons: [text.ok]
        })
        return null
      }
      workspacePath = selectedPath
    }

    await fs.ensureDir(workspacePath)
    win.webContents.send('mt::github-desktop::workspace-selected', workspacePath)
    return workspacePath
  })

  ipcMain.on('mt::github-desktop::set-bounds', (event, bounds: Rectangle) => {
    const win = getWindowFromSender(event)
    if (!win) return
    const entry = views.get(win.id)
    entry?.view.setBounds(normalizeBounds(bounds))
  })

  ipcMain.on('mt::github-desktop::theme-update', (event, payload: GitHubDesktopThemePayload) => {
    const win = getWindowFromSender(event)
    if (!win) return
    const entry = views.get(win.id)
    if (!entry) return
    entry.currentThemePayload = payload
    if (entry.loaded) {
      entry.view.webContents.send('marknotepro-theme-updated', payload)
    }
  })

  ipcMain.on('mt::github-desktop::locale-update', (event, payload: GitHubDesktopLocalePayload) => {
    const win = getWindowFromSender(event)
    if (!win) return
    const entry = views.get(win.id)
    if (!entry) return
    entry.currentLocalePayload = payload
    if (entry.loaded) {
      entry.view.webContents.send('marknotepro-locale-updated', payload)
      entry.view.webContents.send('app-menu', getLocalizedAppMenu(payload.language))
    }
  })

  ipcMain.on('mt::github-desktop::hide', (event) => {
    const win = getWindowFromSender(event)
    if (win) hideGitHubDesktop(win)
  })

  ipcMain.on('mt::github-desktop::switch-to-note', (event) => {
    const win = getWindowFromSender(event)
    win?.webContents.send('mt::github-desktop::switch-to-note')
  })
}

const registerGitHubDesktopRendererHandlers = (): void => {
  ipcMain.on('log', (_event, level: string, message: string) => {
    const logger = log[level as keyof typeof log]
    if (typeof logger === 'function') {
      logger.call(log, message)
    } else {
      log.info(message)
    }
  })

  ipcMain.on('renderer-ready', () => undefined)
  ipcMain.on('update-menu-state', (event, items: Array<{ id: string; state: Partial<Electron.MenuItem> }>) => {
    let changed = false
    for (const item of items) {
      const menuItem = githubDesktopMenu.getMenuItemById(item.id)
      if (!menuItem) continue

      if (typeof item.state.enabled === 'boolean' && menuItem.enabled !== item.state.enabled) {
        menuItem.enabled = item.state.enabled
        changed = true
      }
      if (typeof item.state.visible === 'boolean' && menuItem.visible !== item.state.visible) {
        menuItem.visible = item.state.visible
        changed = true
      }
      if (typeof item.state.checked === 'boolean' && menuItem.checked !== item.state.checked) {
        menuItem.checked = item.state.checked
        changed = true
      }
    }

    if (changed) {
      sendAppMenu(event)
    }
  })
  ipcMain.on('update-preferred-app-menu-item-labels', (event, labels: MenuLabelsEvent) => {
    currentMenuLabels = labels
    rebuildAppMenu()
    sendAppMenu(event)
  })
  ipcMain.on('dialog-did-open', () => undefined)
  ipcMain.on('update-accounts', () => undefined)
  ipcMain.on('mt::github-desktop::selected-repository-path', (event, repositoryPath: string | null) => {
    const win = getWindowFromSender(event)
    if (!win) return
    const entry = views.get(win.id)
    if (entry) {
      entry.currentRepositoryPath = repositoryPath
    }
    win.webContents.send('mt::github-desktop::selected-repository-path', repositoryPath)
  })
  ipcMain.on('install-windows-cli', () => undefined)
  ipcMain.on('uninstall-windows-cli', () => undefined)
  ipcMain.on('set-native-theme-source', () => undefined)
  ipcMain.on('set-window-zoom-factor', (event, zoomFactor: number) => {
    event.sender.setZoomFactor(zoomFactor)
  })
  ipcMain.on('focus-window', (event) => {
    getWindowFromSender(event)?.focus()
  })
  ipcMain.on('minimize-window', (event) => getWindowFromSender(event)?.minimize())
  ipcMain.on('maximize-window', (event) => getWindowFromSender(event)?.maximize())
  ipcMain.on('unmaximize-window', (event) => getWindowFromSender(event)?.unmaximize())
  ipcMain.on('close-window', (event) => getWindowFromSender(event)?.close())
  ipcMain.on('quit-app', () => app.quit())
  ipcMain.on('quit-and-install-updates', () => app.quit())
  ipcMain.on('unsafe-open-directory', (_event, targetPath: string) => {
    shell.openPath(targetPath).catch(err => log.error('open directory failed:', err))
  })
  ipcMain.on('execute-menu-item-by-id', (event, id: string) => {
    const menuEvent = getMenuEventForId(id)
    if (menuEvent) {
      event.sender.send('menu-event', menuEvent)
      return
    }

    const menuItem = githubDesktopMenu.getMenuItemById(id)
    const role = (menuItem as unknown as { role?: string } | null)?.role
    if (executeRoleMenuItem(event, role)) {
      return
    }

    if (menuItem) {
      const win = getWindowFromSender(event) || undefined
      const fakeEvent = { preventDefault: () => {}, sender: event.sender }
      menuItem.click(fakeEvent as Electron.KeyboardEvent, win, event.sender)
    }
  })
  ipcMain.on('uncaught-exception', (_event, error) => {
    log.error('GitHub Desktop uncaught exception:', error)
  })
  ipcMain.on('send-error-report', (_event, error) => {
    log.error('GitHub Desktop error report:', error)
  })
  ipcMain.on('get-app-menu', sendAppMenu)

  ;['will-quit', 'will-quit-even-if-updating', 'cancel-quitting'].forEach(channel => {
    ipcMain.on(channel, (event) => {
      event.returnValue = undefined
    })
  })

  ipcMain.handle('get-current-window-state', (event) => {
    const win = getWindowFromSender(event)
    return win ? getWindowState(win) : 'normal'
  })
  ipcMain.handle('get-current-window-zoom-factor', (event) => event.sender.getZoomFactor())
  ipcMain.handle('is-window-focused', (event) => !!getWindowFromSender(event)?.isFocused())
  ipcMain.handle('is-window-maximized', (event) => !!getWindowFromSender(event)?.isMaximized())
  ipcMain.handle('get-apple-action-on-double-click', () =>
    process.platform === 'darwin'
      ? systemPreferences.getUserDefault('AppleActionOnDoubleClick', 'string')
      : 'Maximize'
  )
  ipcMain.handle('should-use-dark-colors', () => nativeTheme.shouldUseDarkColors)
  ipcMain.handle('open-external', async (_event, target: string) => {
    await shell.openExternal(target)
    return true
  })
  ipcMain.handle('show-item-in-folder', async (_event, targetPath: string) => {
    shell.showItemInFolder(targetPath)
  })
  ipcMain.handle('move-to-trash', async (_event, targetPath: string) => {
    await shell.trashItem(targetPath)
  })
  ipcMain.handle('show-open-dialog', async (event, options: Electron.OpenDialogOptions) => {
    const win = getWindowFromSender(event)
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : result.filePaths[0] ?? null
  })
  ipcMain.handle('show-save-dialog', async (event, options: Electron.SaveDialogOptions) => {
    const win = getWindowFromSender(event)
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    return result.canceled ? null : result.filePath ?? null
  })
  ipcMain.handle('get-path', (_event, name: Parameters<typeof app.getPath>[0]) =>
    app.getPath(name)
  )
  ipcMain.handle('get-app-architecture', () => process.arch)
  ipcMain.handle('get-app-path', () => app.getAppPath())
  ipcMain.handle('get-exec-path', () => process.env.PATH ?? '')
  ipcMain.handle('is-running-under-arm64-translation', () => false)
  ipcMain.handle('is-in-application-folder', () => false)
  ipcMain.handle('move-to-applications-folder', () => undefined)
  ipcMain.handle('check-for-updates', () => undefined)
  ipcMain.handle('resolve-proxy', (_event, url: string) => session.defaultSession.resolveProxy(url))
  ipcMain.handle('show-contextual-menu', () => null)
  ipcMain.handle('save-guid', async (_event, guid: string) => {
    await fs.outputFile(getGuidPath(), guid)
  })
  ipcMain.handle('get-guid', async () => {
    const guidPath = getGuidPath()
    if (await fs.pathExists(guidPath)) {
      return fs.readFile(guidPath, 'utf8')
    }
    return ''
  })
  ipcMain.handle('show-notification', () => null)
  ipcMain.handle('get-notifications-permission', () => 'default')
  ipcMain.handle('request-notifications-permission', () => false)
}

const registerGitHubDesktopKeytarHandlers = (): void => {
  ipcMain.handle('mt::github-desktop::keytar-get-password', async (_e, service: string, account: string) => {
    try {
      return await keytar.getPassword(service, account)
    } catch (err) {
      log.error('GitHub Desktop keytar getPassword failed:', err)
      return null
    }
  })

  ipcMain.handle('mt::github-desktop::keytar-set-password', async (_e, service: string, account: string, password: string) => {
    try {
      await keytar.setPassword(service, account, password)
      return true
    } catch (err) {
      log.error('GitHub Desktop keytar setPassword failed:', err)
      return false
    }
  })

  ipcMain.handle('mt::github-desktop::keytar-delete-password', async (_e, service: string, account: string) => {
    try {
      return await keytar.deletePassword(service, account)
    } catch (err) {
      log.error('GitHub Desktop keytar deletePassword failed:', err)
      return false
    }
  })
}

export const registerGitHubDesktopHandlers = (): void => {
  configureGitHubDesktopGitEnvironment()
  registerGitHubDesktopProtocolHandlers()
  registerGitHubDesktopViewHandlers()
  registerGitHubDesktopRendererHandlers()
  registerGitHubDesktopKeytarHandlers()
}
