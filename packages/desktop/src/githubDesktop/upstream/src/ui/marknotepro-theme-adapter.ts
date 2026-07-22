import * as ipcRenderer from '../lib/ipc-renderer'

interface MarkNoteProThemePayload {
  readonly theme: string
  readonly isDark: boolean
  readonly colors: Record<string, string>
}

interface MarkNoteProLocalePayload {
  readonly language: string
}

const STYLE_ID = 'marknotepro-github-desktop-theme'
const ACTIONS_ID = 'marknotepro-github-desktop-actions'
const MENU_OBSERVER_ID = 'marknotepro-menu-observer-installed'
const INTERNAL_I18N_OBSERVER_ID = 'marknotepro-internal-i18n-observer-installed'

const SUPPORTED_LANGUAGES = [
  'de',
  'en',
  'es',
  'fr',
  'it',
  'ja',
  'ko',
  'pt',
  'tr',
  'zh-CN',
  'zh-TW'
] as const

type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number]

const localeText: Record<SupportedLanguage, {
  readonly note: string
  readonly setWorkspace: string
}> = {
  de: {
    note: 'Notizen',
    setWorkspace: 'Aktuelles Repository als Notiz-Arbeitsbereich festlegen'
  },
  en: {
    note: 'Notes',
    setWorkspace: 'Set current repository as notes workspace'
  },
  es: {
    note: 'Notas',
    setWorkspace: 'Usar el repositorio actual como espacio de notas'
  },
  fr: {
    note: 'Notes',
    setWorkspace: 'Utiliser le depot actuel comme espace de notes'
  },
  it: {
    note: 'Note',
    setWorkspace: 'Usa il repository corrente come area note'
  },
  ja: {
    note: 'ノート',
    setWorkspace: '現在のリポジトリをノート作業領域に設定'
  },
  ko: {
    note: '노트',
    setWorkspace: '현재 저장소를 노트 작업 영역으로 설정'
  },
  pt: {
    note: 'Notas',
    setWorkspace: 'Usar o repositorio atual como area de notas'
  },
  tr: {
    note: 'Notlar',
    setWorkspace: 'Gecerli depoyu not calisma alani yap'
  },
  'zh-CN': {
    note: '笔记',
    setWorkspace: '设为笔记工作区'
  },
  'zh-TW': {
    note: '筆記',
    setWorkspace: '設為筆記工作區'
  }
}

const internalText: Record<SupportedLanguage, Record<string, string>> = {
  de: {
    'Current Repository': 'Aktuelles Repository',
    'Current Branch': 'Aktueller Branch',
    'Fetch origin': 'Origin abrufen',
    Changes: 'Änderungen',
    History: 'Verlauf',
    'No Branches to Compare': 'Keine Branches zum Vergleichen',
    'Included in commit': 'Im Commit enthalten',
    'Excluded from commit': 'Vom Commit ausgeschlossen',
    'New files': 'Neue Dateien',
    'Modified files': 'Geänderte Dateien',
    'Deleted files': 'Gelöschte Dateien',
    'changed file': 'geänderte Datei',
    'changed files': 'geänderte Dateien',
    'added lines': 'hinzugefügte Zeilen',
    'removed lines': 'entfernte Zeilen',
    Summary: 'Zusammenfassung',
    Description: 'Beschreibung',
    Commit: 'Commit',
    'Commit to': 'Commit nach',
    'Publish repository': 'Repository veröffentlichen',
    'Clone a repository': 'Repository klonen',
    'Create a repository': 'Repository erstellen',
    'Add local repository': 'Lokales Repository hinzufügen',
    'Sign in to GitHub.com': 'Bei GitHub.com anmelden',
    'Sign in to GitHub Enterprise': 'Bei GitHub Enterprise anmelden',
    Cancel: 'Abbrechen',
    OK: 'OK',
    Close: 'Schließen',
    Continue: 'Fortfahren'
  },
  en: {},
  es: {
    'Current Repository': 'Repositorio actual',
    'Current Branch': 'Rama actual',
    'Fetch origin': 'Obtener origin',
    Changes: 'Cambios',
    History: 'Historial',
    'No Branches to Compare': 'No hay ramas para comparar',
    'Included in commit': 'Incluido en el commit',
    'Excluded from commit': 'Excluido del commit',
    'New files': 'Archivos nuevos',
    'Modified files': 'Archivos modificados',
    'Deleted files': 'Archivos eliminados',
    'changed file': 'archivo cambiado',
    'changed files': 'archivos cambiados',
    'added lines': 'líneas añadidas',
    'removed lines': 'líneas eliminadas',
    Summary: 'Resumen',
    Description: 'Descripción',
    Commit: 'Commit',
    'Commit to': 'Commit a',
    'Publish repository': 'Publicar repositorio',
    'Clone a repository': 'Clonar un repositorio',
    'Create a repository': 'Crear un repositorio',
    'Add local repository': 'Añadir repositorio local',
    'Sign in to GitHub.com': 'Iniciar sesión en GitHub.com',
    'Sign in to GitHub Enterprise': 'Iniciar sesión en GitHub Enterprise',
    Cancel: 'Cancelar',
    OK: 'Aceptar',
    Close: 'Cerrar',
    Continue: 'Continuar'
  },
  fr: {
    'Current Repository': 'Dépôt actuel',
    'Current Branch': 'Branche actuelle',
    'Fetch origin': 'Récupérer origin',
    Changes: 'Changements',
    History: 'Historique',
    'No Branches to Compare': 'Aucune branche à comparer',
    'Included in commit': 'Inclus dans le commit',
    'Excluded from commit': 'Exclu du commit',
    'New files': 'Nouveaux fichiers',
    'Modified files': 'Fichiers modifiés',
    'Deleted files': 'Fichiers supprimés',
    'changed file': 'fichier modifié',
    'changed files': 'fichiers modifiés',
    'added lines': 'lignes ajoutées',
    'removed lines': 'lignes supprimées',
    Summary: 'Résumé',
    Description: 'Description',
    Commit: 'Commit',
    'Commit to': 'Commit vers',
    'Publish repository': 'Publier le dépôt',
    'Clone a repository': 'Cloner un dépôt',
    'Create a repository': 'Créer un dépôt',
    'Add local repository': 'Ajouter un dépôt local',
    'Sign in to GitHub.com': 'Se connecter à GitHub.com',
    'Sign in to GitHub Enterprise': 'Se connecter à GitHub Enterprise',
    Cancel: 'Annuler',
    OK: 'OK',
    Close: 'Fermer',
    Continue: 'Continuer'
  },
  it: {
    'Current Repository': 'Repository corrente',
    'Current Branch': 'Branch corrente',
    'Fetch origin': 'Fetch origin',
    Changes: 'Modifiche',
    History: 'Cronologia',
    'No Branches to Compare': 'Nessun branch da confrontare',
    'Included in commit': 'Incluso nel commit',
    'Excluded from commit': 'Escluso dal commit',
    'New files': 'Nuovi file',
    'Modified files': 'File modificati',
    'Deleted files': 'File eliminati',
    'changed file': 'file modificato',
    'changed files': 'file modificati',
    'added lines': 'righe aggiunte',
    'removed lines': 'righe rimosse',
    Summary: 'Riepilogo',
    Description: 'Descrizione',
    Commit: 'Commit',
    'Commit to': 'Commit su',
    'Publish repository': 'Pubblica repository',
    'Clone a repository': 'Clona un repository',
    'Create a repository': 'Crea un repository',
    'Add local repository': 'Aggiungi repository locale',
    'Sign in to GitHub.com': 'Accedi a GitHub.com',
    'Sign in to GitHub Enterprise': 'Accedi a GitHub Enterprise',
    Cancel: 'Annulla',
    OK: 'OK',
    Close: 'Chiudi',
    Continue: 'Continua'
  },
  ja: {
    'Current Repository': '現在のリポジトリ',
    'Current Branch': '現在のブランチ',
    'Fetch origin': 'origin をフェッチ',
    Changes: '変更',
    History: '履歴',
    'No Branches to Compare': '比較するブランチがありません',
    'Included in commit': 'コミットに含める',
    'Excluded from commit': 'コミットから除外',
    'New files': '新しいファイル',
    'Modified files': '変更されたファイル',
    'Deleted files': '削除されたファイル',
    'changed file': '変更されたファイル',
    'changed files': '変更されたファイル',
    'added lines': '追加行',
    'removed lines': '削除行',
    Summary: '概要',
    Description: '説明',
    Commit: 'コミット',
    'Commit to': 'コミット先',
    'Publish repository': 'リポジトリを公開',
    'Clone a repository': 'リポジトリをクローン',
    'Create a repository': 'リポジトリを作成',
    'Add local repository': 'ローカルリポジトリを追加',
    'Sign in to GitHub.com': 'GitHub.com にサインイン',
    'Sign in to GitHub Enterprise': 'GitHub Enterprise にサインイン',
    Cancel: 'キャンセル',
    OK: 'OK',
    Close: '閉じる',
    Continue: '続行'
  },
  ko: {
    'Current Repository': '현재 저장소',
    'Current Branch': '현재 브랜치',
    'Fetch origin': 'origin 가져오기',
    Changes: '변경 사항',
    History: '기록',
    'No Branches to Compare': '비교할 브랜치가 없습니다',
    'Included in commit': '커밋에 포함됨',
    'Excluded from commit': '커밋에서 제외됨',
    'New files': '새 파일',
    'Modified files': '수정된 파일',
    'Deleted files': '삭제된 파일',
    'changed file': '변경된 파일',
    'changed files': '변경된 파일',
    'added lines': '추가된 줄',
    'removed lines': '삭제된 줄',
    Summary: '요약',
    Description: '설명',
    Commit: '커밋',
    'Commit to': '커밋 대상',
    'Publish repository': '저장소 게시',
    'Clone a repository': '저장소 클론',
    'Create a repository': '저장소 만들기',
    'Add local repository': '로컬 저장소 추가',
    'Sign in to GitHub.com': 'GitHub.com에 로그인',
    'Sign in to GitHub Enterprise': 'GitHub Enterprise에 로그인',
    Cancel: '취소',
    OK: '확인',
    Close: '닫기',
    Continue: '계속'
  },
  pt: {
    'Current Repository': 'Repositório atual',
    'Current Branch': 'Branch atual',
    'Fetch origin': 'Buscar origin',
    Changes: 'Alterações',
    History: 'Histórico',
    'No Branches to Compare': 'Nenhum branch para comparar',
    'Included in commit': 'Incluído no commit',
    'Excluded from commit': 'Excluído do commit',
    'New files': 'Arquivos novos',
    'Modified files': 'Arquivos modificados',
    'Deleted files': 'Arquivos excluídos',
    'changed file': 'arquivo alterado',
    'changed files': 'arquivos alterados',
    'added lines': 'linhas adicionadas',
    'removed lines': 'linhas removidas',
    Summary: 'Resumo',
    Description: 'Descrição',
    Commit: 'Commit',
    'Commit to': 'Commit em',
    'Publish repository': 'Publicar repositório',
    'Clone a repository': 'Clonar um repositório',
    'Create a repository': 'Criar um repositório',
    'Add local repository': 'Adicionar repositório local',
    'Sign in to GitHub.com': 'Entrar no GitHub.com',
    'Sign in to GitHub Enterprise': 'Entrar no GitHub Enterprise',
    Cancel: 'Cancelar',
    OK: 'OK',
    Close: 'Fechar',
    Continue: 'Continuar'
  },
  tr: {
    'Current Repository': 'Geçerli depo',
    'Current Branch': 'Geçerli dal',
    'Fetch origin': 'Origin getir',
    Changes: 'Değişiklikler',
    History: 'Geçmiş',
    'No Branches to Compare': 'Karşılaştırılacak dal yok',
    'Included in commit': 'Commit’e dahil',
    'Excluded from commit': 'Commit’ten çıkarıldı',
    'New files': 'Yeni dosyalar',
    'Modified files': 'Değiştirilen dosyalar',
    'Deleted files': 'Silinen dosyalar',
    'changed file': 'değişen dosya',
    'changed files': 'değişen dosya',
    'added lines': 'eklenen satır',
    'removed lines': 'silinen satır',
    Summary: 'Özet',
    Description: 'Açıklama',
    Commit: 'Commit',
    'Commit to': 'Commit hedefi',
    'Publish repository': 'Depoyu yayınla',
    'Clone a repository': 'Depo klonla',
    'Create a repository': 'Depo oluştur',
    'Add local repository': 'Yerel depo ekle',
    'Sign in to GitHub.com': 'GitHub.com oturumu aç',
    'Sign in to GitHub Enterprise': 'GitHub Enterprise oturumu aç',
    Cancel: 'İptal',
    OK: 'Tamam',
    Close: 'Kapat',
    Continue: 'Devam'
  },
  'zh-CN': {
    'Current Repository': '当前仓库',
    'Current Branch': '当前分支',
    'Fetch origin': '获取 origin',
    Changes: '变更',
    History: '历史',
    'No Branches to Compare': '没有可比较的分支',
    'Included in commit': '包含在提交中',
    'Excluded from commit': '从提交中排除',
    'New files': '新文件',
    'Modified files': '已修改文件',
    'Deleted files': '已删除文件',
    'changed file': '个变更文件',
    'changed files': '个变更文件',
    'added lines': '行新增',
    'removed lines': '行删除',
    Summary: '摘要',
    Description: '描述',
    Commit: '提交',
    'Commit to': '提交到',
    'Publish repository': '发布仓库',
    'Clone a repository': '克隆仓库',
    'Create a repository': '创建仓库',
    'Add local repository': '添加本地仓库',
    'Sign in to GitHub.com': '登录 GitHub.com',
    'Sign in to GitHub Enterprise': '登录 GitHub Enterprise',
    Cancel: '取消',
    OK: '确定',
    Close: '关闭',
    Continue: '继续'
  },
  'zh-TW': {
    'Current Repository': '目前倉庫',
    'Current Branch': '目前分支',
    'Fetch origin': '擷取 origin',
    Changes: '變更',
    History: '歷史',
    'No Branches to Compare': '沒有可比較的分支',
    'Included in commit': '包含在提交中',
    'Excluded from commit': '從提交中排除',
    'New files': '新檔案',
    'Modified files': '已修改檔案',
    'Deleted files': '已刪除檔案',
    'changed file': '個變更檔案',
    'changed files': '個變更檔案',
    'added lines': '行新增',
    'removed lines': '行刪除',
    Summary: '摘要',
    Description: '描述',
    Commit: '提交',
    'Commit to': '提交到',
    'Publish repository': '發布倉庫',
    'Clone a repository': '複製倉庫',
    'Create a repository': '建立倉庫',
    'Add local repository': '新增本地倉庫',
    'Sign in to GitHub.com': '登入 GitHub.com',
    'Sign in to GitHub Enterprise': '登入 GitHub Enterprise',
    Cancel: '取消',
    OK: '確定',
    Close: '關閉',
    Continue: '繼續'
  }
}

const extraInternalText: Record<SupportedLanguage, Record<string, string>> = {
  de: {
    "Let's get started!": 'Los gehts!',
    'Add a repository to GitHub Desktop to start collaborating': 'Fügen Sie ein Repository zu GitHub Desktop hinzu, um mit der Zusammenarbeit zu beginnen',
    'Repository URL or GitHub username and repository': 'Repository-URL oder GitHub-Benutzername und Repository',
    'URL or username/repository': 'URL oder Benutzername/Repository',
    'repository path': 'Repository-Pfad',
    'Local path': 'Lokaler Pfad',
    Choose: 'Auswählen',
    'Choose…': 'Auswählen…',
    Clone: 'Klonen',
    Create: 'Erstellen',
    Add: 'Hinzufügen',
    Name: 'Name',
    'Git ignore': 'Git ignore',
    License: 'Lizenz',
    'Initialize this repository with a README': 'Dieses Repository mit einer README initialisieren',
    'This directory does not appear to be a Git repository.': 'Dieses Verzeichnis scheint kein Git-Repository zu sein.',
    'create a repository': 'ein Repository erstellen',
    'No local changes': 'Keine lokalen Änderungen',
    'No files match your current filters': 'Keine Dateien entsprechen den aktuellen Filtern',
    'Filter Options': 'Filteroptionen',
    'Clear filters': 'Filter löschen',
    'Stashed Changes': 'Gestashte Änderungen',
    'Hidden changes will be committed.': 'Ausgeblendete Änderungen werden committed.',
    'Warning:': 'Warnung:',
    'Discard Changes': 'Änderungen verwerfen',
    'Discard changes': 'Änderungen verwerfen',
    'Discard All Changes': 'Alle Änderungen verwerfen',
    'Discard all changes': 'Alle Änderungen verwerfen',
    'Confirm Discard Changes': 'Verwerfen bestätigen',
    'Confirm discard changes': 'Verwerfen bestätigen',
    'Are you sure you want to discard all changes to:': 'Möchten Sie wirklich alle Änderungen verwerfen an:',
    'Are you sure you want to discard the selected changes to:': 'Möchten Sie wirklich die ausgewählten Änderungen verwerfen an:',
    'Permanently Discard Changes': 'Änderungen endgültig verwerfen',
    'Discarded Changes Will Be Unrecoverable': 'Verworfene Änderungen können nicht wiederhergestellt werden',
    'Commit summary': 'Commit-Zusammenfassung',
    'Commit description': 'Commit-Beschreibung',
    'Create commit': 'Commit erstellen',
    Amend: 'Ändern',
    Amending: 'Wird geändert',
    Committing: 'Commit läuft',
    'Committing changes…': 'Änderungen werden committed…',
    'Show commit progress': 'Commit-Fortschritt anzeigen',
    'Allow empty commit': 'Leeren Commit erlauben',
    'Allow Empty Commit': 'Leeren Commit erlauben',
    New: 'Neu',
    'No files in commit': 'Keine Dateien im Commit',
    'Date:': 'Datum:',
    Unreachable: 'Unerreichbar',
    Reachable: 'Erreichbar',
    'Push origin': 'Origin pushen',
    'Pull origin': 'Origin pullen',
    'Reverting…': 'Wird zurückgesetzt…',
    Open: 'Öffnen',
    Save: 'Speichern',
    Refresh: 'Aktualisieren',
    Retry: 'Erneut versuchen',
    Skip: 'Überspringen',
    'Sign in': 'Anmelden',
    Enterprise: 'Enterprise',
    URL: 'URL',
    Compare: 'Vergleichen',
    Merge: 'Zusammenführen',
    Rebase: 'Rebase',
    Stash: 'Stash'
  },
  en: {},
  es: {
    "Let's get started!": '¡Empecemos!',
    'Add a repository to GitHub Desktop to start collaborating': 'Añade un repositorio a GitHub Desktop para empezar a colaborar',
    'Repository URL or GitHub username and repository': 'URL del repositorio o usuario y repositorio de GitHub',
    'URL or username/repository': 'URL o usuario/repositorio',
    'repository path': 'ruta del repositorio',
    'Local path': 'Ruta local',
    Choose: 'Elegir',
    'Choose…': 'Elegir…',
    Clone: 'Clonar',
    Create: 'Crear',
    Add: 'Añadir',
    Name: 'Nombre',
    'Git ignore': 'Git ignore',
    License: 'Licencia',
    'Initialize this repository with a README': 'Inicializar este repositorio con un README',
    'This directory does not appear to be a Git repository.': 'Este directorio no parece ser un repositorio Git.',
    'create a repository': 'crear un repositorio',
    'No local changes': 'Sin cambios locales',
    'No files match your current filters': 'Ningún archivo coincide con los filtros actuales',
    'Filter Options': 'Opciones de filtro',
    'Clear filters': 'Borrar filtros',
    'Stashed Changes': 'Cambios guardados',
    'Hidden changes will be committed.': 'Los cambios ocultos se incluirán en el commit.',
    'Warning:': 'Advertencia:',
    'Discard Changes': 'Descartar cambios',
    'Discard changes': 'Descartar cambios',
    'Discard All Changes': 'Descartar todos los cambios',
    'Discard all changes': 'Descartar todos los cambios',
    'Confirm Discard Changes': 'Confirmar descartar cambios',
    'Confirm discard changes': 'Confirmar descartar cambios',
    'Are you sure you want to discard all changes to:': '¿Seguro que quieres descartar todos los cambios en:',
    'Are you sure you want to discard the selected changes to:': '¿Seguro que quieres descartar los cambios seleccionados en:',
    'Permanently Discard Changes': 'Descartar cambios permanentemente',
    'Discarded Changes Will Be Unrecoverable': 'Los cambios descartados no se podrán recuperar',
    'Commit summary': 'Resumen del commit',
    'Commit description': 'Descripción del commit',
    'Create commit': 'Crear commit',
    Amend: 'Enmendar',
    Amending: 'Enmendando',
    Committing: 'Haciendo commit',
    'Committing changes…': 'Haciendo commit de los cambios…',
    'Show commit progress': 'Mostrar progreso del commit',
    'Allow empty commit': 'Permitir commit vacío',
    'Allow Empty Commit': 'Permitir commit vacío',
    New: 'Nuevo',
    'No files in commit': 'No hay archivos en el commit',
    'Date:': 'Fecha:',
    Unreachable: 'Inalcanzable',
    Reachable: 'Alcanzable',
    'Push origin': 'Push a origin',
    'Pull origin': 'Pull de origin',
    'Reverting…': 'Revirtiendo…',
    Open: 'Abrir',
    Save: 'Guardar',
    Refresh: 'Actualizar',
    Retry: 'Reintentar',
    Skip: 'Omitir',
    'Sign in': 'Iniciar sesión',
    Enterprise: 'Enterprise',
    URL: 'URL',
    Compare: 'Comparar',
    Merge: 'Fusionar',
    Rebase: 'Rebase',
    Stash: 'Stash'
  },
  fr: {
    "Let's get started!": 'Commençons !',
    'Add a repository to GitHub Desktop to start collaborating': 'Ajoutez un dépôt à GitHub Desktop pour commencer à collaborer',
    'Repository URL or GitHub username and repository': 'URL du dépôt ou utilisateur GitHub et dépôt',
    'URL or username/repository': 'URL ou utilisateur/dépôt',
    'repository path': 'chemin du dépôt',
    'Local path': 'Chemin local',
    Choose: 'Choisir',
    'Choose…': 'Choisir…',
    Clone: 'Cloner',
    Create: 'Créer',
    Add: 'Ajouter',
    Name: 'Nom',
    'Git ignore': 'Git ignore',
    License: 'Licence',
    'Initialize this repository with a README': 'Initialiser ce dépôt avec un README',
    'This directory does not appear to be a Git repository.': 'Ce dossier ne semble pas être un dépôt Git.',
    'create a repository': 'créer un dépôt',
    'No local changes': 'Aucun changement local',
    'No files match your current filters': 'Aucun fichier ne correspond aux filtres actuels',
    'Filter Options': 'Options de filtre',
    'Clear filters': 'Effacer les filtres',
    'Stashed Changes': 'Changements remisés',
    'Hidden changes will be committed.': 'Les changements masqués seront inclus dans le commit.',
    'Warning:': 'Avertissement :',
    'Discard Changes': 'Abandonner les changements',
    'Discard changes': 'Abandonner les changements',
    'Discard All Changes': 'Abandonner tous les changements',
    'Discard all changes': 'Abandonner tous les changements',
    'Confirm Discard Changes': 'Confirmer l’abandon des changements',
    'Confirm discard changes': 'Confirmer l’abandon des changements',
    'Are you sure you want to discard all changes to:': 'Voulez-vous vraiment abandonner tous les changements de :',
    'Are you sure you want to discard the selected changes to:': 'Voulez-vous vraiment abandonner les changements sélectionnés de :',
    'Permanently Discard Changes': 'Abandonner définitivement les changements',
    'Discarded Changes Will Be Unrecoverable': 'Les changements abandonnés seront irrécupérables',
    'Commit summary': 'Résumé du commit',
    'Commit description': 'Description du commit',
    'Create commit': 'Créer un commit',
    Amend: 'Modifier',
    Amending: 'Modification',
    Committing: 'Commit en cours',
    'Committing changes…': 'Commit des changements…',
    'Show commit progress': 'Afficher la progression du commit',
    'Allow empty commit': 'Autoriser un commit vide',
    'Allow Empty Commit': 'Autoriser un commit vide',
    New: 'Nouveau',
    'No files in commit': 'Aucun fichier dans le commit',
    'Date:': 'Date :',
    Unreachable: 'Inaccessible',
    Reachable: 'Accessible',
    'Push origin': 'Pousser origin',
    'Pull origin': 'Tirer origin',
    'Reverting…': 'Rétablissement…',
    Open: 'Ouvrir',
    Save: 'Enregistrer',
    Refresh: 'Actualiser',
    Retry: 'Réessayer',
    Skip: 'Ignorer',
    'Sign in': 'Se connecter',
    Enterprise: 'Enterprise',
    URL: 'URL',
    Compare: 'Comparer',
    Merge: 'Fusionner',
    Rebase: 'Rebase',
    Stash: 'Remiser'
  },
  it: {
    "Let's get started!": 'Iniziamo!',
    'Add a repository to GitHub Desktop to start collaborating': 'Aggiungi un repository a GitHub Desktop per iniziare a collaborare',
    'Repository URL or GitHub username and repository': 'URL del repository o utente GitHub e repository',
    'URL or username/repository': 'URL o utente/repository',
    'repository path': 'percorso del repository',
    'Local path': 'Percorso locale',
    Choose: 'Scegli',
    'Choose…': 'Scegli…',
    Clone: 'Clona',
    Create: 'Crea',
    Add: 'Aggiungi',
    Name: 'Nome',
    'Git ignore': 'Git ignore',
    License: 'Licenza',
    'Initialize this repository with a README': 'Inizializza questo repository con un README',
    'This directory does not appear to be a Git repository.': 'Questa directory non sembra essere un repository Git.',
    'create a repository': 'crea un repository',
    'No local changes': 'Nessuna modifica locale',
    'No files match your current filters': 'Nessun file corrisponde ai filtri correnti',
    'Filter Options': 'Opzioni filtro',
    'Clear filters': 'Cancella filtri',
    'Stashed Changes': 'Modifiche nello stash',
    'Hidden changes will be committed.': 'Le modifiche nascoste verranno incluse nel commit.',
    'Warning:': 'Avviso:',
    'Discard Changes': 'Scarta modifiche',
    'Discard changes': 'Scarta modifiche',
    'Discard All Changes': 'Scarta tutte le modifiche',
    'Discard all changes': 'Scarta tutte le modifiche',
    'Confirm Discard Changes': 'Conferma scarto modifiche',
    'Confirm discard changes': 'Conferma scarto modifiche',
    'Are you sure you want to discard all changes to:': 'Vuoi davvero scartare tutte le modifiche a:',
    'Are you sure you want to discard the selected changes to:': 'Vuoi davvero scartare le modifiche selezionate a:',
    'Permanently Discard Changes': 'Scarta definitivamente le modifiche',
    'Discarded Changes Will Be Unrecoverable': 'Le modifiche scartate non potranno essere recuperate',
    'Commit summary': 'Riepilogo commit',
    'Commit description': 'Descrizione commit',
    'Create commit': 'Crea commit',
    Amend: 'Modifica',
    Amending: 'Modifica in corso',
    Committing: 'Commit in corso',
    'Committing changes…': 'Commit delle modifiche…',
    'Show commit progress': 'Mostra avanzamento commit',
    'Allow empty commit': 'Consenti commit vuoto',
    'Allow Empty Commit': 'Consenti commit vuoto',
    New: 'Nuovo',
    'No files in commit': 'Nessun file nel commit',
    'Date:': 'Data:',
    Unreachable: 'Non raggiungibile',
    Reachable: 'Raggiungibile',
    'Push origin': 'Push origin',
    'Pull origin': 'Pull origin',
    'Reverting…': 'Ripristino…',
    Open: 'Apri',
    Save: 'Salva',
    Refresh: 'Aggiorna',
    Retry: 'Riprova',
    Skip: 'Salta',
    'Sign in': 'Accedi',
    Enterprise: 'Enterprise',
    URL: 'URL',
    Compare: 'Confronta',
    Merge: 'Unisci',
    Rebase: 'Rebase',
    Stash: 'Stash'
  },
  ja: {
    "Let's get started!": '始めましょう！',
    'Add a repository to GitHub Desktop to start collaborating': '共同作業を始めるには GitHub Desktop にリポジトリを追加してください',
    'Repository URL or GitHub username and repository': 'リポジトリ URL または GitHub ユーザー名とリポジトリ',
    'URL or username/repository': 'URL または ユーザー名/リポジトリ',
    'repository path': 'リポジトリのパス',
    'Local path': 'ローカルパス',
    Choose: '選択',
    'Choose…': '選択…',
    Clone: 'クローン',
    Create: '作成',
    Add: '追加',
    Name: '名前',
    'Git ignore': 'Git ignore',
    License: 'ライセンス',
    'Initialize this repository with a README': 'このリポジトリを README 付きで初期化',
    'This directory does not appear to be a Git repository.': 'このディレクトリは Git リポジトリではないようです。',
    'create a repository': 'リポジトリを作成',
    'No local changes': 'ローカル変更はありません',
    'No files match your current filters': '現在のフィルターに一致するファイルはありません',
    'Filter Options': 'フィルターオプション',
    'Clear filters': 'フィルターをクリア',
    'Stashed Changes': '退避した変更',
    'Hidden changes will be committed.': '非表示の変更もコミットされます。',
    'Warning:': '警告:',
    'Discard Changes': '変更を破棄',
    'Discard changes': '変更を破棄',
    'Discard All Changes': 'すべての変更を破棄',
    'Discard all changes': 'すべての変更を破棄',
    'Confirm Discard Changes': '変更の破棄を確認',
    'Confirm discard changes': '変更の破棄を確認',
    'Are you sure you want to discard all changes to:': '次のすべての変更を破棄しますか:',
    'Are you sure you want to discard the selected changes to:': '次の選択した変更を破棄しますか:',
    'Permanently Discard Changes': '変更を完全に破棄',
    'Discarded Changes Will Be Unrecoverable': '破棄した変更は復元できません',
    'Commit summary': 'コミット概要',
    'Commit description': 'コミット説明',
    'Create commit': 'コミットを作成',
    Amend: '修正',
    Amending: '修正中',
    Committing: 'コミット中',
    'Committing changes…': '変更をコミット中…',
    'Show commit progress': 'コミット進行状況を表示',
    'Allow empty commit': '空のコミットを許可',
    'Allow Empty Commit': '空のコミットを許可',
    New: '新規',
    'No files in commit': 'コミットにファイルはありません',
    'Date:': '日付:',
    Unreachable: '到達不能',
    Reachable: '到達可能',
    'Push origin': 'origin にプッシュ',
    'Pull origin': 'origin からプル',
    'Reverting…': '元に戻しています…',
    Open: '開く',
    Save: '保存',
    Refresh: '更新',
    Retry: '再試行',
    Skip: 'スキップ',
    'Sign in': 'サインイン',
    Enterprise: 'Enterprise',
    URL: 'URL',
    Compare: '比較',
    Merge: 'マージ',
    Rebase: 'リベース',
    Stash: 'スタッシュ'
  },
  ko: {
    "Let's get started!": '시작해 봅시다!',
    'Add a repository to GitHub Desktop to start collaborating': '협업을 시작하려면 GitHub Desktop에 저장소를 추가하세요',
    'Repository URL or GitHub username and repository': '저장소 URL 또는 GitHub 사용자 이름과 저장소',
    'URL or username/repository': 'URL 또는 사용자/저장소',
    'repository path': '저장소 경로',
    'Local path': '로컬 경로',
    Choose: '선택',
    'Choose…': '선택…',
    Clone: '클론',
    Create: '만들기',
    Add: '추가',
    Name: '이름',
    'Git ignore': 'Git ignore',
    License: '라이선스',
    'Initialize this repository with a README': 'README로 이 저장소 초기화',
    'This directory does not appear to be a Git repository.': '이 디렉터리는 Git 저장소가 아닌 것 같습니다.',
    'create a repository': '저장소 만들기',
    'No local changes': '로컬 변경 사항 없음',
    'No files match your current filters': '현재 필터와 일치하는 파일이 없습니다',
    'Filter Options': '필터 옵션',
    'Clear filters': '필터 지우기',
    'Stashed Changes': '스태시된 변경 사항',
    'Hidden changes will be committed.': '숨겨진 변경 사항도 커밋됩니다.',
    'Warning:': '경고:',
    'Discard Changes': '변경 사항 버리기',
    'Discard changes': '변경 사항 버리기',
    'Discard All Changes': '모든 변경 사항 버리기',
    'Discard all changes': '모든 변경 사항 버리기',
    'Confirm Discard Changes': '변경 사항 버리기 확인',
    'Confirm discard changes': '변경 사항 버리기 확인',
    'Are you sure you want to discard all changes to:': '다음의 모든 변경 사항을 버리시겠습니까:',
    'Are you sure you want to discard the selected changes to:': '다음의 선택한 변경 사항을 버리시겠습니까:',
    'Permanently Discard Changes': '변경 사항 영구 삭제',
    'Discarded Changes Will Be Unrecoverable': '버린 변경 사항은 복구할 수 없습니다',
    'Commit summary': '커밋 요약',
    'Commit description': '커밋 설명',
    'Create commit': '커밋 만들기',
    Amend: '수정',
    Amending: '수정 중',
    Committing: '커밋 중',
    'Committing changes…': '변경 사항 커밋 중…',
    'Show commit progress': '커밋 진행 상황 보기',
    'Allow empty commit': '빈 커밋 허용',
    'Allow Empty Commit': '빈 커밋 허용',
    New: '새로 만들기',
    'No files in commit': '커밋에 파일 없음',
    'Date:': '날짜:',
    Unreachable: '도달 불가',
    Reachable: '도달 가능',
    'Push origin': 'origin에 푸시',
    'Pull origin': 'origin에서 풀',
    'Reverting…': '되돌리는 중…',
    Open: '열기',
    Save: '저장',
    Refresh: '새로 고침',
    Retry: '다시 시도',
    Skip: '건너뛰기',
    'Sign in': '로그인',
    Enterprise: 'Enterprise',
    URL: 'URL',
    Compare: '비교',
    Merge: '병합',
    Rebase: '리베이스',
    Stash: '스태시'
  },
  pt: {
    "Let's get started!": 'Vamos começar!',
    'Add a repository to GitHub Desktop to start collaborating': 'Adicione um repositório ao GitHub Desktop para começar a colaborar',
    'Repository URL or GitHub username and repository': 'URL do repositório ou usuário GitHub e repositório',
    'URL or username/repository': 'URL ou usuário/repositório',
    'repository path': 'caminho do repositório',
    'Local path': 'Caminho local',
    Choose: 'Escolher',
    'Choose…': 'Escolher…',
    Clone: 'Clonar',
    Create: 'Criar',
    Add: 'Adicionar',
    Name: 'Nome',
    'Git ignore': 'Git ignore',
    License: 'Licença',
    'Initialize this repository with a README': 'Inicializar este repositório com um README',
    'This directory does not appear to be a Git repository.': 'Este diretório não parece ser um repositório Git.',
    'create a repository': 'criar um repositório',
    'No local changes': 'Nenhuma alteração local',
    'No files match your current filters': 'Nenhum arquivo corresponde aos filtros atuais',
    'Filter Options': 'Opções de filtro',
    'Clear filters': 'Limpar filtros',
    'Stashed Changes': 'Alterações em stash',
    'Hidden changes will be committed.': 'Alterações ocultas serão commitadas.',
    'Warning:': 'Aviso:',
    'Discard Changes': 'Descartar alterações',
    'Discard changes': 'Descartar alterações',
    'Discard All Changes': 'Descartar todas as alterações',
    'Discard all changes': 'Descartar todas as alterações',
    'Confirm Discard Changes': 'Confirmar descarte de alterações',
    'Confirm discard changes': 'Confirmar descarte de alterações',
    'Are you sure you want to discard all changes to:': 'Tem certeza de que deseja descartar todas as alterações em:',
    'Are you sure you want to discard the selected changes to:': 'Tem certeza de que deseja descartar as alterações selecionadas em:',
    'Permanently Discard Changes': 'Descartar alterações permanentemente',
    'Discarded Changes Will Be Unrecoverable': 'Alterações descartadas não poderão ser recuperadas',
    'Commit summary': 'Resumo do commit',
    'Commit description': 'Descrição do commit',
    'Create commit': 'Criar commit',
    Amend: 'Alterar',
    Amending: 'Alterando',
    Committing: 'Commitando',
    'Committing changes…': 'Commitando alterações…',
    'Show commit progress': 'Mostrar progresso do commit',
    'Allow empty commit': 'Permitir commit vazio',
    'Allow Empty Commit': 'Permitir commit vazio',
    New: 'Novo',
    'No files in commit': 'Nenhum arquivo no commit',
    'Date:': 'Data:',
    Unreachable: 'Inacessível',
    Reachable: 'Acessível',
    'Push origin': 'Push para origin',
    'Pull origin': 'Pull de origin',
    'Reverting…': 'Revertendo…',
    Open: 'Abrir',
    Save: 'Salvar',
    Refresh: 'Atualizar',
    Retry: 'Tentar novamente',
    Skip: 'Pular',
    'Sign in': 'Entrar',
    Enterprise: 'Enterprise',
    URL: 'URL',
    Compare: 'Comparar',
    Merge: 'Mesclar',
    Rebase: 'Rebase',
    Stash: 'Stash'
  },
  tr: {
    "Let's get started!": 'Başlayalım!',
    'Add a repository to GitHub Desktop to start collaborating': 'İş birliğine başlamak için GitHub Desktop’a bir depo ekleyin',
    'Repository URL or GitHub username and repository': 'Depo URL’si veya GitHub kullanıcısı ve depo',
    'URL or username/repository': 'URL veya kullanıcı/depo',
    'repository path': 'depo yolu',
    'Local path': 'Yerel yol',
    Choose: 'Seç',
    'Choose…': 'Seç…',
    Clone: 'Klonla',
    Create: 'Oluştur',
    Add: 'Ekle',
    Name: 'Ad',
    'Git ignore': 'Git ignore',
    License: 'Lisans',
    'Initialize this repository with a README': 'Bu depoyu README ile başlat',
    'This directory does not appear to be a Git repository.': 'Bu dizin bir Git deposu gibi görünmüyor.',
    'create a repository': 'depo oluştur',
    'No local changes': 'Yerel değişiklik yok',
    'No files match your current filters': 'Geçerli filtrelerle eşleşen dosya yok',
    'Filter Options': 'Filtre seçenekleri',
    'Clear filters': 'Filtreleri temizle',
    'Stashed Changes': 'Stash değişiklikleri',
    'Hidden changes will be committed.': 'Gizli değişiklikler commit edilecek.',
    'Warning:': 'Uyarı:',
    'Discard Changes': 'Değişiklikleri at',
    'Discard changes': 'Değişiklikleri at',
    'Discard All Changes': 'Tüm değişiklikleri at',
    'Discard all changes': 'Tüm değişiklikleri at',
    'Confirm Discard Changes': 'Değişiklikleri atmayı onayla',
    'Confirm discard changes': 'Değişiklikleri atmayı onayla',
    'Are you sure you want to discard all changes to:': 'Şundaki tüm değişiklikleri atmak istediğinizden emin misiniz:',
    'Are you sure you want to discard the selected changes to:': 'Şundaki seçili değişiklikleri atmak istediğinizden emin misiniz:',
    'Permanently Discard Changes': 'Değişiklikleri kalıcı olarak at',
    'Discarded Changes Will Be Unrecoverable': 'Atılan değişiklikler kurtarılamaz',
    'Commit summary': 'Commit özeti',
    'Commit description': 'Commit açıklaması',
    'Create commit': 'Commit oluştur',
    Amend: 'Düzelt',
    Amending: 'Düzeltiliyor',
    Committing: 'Commit ediliyor',
    'Committing changes…': 'Değişiklikler commit ediliyor…',
    'Show commit progress': 'Commit ilerlemesini göster',
    'Allow empty commit': 'Boş commit’e izin ver',
    'Allow Empty Commit': 'Boş commit’e izin ver',
    New: 'Yeni',
    'No files in commit': 'Commit içinde dosya yok',
    'Date:': 'Tarih:',
    Unreachable: 'Ulaşılamaz',
    Reachable: 'Ulaşılabilir',
    'Push origin': 'Origin’e push',
    'Pull origin': 'Origin’den pull',
    'Reverting…': 'Geri alınıyor…',
    Open: 'Aç',
    Save: 'Kaydet',
    Refresh: 'Yenile',
    Retry: 'Tekrar dene',
    Skip: 'Atla',
    'Sign in': 'Oturum aç',
    Enterprise: 'Enterprise',
    URL: 'URL',
    Compare: 'Karşılaştır',
    Merge: 'Birleştir',
    Rebase: 'Rebase',
    Stash: 'Stash'
  },
  'zh-CN': {
    "Let's get started!": '开始使用',
    'Add a repository to GitHub Desktop to start collaborating': '将仓库添加到 GitHub Desktop 以开始协作',
    'Repository URL or GitHub username and repository': '仓库 URL，或 GitHub 用户名和仓库名',
    'URL or username/repository': 'URL 或 用户名/仓库',
    'repository path': '仓库路径',
    'Local path': '本地路径',
    Choose: '选择',
    'Choose…': '选择…',
    Clone: '克隆',
    Create: '创建',
    Add: '添加',
    Name: '名称',
    'Git ignore': 'Git 忽略规则',
    License: '许可证',
    'Initialize this repository with a README': '使用 README 初始化此仓库',
    'This directory does not appear to be a Git repository.': '此目录似乎不是 Git 仓库。',
    'create a repository': '创建仓库',
    'No local changes': '没有本地变更',
    'No files match your current filters': '没有文件符合当前筛选条件',
    'Filter Options': '筛选选项',
    'Clear filters': '清除筛选',
    'Stashed Changes': '暂存的变更',
    'Hidden changes will be committed.': '隐藏的变更也会被提交。',
    'Warning:': '警告：',
    'Discard Changes': '放弃变更',
    'Discard changes': '放弃变更',
    'Discard All Changes': '放弃所有变更',
    'Discard all changes': '放弃所有变更',
    'Confirm Discard Changes': '确认放弃变更',
    'Confirm discard changes': '确认放弃变更',
    'Are you sure you want to discard all changes to:': '确定要放弃以下位置的所有变更吗：',
    'Are you sure you want to discard the selected changes to:': '确定要放弃以下位置的选中变更吗：',
    'Permanently Discard Changes': '永久放弃变更',
    'Discarded Changes Will Be Unrecoverable': '放弃的变更将无法恢复',
    'Commit summary': '提交摘要',
    'Commit description': '提交描述',
    'Create commit': '创建提交',
    Amend: '修正',
    Amending: '正在修正',
    Committing: '正在提交',
    'Committing changes…': '正在提交变更…',
    'Show commit progress': '显示提交进度',
    'Allow empty commit': '允许空提交',
    'Allow Empty Commit': '允许空提交',
    New: '新',
    'No files in commit': '提交中没有文件',
    'Date:': '日期：',
    Unreachable: '不可达',
    Reachable: '可达',
    'Push origin': '推送 origin',
    'Pull origin': '拉取 origin',
    'Reverting…': '正在还原…',
    Open: '打开',
    Save: '保存',
    Refresh: '刷新',
    Retry: '重试',
    Skip: '跳过',
    'Sign in': '登录',
    Enterprise: '企业版',
    URL: 'URL',
    Compare: '比较',
    Merge: '合并',
    Rebase: '变基',
    Stash: '暂存'
  },
  'zh-TW': {
    "Let's get started!": '開始使用',
    'Add a repository to GitHub Desktop to start collaborating': '將倉庫新增到 GitHub Desktop 以開始協作',
    'Repository URL or GitHub username and repository': '倉庫 URL，或 GitHub 使用者名稱和倉庫名',
    'URL or username/repository': 'URL 或 使用者/倉庫',
    'repository path': '倉庫路徑',
    'Local path': '本地路徑',
    Choose: '選擇',
    'Choose…': '選擇…',
    Clone: '複製',
    Create: '建立',
    Add: '新增',
    Name: '名稱',
    'Git ignore': 'Git 忽略規則',
    License: '授權',
    'Initialize this repository with a README': '使用 README 初始化此倉庫',
    'This directory does not appear to be a Git repository.': '此目錄似乎不是 Git 倉庫。',
    'create a repository': '建立倉庫',
    'No local changes': '沒有本地變更',
    'No files match your current filters': '沒有檔案符合目前篩選條件',
    'Filter Options': '篩選選項',
    'Clear filters': '清除篩選',
    'Stashed Changes': '暫存的變更',
    'Hidden changes will be committed.': '隱藏的變更也會被提交。',
    'Warning:': '警告：',
    'Discard Changes': '放棄變更',
    'Discard changes': '放棄變更',
    'Discard All Changes': '放棄所有變更',
    'Discard all changes': '放棄所有變更',
    'Confirm Discard Changes': '確認放棄變更',
    'Confirm discard changes': '確認放棄變更',
    'Are you sure you want to discard all changes to:': '確定要放棄以下位置的所有變更嗎：',
    'Are you sure you want to discard the selected changes to:': '確定要放棄以下位置的選中變更嗎：',
    'Permanently Discard Changes': '永久放棄變更',
    'Discarded Changes Will Be Unrecoverable': '放棄的變更將無法復原',
    'Commit summary': '提交摘要',
    'Commit description': '提交描述',
    'Create commit': '建立提交',
    Amend: '修正',
    Amending: '正在修正',
    Committing: '正在提交',
    'Committing changes…': '正在提交變更…',
    'Show commit progress': '顯示提交進度',
    'Allow empty commit': '允許空提交',
    'Allow Empty Commit': '允許空提交',
    New: '新',
    'No files in commit': '提交中沒有檔案',
    'Date:': '日期：',
    Unreachable: '不可達',
    Reachable: '可達',
    'Push origin': '推送 origin',
    'Pull origin': '拉取 origin',
    'Reverting…': '正在還原…',
    Open: '開啟',
    Save: '儲存',
    Refresh: '重新整理',
    Retry: '重試',
    Skip: '跳過',
    'Sign in': '登入',
    Enterprise: '企業版',
    URL: 'URL',
    Compare: '比較',
    Merge: '合併',
    Rebase: '變基',
    Stash: '暫存'
  }
}

for (const language of SUPPORTED_LANGUAGES) {
  Object.assign(internalText[language], extraInternalText[language])
}

const workflowInternalText: Record<SupportedLanguage, Record<string, string>> = {
  de: {
    'Sign in Using Your Browser': 'Mit Ihrem Browser anmelden',
    'Sign in using your browser': 'Mit Ihrem Browser anmelden',
    'Continue With Browser': 'Mit Browser fortfahren',
    'Continue with browser': 'Mit Browser fortfahren',
    'Enterprise address': 'Enterprise-Adresse',
    'Your browser will redirect you back to GitHub Desktop once you\'ve signed in.': 'Ihr Browser leitet Sie nach der Anmeldung zurück zu GitHub Desktop.',
    'If your browser asks for your permission to launch GitHub Desktop, please allow it.': 'Wenn Ihr Browser um Erlaubnis bittet, GitHub Desktop zu starten, erlauben Sie dies bitte.',
    'Sign Into GitHub.com': 'Bei GitHub.com anmelden',
    'Sign into GitHub.com': 'Bei GitHub.com anmelden',
    'Sign Into GitHub Enterprise': 'Bei GitHub Enterprise anmelden',
    'Sign into GitHub Enterprise': 'Bei GitHub Enterprise anmelden',
    'Sign In': 'Anmelden',
    'Sign Out': 'Abmelden',
    'Sign out': 'Abmelden',
    'Add GitHub Enterprise account': 'GitHub-Enterprise-Konto hinzufügen',
    Accounts: 'Konten',
    Integrations: 'Integrationen',
    Appearance: 'Darstellung',
    Notifications: 'Benachrichtigungen',
    Prompts: 'Prompts',
    Advanced: 'Erweitert',
    Accessibility: 'Barrierefreiheit',
    Author: 'Autor',
    'Default branch': 'Standard-Branch',
    Hooks: 'Hooks',
    'Git Config': 'Git-Konfiguration',
    'Git config': 'Git-Konfiguration',
    Remote: 'Remote',
    'Ignored Files': 'Ignorierte Dateien',
    'Ignored files': 'Ignorierte Dateien',
    'Fork Behavior': 'Fork-Verhalten',
    'Fork behavior': 'Fork-Verhalten',
    'Create a Branch': 'Branch erstellen',
    'Create a branch': 'Branch erstellen',
    'Create Branch': 'Branch erstellen',
    'Create branch': 'Branch erstellen',
    'New Branch': 'Neuer Branch',
    'New branch': 'Neuer Branch',
    'Default Branch': 'Standard-Branch',
    'Recent Branches': 'Letzte Branches',
    'Recent branches': 'Letzte Branches',
    'Other Branches': 'Andere Branches',
    'Other branches': 'Andere Branches',
    'Rename Branch': 'Branch umbenennen',
    'Rename branch': 'Branch umbenennen',
    'Delete Branch': 'Branch löschen',
    'Delete branch': 'Branch löschen',
    'Delete Remote Branch': 'Remote-Branch löschen',
    'Delete remote branch': 'Remote-Branch löschen',
    'Switch Branch': 'Branch wechseln',
    'Switch branch': 'Branch wechseln',
    'This action cannot be undone.': 'Diese Aktion kann nicht rückgängig gemacht werden.',
    'Yes, delete this branch on the remote': 'Ja, diesen Branch auch auf dem Remote löschen',
    'Remove Repository': 'Repository entfernen',
    'Remove repository': 'Repository entfernen',
    'The repository will be removed from GitHub Desktop:': 'Das Repository wird aus GitHub Desktop entfernt:',
    'Also move this repository to': 'Dieses Repository auch verschieben nach',
    'Publish Repository': 'Repository veröffentlichen',
    'Keep this code private': 'Diesen Code privat halten',
    Organization: 'Organisation',
    None: 'Keine',
    'Will be created as': 'Wird erstellt als',
    'Clone failed': 'Klonen fehlgeschlagen',
    'Commit failed': 'Commit fehlgeschlagen',
    'Retry Clone': 'Klonen erneut versuchen',
    'Retry clone': 'Klonen erneut versuchen',
    'Open Preferences': 'Einstellungen öffnen',
    'Open options': 'Optionen öffnen',
    'Newer Commits on Remote': 'Neuere Commits auf dem Remote',
    'Newer commits on remote': 'Neuere Commits auf dem Remote',
    'Default branch name for new repositories': 'Standard-Branch-Name für neue Repositorys',
    'edit your global Git config file': 'globale Git-Konfigurationsdatei bearbeiten',
    'Load Git hook environment variables from shell': 'Git-Hook-Umgebungsvariablen aus der Shell laden',
    'Cache Git hook environment variables': 'Git-Hook-Umgebungsvariablen zwischenspeichern',
    'Shell to use when loading environment': 'Shell zum Laden der Umgebung'
  },
  en: {},
  es: {
    'Sign in Using Your Browser': 'Iniciar sesión con el navegador',
    'Sign in using your browser': 'Iniciar sesión con el navegador',
    'Continue With Browser': 'Continuar con el navegador',
    'Continue with browser': 'Continuar con el navegador',
    'Enterprise address': 'Dirección de Enterprise',
    'Your browser will redirect you back to GitHub Desktop once you\'ve signed in.': 'El navegador te redirigirá de vuelta a GitHub Desktop después de iniciar sesión.',
    'If your browser asks for your permission to launch GitHub Desktop, please allow it.': 'Si el navegador pide permiso para abrir GitHub Desktop, permítelo.',
    'Sign Into GitHub.com': 'Iniciar sesión en GitHub.com',
    'Sign into GitHub.com': 'Iniciar sesión en GitHub.com',
    'Sign Into GitHub Enterprise': 'Iniciar sesión en GitHub Enterprise',
    'Sign into GitHub Enterprise': 'Iniciar sesión en GitHub Enterprise',
    'Sign In': 'Iniciar sesión',
    'Sign Out': 'Cerrar sesión',
    'Sign out': 'Cerrar sesión',
    'Add GitHub Enterprise account': 'Añadir cuenta de GitHub Enterprise',
    Accounts: 'Cuentas',
    Integrations: 'Integraciones',
    Appearance: 'Apariencia',
    Notifications: 'Notificaciones',
    Prompts: 'Avisos',
    Advanced: 'Avanzado',
    Accessibility: 'Accesibilidad',
    Author: 'Autor',
    'Default branch': 'Rama predeterminada',
    Hooks: 'Hooks',
    'Git Config': 'Configuración Git',
    'Git config': 'Configuración Git',
    Remote: 'Remoto',
    'Ignored Files': 'Archivos ignorados',
    'Ignored files': 'Archivos ignorados',
    'Fork Behavior': 'Comportamiento del fork',
    'Fork behavior': 'Comportamiento del fork',
    'Create a Branch': 'Crear una rama',
    'Create a branch': 'Crear una rama',
    'Create Branch': 'Crear rama',
    'Create branch': 'Crear rama',
    'New Branch': 'Nueva rama',
    'New branch': 'Nueva rama',
    'Default Branch': 'Rama predeterminada',
    'Recent Branches': 'Ramas recientes',
    'Recent branches': 'Ramas recientes',
    'Other Branches': 'Otras ramas',
    'Other branches': 'Otras ramas',
    'Rename Branch': 'Renombrar rama',
    'Rename branch': 'Renombrar rama',
    'Delete Branch': 'Eliminar rama',
    'Delete branch': 'Eliminar rama',
    'Delete Remote Branch': 'Eliminar rama remota',
    'Delete remote branch': 'Eliminar rama remota',
    'Switch Branch': 'Cambiar rama',
    'Switch branch': 'Cambiar rama',
    'This action cannot be undone.': 'Esta acción no se puede deshacer.',
    'Yes, delete this branch on the remote': 'Sí, eliminar esta rama en el remoto',
    'Remove Repository': 'Eliminar repositorio',
    'Remove repository': 'Eliminar repositorio',
    'The repository will be removed from GitHub Desktop:': 'El repositorio se eliminará de GitHub Desktop:',
    'Also move this repository to': 'Mover también este repositorio a',
    'Publish Repository': 'Publicar repositorio',
    'Keep this code private': 'Mantener este código privado',
    Organization: 'Organización',
    None: 'Ninguno',
    'Will be created as': 'Se creará como',
    'Clone failed': 'Error al clonar',
    'Commit failed': 'Error al hacer commit',
    'Retry Clone': 'Reintentar clonación',
    'Retry clone': 'Reintentar clonación',
    'Open Preferences': 'Abrir preferencias',
    'Open options': 'Abrir opciones',
    'Newer Commits on Remote': 'Commits más recientes en el remoto',
    'Newer commits on remote': 'Commits más recientes en el remoto',
    'Default branch name for new repositories': 'Nombre de rama predeterminada para nuevos repositorios',
    'edit your global Git config file': 'editar el archivo global de configuración Git',
    'Load Git hook environment variables from shell': 'Cargar variables de entorno de hooks Git desde la shell',
    'Cache Git hook environment variables': 'Guardar en caché variables de entorno de hooks Git',
    'Shell to use when loading environment': 'Shell para cargar el entorno'
  },
  fr: {
    'Sign in Using Your Browser': 'Se connecter avec le navigateur',
    'Sign in using your browser': 'Se connecter avec le navigateur',
    'Continue With Browser': 'Continuer avec le navigateur',
    'Continue with browser': 'Continuer avec le navigateur',
    'Enterprise address': 'Adresse Enterprise',
    'Your browser will redirect you back to GitHub Desktop once you\'ve signed in.': 'Votre navigateur vous redirigera vers GitHub Desktop après la connexion.',
    'If your browser asks for your permission to launch GitHub Desktop, please allow it.': 'Si votre navigateur demande l’autorisation de lancer GitHub Desktop, acceptez.',
    'Sign Into GitHub.com': 'Se connecter à GitHub.com',
    'Sign into GitHub.com': 'Se connecter à GitHub.com',
    'Sign Into GitHub Enterprise': 'Se connecter à GitHub Enterprise',
    'Sign into GitHub Enterprise': 'Se connecter à GitHub Enterprise',
    'Sign In': 'Se connecter',
    'Sign Out': 'Se déconnecter',
    'Sign out': 'Se déconnecter',
    'Add GitHub Enterprise account': 'Ajouter un compte GitHub Enterprise',
    Accounts: 'Comptes',
    Integrations: 'Intégrations',
    Appearance: 'Apparence',
    Notifications: 'Notifications',
    Prompts: 'Invites',
    Advanced: 'Avancé',
    Accessibility: 'Accessibilité',
    Author: 'Auteur',
    'Default branch': 'Branche par défaut',
    Hooks: 'Hooks',
    'Git Config': 'Configuration Git',
    'Git config': 'Configuration Git',
    Remote: 'Remote',
    'Ignored Files': 'Fichiers ignorés',
    'Ignored files': 'Fichiers ignorés',
    'Fork Behavior': 'Comportement du fork',
    'Fork behavior': 'Comportement du fork',
    'Create a Branch': 'Créer une branche',
    'Create a branch': 'Créer une branche',
    'Create Branch': 'Créer une branche',
    'Create branch': 'Créer une branche',
    'New Branch': 'Nouvelle branche',
    'New branch': 'Nouvelle branche',
    'Default Branch': 'Branche par défaut',
    'Recent Branches': 'Branches récentes',
    'Recent branches': 'Branches récentes',
    'Other Branches': 'Autres branches',
    'Other branches': 'Autres branches',
    'Rename Branch': 'Renommer la branche',
    'Rename branch': 'Renommer la branche',
    'Delete Branch': 'Supprimer la branche',
    'Delete branch': 'Supprimer la branche',
    'Delete Remote Branch': 'Supprimer la branche distante',
    'Delete remote branch': 'Supprimer la branche distante',
    'Switch Branch': 'Changer de branche',
    'Switch branch': 'Changer de branche',
    'This action cannot be undone.': 'Cette action est irréversible.',
    'Yes, delete this branch on the remote': 'Oui, supprimer cette branche sur le remote',
    'Remove Repository': 'Retirer le dépôt',
    'Remove repository': 'Retirer le dépôt',
    'The repository will be removed from GitHub Desktop:': 'Le dépôt sera retiré de GitHub Desktop :',
    'Also move this repository to': 'Déplacer aussi ce dépôt vers',
    'Publish Repository': 'Publier le dépôt',
    'Keep this code private': 'Garder ce code privé',
    Organization: 'Organisation',
    None: 'Aucun',
    'Will be created as': 'Sera créé sous',
    'Clone failed': 'Échec du clonage',
    'Commit failed': 'Échec du commit',
    'Retry Clone': 'Réessayer le clonage',
    'Retry clone': 'Réessayer le clonage',
    'Open Preferences': 'Ouvrir les préférences',
    'Open options': 'Ouvrir les options',
    'Newer Commits on Remote': 'Commits plus récents sur le remote',
    'Newer commits on remote': 'Commits plus récents sur le remote',
    'Default branch name for new repositories': 'Nom de branche par défaut des nouveaux dépôts',
    'edit your global Git config file': 'modifier votre fichier global de configuration Git',
    'Load Git hook environment variables from shell': 'Charger les variables d’environnement des hooks Git depuis le shell',
    'Cache Git hook environment variables': 'Mettre en cache les variables d’environnement des hooks Git',
    'Shell to use when loading environment': 'Shell à utiliser pour charger l’environnement'
  },
  it: {
    'Sign in Using Your Browser': 'Accedi con il browser',
    'Sign in using your browser': 'Accedi con il browser',
    'Continue With Browser': 'Continua con il browser',
    'Continue with browser': 'Continua con il browser',
    'Enterprise address': 'Indirizzo Enterprise',
    'Your browser will redirect you back to GitHub Desktop once you\'ve signed in.': 'Il browser ti riporterà a GitHub Desktop dopo l’accesso.',
    'If your browser asks for your permission to launch GitHub Desktop, please allow it.': 'Se il browser chiede il permesso di aprire GitHub Desktop, consenti.',
    'Sign Into GitHub.com': 'Accedi a GitHub.com',
    'Sign into GitHub.com': 'Accedi a GitHub.com',
    'Sign Into GitHub Enterprise': 'Accedi a GitHub Enterprise',
    'Sign into GitHub Enterprise': 'Accedi a GitHub Enterprise',
    'Sign In': 'Accedi',
    'Sign Out': 'Esci',
    'Sign out': 'Esci',
    'Add GitHub Enterprise account': 'Aggiungi account GitHub Enterprise',
    Accounts: 'Account',
    Integrations: 'Integrazioni',
    Appearance: 'Aspetto',
    Notifications: 'Notifiche',
    Prompts: 'Prompt',
    Advanced: 'Avanzate',
    Accessibility: 'Accessibilità',
    Author: 'Autore',
    'Default branch': 'Branch predefinito',
    Hooks: 'Hook',
    'Git Config': 'Configurazione Git',
    'Git config': 'Configurazione Git',
    Remote: 'Remote',
    'Ignored Files': 'File ignorati',
    'Ignored files': 'File ignorati',
    'Fork Behavior': 'Comportamento fork',
    'Fork behavior': 'Comportamento fork',
    'Create a Branch': 'Crea un branch',
    'Create a branch': 'Crea un branch',
    'Create Branch': 'Crea branch',
    'Create branch': 'Crea branch',
    'New Branch': 'Nuovo branch',
    'New branch': 'Nuovo branch',
    'Default Branch': 'Branch predefinito',
    'Recent Branches': 'Branch recenti',
    'Recent branches': 'Branch recenti',
    'Other Branches': 'Altri branch',
    'Other branches': 'Altri branch',
    'Rename Branch': 'Rinomina branch',
    'Rename branch': 'Rinomina branch',
    'Delete Branch': 'Elimina branch',
    'Delete branch': 'Elimina branch',
    'Delete Remote Branch': 'Elimina branch remoto',
    'Delete remote branch': 'Elimina branch remoto',
    'Switch Branch': 'Cambia branch',
    'Switch branch': 'Cambia branch',
    'This action cannot be undone.': 'Questa azione non può essere annullata.',
    'Yes, delete this branch on the remote': 'Sì, elimina questo branch sul remote',
    'Remove Repository': 'Rimuovi repository',
    'Remove repository': 'Rimuovi repository',
    'The repository will be removed from GitHub Desktop:': 'Il repository verrà rimosso da GitHub Desktop:',
    'Also move this repository to': 'Sposta anche questo repository in',
    'Publish Repository': 'Pubblica repository',
    'Keep this code private': 'Mantieni questo codice privato',
    Organization: 'Organizzazione',
    None: 'Nessuna',
    'Will be created as': 'Verrà creato come',
    'Clone failed': 'Clone non riuscito',
    'Commit failed': 'Commit non riuscito',
    'Retry Clone': 'Riprova clone',
    'Retry clone': 'Riprova clone',
    'Open Preferences': 'Apri preferenze',
    'Open options': 'Apri opzioni',
    'Newer Commits on Remote': 'Commit più recenti sul remote',
    'Newer commits on remote': 'Commit più recenti sul remote',
    'Default branch name for new repositories': 'Nome branch predefinito per nuovi repository',
    'edit your global Git config file': 'modifica il file globale di configurazione Git',
    'Load Git hook environment variables from shell': 'Carica variabili d’ambiente degli hook Git dalla shell',
    'Cache Git hook environment variables': 'Memorizza in cache le variabili d’ambiente degli hook Git',
    'Shell to use when loading environment': 'Shell da usare per caricare l’ambiente'
  },
  ja: {
    'Sign in Using Your Browser': 'ブラウザーでサインイン',
    'Sign in using your browser': 'ブラウザーでサインイン',
    'Continue With Browser': 'ブラウザーで続行',
    'Continue with browser': 'ブラウザーで続行',
    'Enterprise address': 'Enterprise アドレス',
    'Your browser will redirect you back to GitHub Desktop once you\'ve signed in.': 'サインイン後、ブラウザーは GitHub Desktop に戻ります。',
    'If your browser asks for your permission to launch GitHub Desktop, please allow it.': 'ブラウザーが GitHub Desktop の起動許可を求めた場合は許可してください。',
    'Sign Into GitHub.com': 'GitHub.com にサインイン',
    'Sign into GitHub.com': 'GitHub.com にサインイン',
    'Sign Into GitHub Enterprise': 'GitHub Enterprise にサインイン',
    'Sign into GitHub Enterprise': 'GitHub Enterprise にサインイン',
    'Sign In': 'サインイン',
    'Sign Out': 'サインアウト',
    'Sign out': 'サインアウト',
    'Add GitHub Enterprise account': 'GitHub Enterprise アカウントを追加',
    Accounts: 'アカウント',
    Integrations: '連携',
    Appearance: '外観',
    Notifications: '通知',
    Prompts: 'プロンプト',
    Advanced: '詳細',
    Accessibility: 'アクセシビリティ',
    Author: '作者',
    'Default branch': '既定ブランチ',
    Hooks: 'フック',
    'Git Config': 'Git 設定',
    'Git config': 'Git 設定',
    Remote: 'リモート',
    'Ignored Files': '無視するファイル',
    'Ignored files': '無視するファイル',
    'Fork Behavior': 'フォーク動作',
    'Fork behavior': 'フォーク動作',
    'Create a Branch': 'ブランチを作成',
    'Create a branch': 'ブランチを作成',
    'Create Branch': 'ブランチを作成',
    'Create branch': 'ブランチを作成',
    'New Branch': '新しいブランチ',
    'New branch': '新しいブランチ',
    'Default Branch': '既定ブランチ',
    'Recent Branches': '最近のブランチ',
    'Recent branches': '最近のブランチ',
    'Other Branches': 'その他のブランチ',
    'Other branches': 'その他のブランチ',
    'Rename Branch': 'ブランチ名を変更',
    'Rename branch': 'ブランチ名を変更',
    'Delete Branch': 'ブランチを削除',
    'Delete branch': 'ブランチを削除',
    'Delete Remote Branch': 'リモートブランチを削除',
    'Delete remote branch': 'リモートブランチを削除',
    'Switch Branch': 'ブランチを切り替え',
    'Switch branch': 'ブランチを切り替え',
    'This action cannot be undone.': 'この操作は元に戻せません。',
    'Yes, delete this branch on the remote': 'はい、リモート上のこのブランチも削除します',
    'Remove Repository': 'リポジトリを削除',
    'Remove repository': 'リポジトリを削除',
    'The repository will be removed from GitHub Desktop:': 'リポジトリは GitHub Desktop から削除されます:',
    'Also move this repository to': 'このリポジトリも移動先:',
    'Publish Repository': 'リポジトリを公開',
    'Keep this code private': 'このコードを非公開にする',
    Organization: '組織',
    None: 'なし',
    'Will be created as': '次の名前で作成されます',
    'Clone failed': 'クローンに失敗しました',
    'Commit failed': 'コミットに失敗しました',
    'Retry Clone': 'クローンを再試行',
    'Retry clone': 'クローンを再試行',
    'Open Preferences': '設定を開く',
    'Open options': 'オプションを開く',
    'Newer Commits on Remote': 'リモートに新しいコミットがあります',
    'Newer commits on remote': 'リモートに新しいコミットがあります',
    'Default branch name for new repositories': '新規リポジトリの既定ブランチ名',
    'edit your global Git config file': 'グローバル Git 設定ファイルを編集',
    'Load Git hook environment variables from shell': 'シェルから Git フック環境変数を読み込む',
    'Cache Git hook environment variables': 'Git フック環境変数をキャッシュ',
    'Shell to use when loading environment': '環境読み込みに使用するシェル'
  },
  ko: {
    'Sign in Using Your Browser': '브라우저로 로그인',
    'Sign in using your browser': '브라우저로 로그인',
    'Continue With Browser': '브라우저로 계속',
    'Continue with browser': '브라우저로 계속',
    'Enterprise address': 'Enterprise 주소',
    'Your browser will redirect you back to GitHub Desktop once you\'ve signed in.': '로그인하면 브라우저가 GitHub Desktop으로 다시 이동합니다.',
    'If your browser asks for your permission to launch GitHub Desktop, please allow it.': '브라우저가 GitHub Desktop 실행 권한을 요청하면 허용해 주세요.',
    'Sign Into GitHub.com': 'GitHub.com에 로그인',
    'Sign into GitHub.com': 'GitHub.com에 로그인',
    'Sign Into GitHub Enterprise': 'GitHub Enterprise에 로그인',
    'Sign into GitHub Enterprise': 'GitHub Enterprise에 로그인',
    'Sign In': '로그인',
    'Sign Out': '로그아웃',
    'Sign out': '로그아웃',
    'Add GitHub Enterprise account': 'GitHub Enterprise 계정 추가',
    Accounts: '계정',
    Integrations: '통합',
    Appearance: '모양',
    Notifications: '알림',
    Prompts: '프롬프트',
    Advanced: '고급',
    Accessibility: '접근성',
    Author: '작성자',
    'Default branch': '기본 브랜치',
    Hooks: '훅',
    'Git Config': 'Git 설정',
    'Git config': 'Git 설정',
    Remote: '원격',
    'Ignored Files': '무시된 파일',
    'Ignored files': '무시된 파일',
    'Fork Behavior': '포크 동작',
    'Fork behavior': '포크 동작',
    'Create a Branch': '브랜치 만들기',
    'Create a branch': '브랜치 만들기',
    'Create Branch': '브랜치 만들기',
    'Create branch': '브랜치 만들기',
    'New Branch': '새 브랜치',
    'New branch': '새 브랜치',
    'Default Branch': '기본 브랜치',
    'Recent Branches': '최근 브랜치',
    'Recent branches': '최근 브랜치',
    'Other Branches': '다른 브랜치',
    'Other branches': '다른 브랜치',
    'Rename Branch': '브랜치 이름 변경',
    'Rename branch': '브랜치 이름 변경',
    'Delete Branch': '브랜치 삭제',
    'Delete branch': '브랜치 삭제',
    'Delete Remote Branch': '원격 브랜치 삭제',
    'Delete remote branch': '원격 브랜치 삭제',
    'Switch Branch': '브랜치 전환',
    'Switch branch': '브랜치 전환',
    'This action cannot be undone.': '이 작업은 되돌릴 수 없습니다.',
    'Yes, delete this branch on the remote': '예, 원격에서도 이 브랜치를 삭제합니다',
    'Remove Repository': '저장소 제거',
    'Remove repository': '저장소 제거',
    'The repository will be removed from GitHub Desktop:': '저장소가 GitHub Desktop에서 제거됩니다:',
    'Also move this repository to': '이 저장소도 다음으로 이동',
    'Publish Repository': '저장소 게시',
    'Keep this code private': '이 코드를 비공개로 유지',
    Organization: '조직',
    None: '없음',
    'Will be created as': '다음 이름으로 생성됩니다',
    'Clone failed': '클론 실패',
    'Commit failed': '커밋 실패',
    'Retry Clone': '클론 다시 시도',
    'Retry clone': '클론 다시 시도',
    'Open Preferences': '환경설정 열기',
    'Open options': '옵션 열기',
    'Newer Commits on Remote': '원격에 더 새로운 커밋이 있음',
    'Newer commits on remote': '원격에 더 새로운 커밋이 있음',
    'Default branch name for new repositories': '새 저장소의 기본 브랜치 이름',
    'edit your global Git config file': '전역 Git 설정 파일 편집',
    'Load Git hook environment variables from shell': '셸에서 Git 훅 환경 변수 로드',
    'Cache Git hook environment variables': 'Git 훅 환경 변수 캐시',
    'Shell to use when loading environment': '환경 로드에 사용할 셸'
  },
  pt: {
    'Sign in Using Your Browser': 'Entrar usando o navegador',
    'Sign in using your browser': 'Entrar usando o navegador',
    'Continue With Browser': 'Continuar com navegador',
    'Continue with browser': 'Continuar com navegador',
    'Enterprise address': 'Endereço Enterprise',
    'Your browser will redirect you back to GitHub Desktop once you\'ve signed in.': 'O navegador redirecionará você de volta ao GitHub Desktop após entrar.',
    'If your browser asks for your permission to launch GitHub Desktop, please allow it.': 'Se o navegador pedir permissão para abrir o GitHub Desktop, permita.',
    'Sign Into GitHub.com': 'Entrar no GitHub.com',
    'Sign into GitHub.com': 'Entrar no GitHub.com',
    'Sign Into GitHub Enterprise': 'Entrar no GitHub Enterprise',
    'Sign into GitHub Enterprise': 'Entrar no GitHub Enterprise',
    'Sign In': 'Entrar',
    'Sign Out': 'Sair',
    'Sign out': 'Sair',
    'Add GitHub Enterprise account': 'Adicionar conta GitHub Enterprise',
    Accounts: 'Contas',
    Integrations: 'Integrações',
    Appearance: 'Aparência',
    Notifications: 'Notificações',
    Prompts: 'Prompts',
    Advanced: 'Avançado',
    Accessibility: 'Acessibilidade',
    Author: 'Autor',
    'Default branch': 'Branch padrão',
    Hooks: 'Hooks',
    'Git Config': 'Configuração Git',
    'Git config': 'Configuração Git',
    Remote: 'Remoto',
    'Ignored Files': 'Arquivos ignorados',
    'Ignored files': 'Arquivos ignorados',
    'Fork Behavior': 'Comportamento do fork',
    'Fork behavior': 'Comportamento do fork',
    'Create a Branch': 'Criar branch',
    'Create a branch': 'Criar branch',
    'Create Branch': 'Criar branch',
    'Create branch': 'Criar branch',
    'New Branch': 'Novo branch',
    'New branch': 'Novo branch',
    'Default Branch': 'Branch padrão',
    'Recent Branches': 'Branches recentes',
    'Recent branches': 'Branches recentes',
    'Other Branches': 'Outros branches',
    'Other branches': 'Outros branches',
    'Rename Branch': 'Renomear branch',
    'Rename branch': 'Renomear branch',
    'Delete Branch': 'Excluir branch',
    'Delete branch': 'Excluir branch',
    'Delete Remote Branch': 'Excluir branch remoto',
    'Delete remote branch': 'Excluir branch remoto',
    'Switch Branch': 'Trocar branch',
    'Switch branch': 'Trocar branch',
    'This action cannot be undone.': 'Esta ação não pode ser desfeita.',
    'Yes, delete this branch on the remote': 'Sim, excluir este branch no remoto',
    'Remove Repository': 'Remover repositório',
    'Remove repository': 'Remover repositório',
    'The repository will be removed from GitHub Desktop:': 'O repositório será removido do GitHub Desktop:',
    'Also move this repository to': 'Mover também este repositório para',
    'Publish Repository': 'Publicar repositório',
    'Keep this code private': 'Manter este código privado',
    Organization: 'Organização',
    None: 'Nenhum',
    'Will be created as': 'Será criado como',
    'Clone failed': 'Falha ao clonar',
    'Commit failed': 'Falha no commit',
    'Retry Clone': 'Tentar clonar novamente',
    'Retry clone': 'Tentar clonar novamente',
    'Open Preferences': 'Abrir preferências',
    'Open options': 'Abrir opções',
    'Newer Commits on Remote': 'Commits mais recentes no remoto',
    'Newer commits on remote': 'Commits mais recentes no remoto',
    'Default branch name for new repositories': 'Nome do branch padrão para novos repositórios',
    'edit your global Git config file': 'editar seu arquivo global de configuração Git',
    'Load Git hook environment variables from shell': 'Carregar variáveis de ambiente dos hooks Git pelo shell',
    'Cache Git hook environment variables': 'Armazenar variáveis de ambiente dos hooks Git em cache',
    'Shell to use when loading environment': 'Shell usado para carregar o ambiente'
  },
  tr: {
    'Sign in Using Your Browser': 'Tarayıcı ile oturum aç',
    'Sign in using your browser': 'Tarayıcı ile oturum aç',
    'Continue With Browser': 'Tarayıcı ile devam et',
    'Continue with browser': 'Tarayıcı ile devam et',
    'Enterprise address': 'Enterprise adresi',
    'Your browser will redirect you back to GitHub Desktop once you\'ve signed in.': 'Oturum açtıktan sonra tarayıcı sizi GitHub Desktop’a geri yönlendirecek.',
    'If your browser asks for your permission to launch GitHub Desktop, please allow it.': 'Tarayıcı GitHub Desktop’ı başlatmak için izin isterse izin verin.',
    'Sign Into GitHub.com': 'GitHub.com oturumu aç',
    'Sign into GitHub.com': 'GitHub.com oturumu aç',
    'Sign Into GitHub Enterprise': 'GitHub Enterprise oturumu aç',
    'Sign into GitHub Enterprise': 'GitHub Enterprise oturumu aç',
    'Sign In': 'Oturum aç',
    'Sign Out': 'Oturumu kapat',
    'Sign out': 'Oturumu kapat',
    'Add GitHub Enterprise account': 'GitHub Enterprise hesabı ekle',
    Accounts: 'Hesaplar',
    Integrations: 'Entegrasyonlar',
    Appearance: 'Görünüm',
    Notifications: 'Bildirimler',
    Prompts: 'İstemler',
    Advanced: 'Gelişmiş',
    Accessibility: 'Erişilebilirlik',
    Author: 'Yazar',
    'Default branch': 'Varsayılan dal',
    Hooks: 'Hooklar',
    'Git Config': 'Git yapılandırması',
    'Git config': 'Git yapılandırması',
    Remote: 'Uzak',
    'Ignored Files': 'Yok sayılan dosyalar',
    'Ignored files': 'Yok sayılan dosyalar',
    'Fork Behavior': 'Fork davranışı',
    'Fork behavior': 'Fork davranışı',
    'Create a Branch': 'Dal oluştur',
    'Create a branch': 'Dal oluştur',
    'Create Branch': 'Dal oluştur',
    'Create branch': 'Dal oluştur',
    'New Branch': 'Yeni dal',
    'New branch': 'Yeni dal',
    'Default Branch': 'Varsayılan dal',
    'Recent Branches': 'Son dallar',
    'Recent branches': 'Son dallar',
    'Other Branches': 'Diğer dallar',
    'Other branches': 'Diğer dallar',
    'Rename Branch': 'Dalı yeniden adlandır',
    'Rename branch': 'Dalı yeniden adlandır',
    'Delete Branch': 'Dalı sil',
    'Delete branch': 'Dalı sil',
    'Delete Remote Branch': 'Uzak dalı sil',
    'Delete remote branch': 'Uzak dalı sil',
    'Switch Branch': 'Dal değiştir',
    'Switch branch': 'Dal değiştir',
    'This action cannot be undone.': 'Bu işlem geri alınamaz.',
    'Yes, delete this branch on the remote': 'Evet, bu dalı uzakta da sil',
    'Remove Repository': 'Depoyu kaldır',
    'Remove repository': 'Depoyu kaldır',
    'The repository will be removed from GitHub Desktop:': 'Depo GitHub Desktop’tan kaldırılacak:',
    'Also move this repository to': 'Bu depoyu ayrıca şuraya taşı',
    'Publish Repository': 'Depoyu yayınla',
    'Keep this code private': 'Bu kodu gizli tut',
    Organization: 'Organizasyon',
    None: 'Yok',
    'Will be created as': 'Şu adla oluşturulacak',
    'Clone failed': 'Klonlama başarısız',
    'Commit failed': 'Commit başarısız',
    'Retry Clone': 'Klonlamayı tekrar dene',
    'Retry clone': 'Klonlamayı tekrar dene',
    'Open Preferences': 'Tercihleri aç',
    'Open options': 'Seçenekleri aç',
    'Newer Commits on Remote': 'Uzakta daha yeni commitler var',
    'Newer commits on remote': 'Uzakta daha yeni commitler var',
    'Default branch name for new repositories': 'Yeni depolar için varsayılan dal adı',
    'edit your global Git config file': 'genel Git yapılandırma dosyanızı düzenle',
    'Load Git hook environment variables from shell': 'Git hook ortam değişkenlerini shell’den yükle',
    'Cache Git hook environment variables': 'Git hook ortam değişkenlerini önbelleğe al',
    'Shell to use when loading environment': 'Ortam yüklenirken kullanılacak shell'
  },
  'zh-CN': {
    'Sign in Using Your Browser': '使用浏览器登录',
    'Sign in using your browser': '使用浏览器登录',
    'Continue With Browser': '使用浏览器继续',
    'Continue with browser': '使用浏览器继续',
    'Enterprise address': 'Enterprise 地址',
    'Your browser will redirect you back to GitHub Desktop once you\'ve signed in.': '登录完成后，浏览器会把你重定向回 GitHub Desktop。',
    'If your browser asks for your permission to launch GitHub Desktop, please allow it.': '如果浏览器询问是否允许启动 GitHub Desktop，请允许。',
    'Sign Into GitHub.com': '登录 GitHub.com',
    'Sign into GitHub.com': '登录 GitHub.com',
    'Sign Into GitHub Enterprise': '登录 GitHub Enterprise',
    'Sign into GitHub Enterprise': '登录 GitHub Enterprise',
    'Sign In': '登录',
    'Sign Out': '退出登录',
    'Sign out': '退出登录',
    'Add GitHub Enterprise account': '添加 GitHub Enterprise 账号',
    Accounts: '账号',
    Integrations: '集成',
    Appearance: '外观',
    Notifications: '通知',
    Prompts: '提示',
    Advanced: '高级',
    Accessibility: '辅助功能',
    Author: '作者',
    'Default branch': '默认分支',
    Hooks: '钩子',
    'Git Config': 'Git 配置',
    'Git config': 'Git 配置',
    Remote: '远端',
    'Ignored Files': '忽略文件',
    'Ignored files': '忽略文件',
    'Fork Behavior': 'Fork 行为',
    'Fork behavior': 'Fork 行为',
    'Create a Branch': '创建分支',
    'Create a branch': '创建分支',
    'Create Branch': '创建分支',
    'Create branch': '创建分支',
    'New Branch': '新建分支',
    'New branch': '新建分支',
    'Default Branch': '默认分支',
    'Recent Branches': '最近分支',
    'Recent branches': '最近分支',
    'Other Branches': '其他分支',
    'Other branches': '其他分支',
    'Rename Branch': '重命名分支',
    'Rename branch': '重命名分支',
    'Delete Branch': '删除分支',
    'Delete branch': '删除分支',
    'Delete Remote Branch': '删除远端分支',
    'Delete remote branch': '删除远端分支',
    'Switch Branch': '切换分支',
    'Switch branch': '切换分支',
    'This action cannot be undone.': '此操作无法撤销。',
    'Yes, delete this branch on the remote': '是，同时删除远端上的此分支',
    'Remove Repository': '移除仓库',
    'Remove repository': '移除仓库',
    'The repository will be removed from GitHub Desktop:': '该仓库将从 GitHub Desktop 中移除：',
    'Also move this repository to': '同时将此仓库移动到',
    'Publish Repository': '发布仓库',
    'Keep this code private': '保持此代码私有',
    Organization: '组织',
    None: '无',
    'Will be created as': '将创建为',
    'Clone failed': '克隆失败',
    'Commit failed': '提交失败',
    'Retry Clone': '重试克隆',
    'Retry clone': '重试克隆',
    'Open Preferences': '打开偏好设置',
    'Open options': '打开选项',
    'Newer Commits on Remote': '远端有更新的提交',
    'Newer commits on remote': '远端有更新的提交',
    'Default branch name for new repositories': '新仓库的默认分支名称',
    'edit your global Git config file': '编辑全局 Git 配置文件',
    'Load Git hook environment variables from shell': '从 Shell 加载 Git 钩子环境变量',
    'Cache Git hook environment variables': '缓存 Git 钩子环境变量',
    'Shell to use when loading environment': '加载环境时使用的 Shell'
  },
  'zh-TW': {
    'Sign in Using Your Browser': '使用瀏覽器登入',
    'Sign in using your browser': '使用瀏覽器登入',
    'Continue With Browser': '使用瀏覽器繼續',
    'Continue with browser': '使用瀏覽器繼續',
    'Enterprise address': 'Enterprise 位址',
    'Your browser will redirect you back to GitHub Desktop once you\'ve signed in.': '登入完成後，瀏覽器會將你重新導回 GitHub Desktop。',
    'If your browser asks for your permission to launch GitHub Desktop, please allow it.': '如果瀏覽器詢問是否允許啟動 GitHub Desktop，請允許。',
    'Sign Into GitHub.com': '登入 GitHub.com',
    'Sign into GitHub.com': '登入 GitHub.com',
    'Sign Into GitHub Enterprise': '登入 GitHub Enterprise',
    'Sign into GitHub Enterprise': '登入 GitHub Enterprise',
    'Sign In': '登入',
    'Sign Out': '登出',
    'Sign out': '登出',
    'Add GitHub Enterprise account': '新增 GitHub Enterprise 帳號',
    Accounts: '帳號',
    Integrations: '整合',
    Appearance: '外觀',
    Notifications: '通知',
    Prompts: '提示',
    Advanced: '進階',
    Accessibility: '輔助功能',
    Author: '作者',
    'Default branch': '預設分支',
    Hooks: '鉤子',
    'Git Config': 'Git 設定',
    'Git config': 'Git 設定',
    Remote: '遠端',
    'Ignored Files': '忽略檔案',
    'Ignored files': '忽略檔案',
    'Fork Behavior': 'Fork 行為',
    'Fork behavior': 'Fork 行為',
    'Create a Branch': '建立分支',
    'Create a branch': '建立分支',
    'Create Branch': '建立分支',
    'Create branch': '建立分支',
    'New Branch': '新增分支',
    'New branch': '新增分支',
    'Default Branch': '預設分支',
    'Recent Branches': '最近分支',
    'Recent branches': '最近分支',
    'Other Branches': '其他分支',
    'Other branches': '其他分支',
    'Rename Branch': '重新命名分支',
    'Rename branch': '重新命名分支',
    'Delete Branch': '刪除分支',
    'Delete branch': '刪除分支',
    'Delete Remote Branch': '刪除遠端分支',
    'Delete remote branch': '刪除遠端分支',
    'Switch Branch': '切換分支',
    'Switch branch': '切換分支',
    'This action cannot be undone.': '此操作無法復原。',
    'Yes, delete this branch on the remote': '是，同時刪除遠端上的此分支',
    'Remove Repository': '移除倉庫',
    'Remove repository': '移除倉庫',
    'The repository will be removed from GitHub Desktop:': '該倉庫將從 GitHub Desktop 中移除：',
    'Also move this repository to': '同時將此倉庫移動到',
    'Publish Repository': '發布倉庫',
    'Keep this code private': '保持此程式碼私有',
    Organization: '組織',
    None: '無',
    'Will be created as': '將建立為',
    'Clone failed': '複製失敗',
    'Commit failed': '提交失敗',
    'Retry Clone': '重試複製',
    'Retry clone': '重試複製',
    'Open Preferences': '開啟偏好設定',
    'Open options': '開啟選項',
    'Newer Commits on Remote': '遠端有更新的提交',
    'Newer commits on remote': '遠端有更新的提交',
    'Default branch name for new repositories': '新倉庫的預設分支名稱',
    'edit your global Git config file': '編輯全域 Git 設定檔',
    'Load Git hook environment variables from shell': '從 Shell 載入 Git 鉤子環境變數',
    'Cache Git hook environment variables': '快取 Git 鉤子環境變數',
    'Shell to use when loading environment': '載入環境時使用的 Shell'
  }
}

for (const language of SUPPORTED_LANGUAGES) {
  Object.assign(internalText[language], workflowInternalText[language])
}

const remainingInternalText: Record<SupportedLanguage, Record<string, string>> = {
  de: {
    "Let's get started!": 'Los geht es!',
    'Add a repository to GitHub Desktop to start collaborating': 'Fügen Sie ein Repository zu GitHub Desktop hinzu, um zusammenzuarbeiten',
    'Return to In Progress Tutorial': 'Zum laufenden Tutorial zurückkehren',
    'Return to in progress tutorial': 'Zum laufenden Tutorial zurückkehren',
    'Create a Tutorial Repository…': 'Tutorial-Repository erstellen…',
    'Create a tutorial repository…': 'Tutorial-Repository erstellen…',
    'Clone a Repository from the Internet…': 'Repository aus dem Internet klonen…',
    'Clone a repository from the Internet…': 'Repository aus dem Internet klonen…',
    'Create a New Repository on your Local Drive…': 'Neues Repository auf dem lokalen Laufwerk erstellen…',
    'Create a New Repository on your local drive…': 'Neues Repository auf dem lokalen Laufwerk erstellen…',
    'Add an Existing Repository from your Local Drive…': 'Vorhandenes Repository vom lokalen Laufwerk hinzufügen…',
    'Add an Existing Repository from your local drive…': 'Vorhandenes Repository vom lokalen Laufwerk hinzufügen…',
    'ProTip!': 'Profi-Tipp!',
    'You can drag & drop an existing repository folder here to add it to Desktop': 'Sie können einen vorhandenen Repository-Ordner hierher ziehen, um ihn zu Desktop hinzuzufügen',
    'Confirm Discard All Changes': 'Verwerfen aller Änderungen bestätigen',
    'Confirm discard all changes': 'Verwerfen aller Änderungen bestätigen',
    'Confirm Discard Changes': 'Verwerfen der Änderungen bestätigen',
    'Confirm discard changes': 'Verwerfen der Änderungen bestätigen',
    'Discard All Changes': 'Alle Änderungen verwerfen',
    'Discard all changes': 'Alle Änderungen verwerfen',
    'Discard Changes': 'Änderungen verwerfen',
    'Discard changes': 'Änderungen verwerfen',
    'Do not show this message again': 'Diese Meldung nicht erneut anzeigen',
    'Are you sure you want to discard all changes to:': 'Möchten Sie wirklich alle Änderungen verwerfen an:',
    'Are you sure you want to discard the selected changes to:': 'Möchten Sie wirklich die ausgewählten Änderungen verwerfen an:',
    'Changes can be restored by retrieving them from the': 'Änderungen können wiederhergestellt werden aus dem',
    Remove: 'Entfernen',
    Delete: 'Löschen',
    Fetch: 'Abrufen',
    'Continue in Browser': 'Im Browser fortfahren',
    'Continue in browser': 'Im Browser fortfahren',
    'Push Rejected': 'Push abgelehnt',
    'Push rejected': 'Push abgelehnt',
    'Re-authorization Required': 'Erneute Autorisierung erforderlich',
    'Re-authorization required': 'Erneute Autorisierung erforderlich',
    'Open in Browser': 'Im Browser öffnen',
    'Open in browser': 'Im Browser öffnen',
    Dismiss: 'Schließen',
    'Check for Updates': 'Nach Updates suchen',
    'Checking for updates…': 'Suche nach Updates…',
    'Downloading update…': 'Update wird heruntergeladen…',
    'An update has been downloaded and is ready to be installed.': 'Ein Update wurde heruntergeladen und kann installiert werden.',
    'Repository Settings': 'Repository-Einstellungen',
    'Repository settings': 'Repository-Einstellungen',
    'Use my global Git config': 'Globale Git-Konfiguration verwenden',
    'Use a local Git config': 'Lokale Git-Konfiguration verwenden',
    Path: 'Pfad',
    Arguments: 'Argumente',
    Type: 'Typ',
    Name: 'Name',
    'Display Name': 'Anzeigename',
    'Display name': 'Anzeigename',
    'Base URL': 'Basis-URL',
    Authentication: 'Authentifizierung',
    Add: 'Hinzufügen',
    Save: 'Speichern',
    Update: 'Aktualisieren',
    Ignore: 'Ignorieren',
    Browse: 'Durchsuchen',
    Alias: 'Alias'
  },
  en: {},
  es: {
    "Let's get started!": '¡Empecemos!',
    'Add a repository to GitHub Desktop to start collaborating': 'Añade un repositorio a GitHub Desktop para empezar a colaborar',
    'Return to In Progress Tutorial': 'Volver al tutorial en curso',
    'Return to in progress tutorial': 'Volver al tutorial en curso',
    'Create a Tutorial Repository…': 'Crear un repositorio de tutorial…',
    'Create a tutorial repository…': 'Crear un repositorio de tutorial…',
    'Clone a Repository from the Internet…': 'Clonar un repositorio de Internet…',
    'Clone a repository from the Internet…': 'Clonar un repositorio de Internet…',
    'Create a New Repository on your Local Drive…': 'Crear un nuevo repositorio en la unidad local…',
    'Create a New Repository on your local drive…': 'Crear un nuevo repositorio en la unidad local…',
    'Add an Existing Repository from your Local Drive…': 'Añadir un repositorio existente desde la unidad local…',
    'Add an Existing Repository from your local drive…': 'Añadir un repositorio existente desde la unidad local…',
    'ProTip!': 'Consejo:',
    'You can drag & drop an existing repository folder here to add it to Desktop': 'Puedes arrastrar aquí una carpeta de repositorio existente para añadirla a Desktop',
    'Confirm Discard All Changes': 'Confirmar descarte de todos los cambios',
    'Confirm discard all changes': 'Confirmar descarte de todos los cambios',
    'Confirm Discard Changes': 'Confirmar descarte de cambios',
    'Confirm discard changes': 'Confirmar descarte de cambios',
    'Discard All Changes': 'Descartar todos los cambios',
    'Discard all changes': 'Descartar todos los cambios',
    'Discard Changes': 'Descartar cambios',
    'Discard changes': 'Descartar cambios',
    'Do not show this message again': 'No volver a mostrar este mensaje',
    'Are you sure you want to discard all changes to:': '¿Seguro que quieres descartar todos los cambios en:',
    'Are you sure you want to discard the selected changes to:': '¿Seguro que quieres descartar los cambios seleccionados en:',
    'Changes can be restored by retrieving them from the': 'Los cambios se pueden restaurar desde la',
    Remove: 'Eliminar',
    Delete: 'Eliminar',
    Fetch: 'Obtener',
    'Continue in Browser': 'Continuar en el navegador',
    'Continue in browser': 'Continuar en el navegador',
    'Push Rejected': 'Push rechazado',
    'Push rejected': 'Push rechazado',
    'Re-authorization Required': 'Reautorización requerida',
    'Re-authorization required': 'Reautorización requerida',
    'Open in Browser': 'Abrir en el navegador',
    'Open in browser': 'Abrir en el navegador',
    Dismiss: 'Descartar',
    'Check for Updates': 'Buscar actualizaciones',
    'Checking for updates…': 'Buscando actualizaciones…',
    'Downloading update…': 'Descargando actualización…',
    'An update has been downloaded and is ready to be installed.': 'Se ha descargado una actualización y está lista para instalarse.',
    'Repository Settings': 'Configuración del repositorio',
    'Repository settings': 'Configuración del repositorio',
    'Use my global Git config': 'Usar mi configuración global de Git',
    'Use a local Git config': 'Usar una configuración local de Git',
    Path: 'Ruta',
    Arguments: 'Argumentos',
    Type: 'Tipo',
    Name: 'Nombre',
    'Display Name': 'Nombre visible',
    'Display name': 'Nombre visible',
    'Base URL': 'URL base',
    Authentication: 'Autenticación',
    Add: 'Añadir',
    Save: 'Guardar',
    Update: 'Actualizar',
    Ignore: 'Ignorar',
    Browse: 'Examinar',
    Alias: 'Alias'
  },
  fr: {
    "Let's get started!": 'Commençons !',
    'Add a repository to GitHub Desktop to start collaborating': 'Ajoutez un dépôt à GitHub Desktop pour commencer à collaborer',
    'Return to In Progress Tutorial': 'Revenir au tutoriel en cours',
    'Return to in progress tutorial': 'Revenir au tutoriel en cours',
    'Create a Tutorial Repository…': 'Créer un dépôt de tutoriel…',
    'Create a tutorial repository…': 'Créer un dépôt de tutoriel…',
    'Clone a Repository from the Internet…': 'Cloner un dépôt depuis Internet…',
    'Clone a repository from the Internet…': 'Cloner un dépôt depuis Internet…',
    'Create a New Repository on your Local Drive…': 'Créer un nouveau dépôt sur le disque local…',
    'Create a New Repository on your local drive…': 'Créer un nouveau dépôt sur le disque local…',
    'Add an Existing Repository from your Local Drive…': 'Ajouter un dépôt existant depuis le disque local…',
    'Add an Existing Repository from your local drive…': 'Ajouter un dépôt existant depuis le disque local…',
    'ProTip!': 'Astuce !',
    'You can drag & drop an existing repository folder here to add it to Desktop': 'Vous pouvez glisser-déposer ici un dossier de dépôt existant pour l’ajouter à Desktop',
    'Confirm Discard All Changes': 'Confirmer l’abandon de toutes les modifications',
    'Confirm discard all changes': 'Confirmer l’abandon de toutes les modifications',
    'Confirm Discard Changes': 'Confirmer l’abandon des modifications',
    'Confirm discard changes': 'Confirmer l’abandon des modifications',
    'Discard All Changes': 'Abandonner toutes les modifications',
    'Discard all changes': 'Abandonner toutes les modifications',
    'Discard Changes': 'Abandonner les modifications',
    'Discard changes': 'Abandonner les modifications',
    'Do not show this message again': 'Ne plus afficher ce message',
    'Are you sure you want to discard all changes to:': 'Voulez-vous vraiment abandonner toutes les modifications de :',
    'Are you sure you want to discard the selected changes to:': 'Voulez-vous vraiment abandonner les modifications sélectionnées de :',
    'Changes can be restored by retrieving them from the': 'Les modifications peuvent être restaurées depuis la',
    Remove: 'Supprimer',
    Delete: 'Supprimer',
    Fetch: 'Récupérer',
    'Continue in Browser': 'Continuer dans le navigateur',
    'Continue in browser': 'Continuer dans le navigateur',
    'Push Rejected': 'Push rejeté',
    'Push rejected': 'Push rejeté',
    'Re-authorization Required': 'Réautorisation requise',
    'Re-authorization required': 'Réautorisation requise',
    'Open in Browser': 'Ouvrir dans le navigateur',
    'Open in browser': 'Ouvrir dans le navigateur',
    Dismiss: 'Ignorer',
    'Check for Updates': 'Rechercher les mises à jour',
    'Checking for updates…': 'Recherche de mises à jour…',
    'Downloading update…': 'Téléchargement de la mise à jour…',
    'An update has been downloaded and is ready to be installed.': 'Une mise à jour a été téléchargée et est prête à être installée.',
    'Repository Settings': 'Paramètres du dépôt',
    'Repository settings': 'Paramètres du dépôt',
    'Use my global Git config': 'Utiliser ma configuration Git globale',
    'Use a local Git config': 'Utiliser une configuration Git locale',
    Path: 'Chemin',
    Arguments: 'Arguments',
    Type: 'Type',
    Name: 'Nom',
    'Display Name': 'Nom affiché',
    'Display name': 'Nom affiché',
    'Base URL': 'URL de base',
    Authentication: 'Authentification',
    Add: 'Ajouter',
    Save: 'Enregistrer',
    Update: 'Mettre à jour',
    Ignore: 'Ignorer',
    Browse: 'Parcourir',
    Alias: 'Alias'
  },
  it: {
    "Let's get started!": 'Iniziamo!',
    'Add a repository to GitHub Desktop to start collaborating': 'Aggiungi un repository a GitHub Desktop per iniziare a collaborare',
    'Return to In Progress Tutorial': 'Torna al tutorial in corso',
    'Return to in progress tutorial': 'Torna al tutorial in corso',
    'Create a Tutorial Repository…': 'Crea un repository tutorial…',
    'Create a tutorial repository…': 'Crea un repository tutorial…',
    'Clone a Repository from the Internet…': 'Clona un repository da Internet…',
    'Clone a repository from the Internet…': 'Clona un repository da Internet…',
    'Create a New Repository on your Local Drive…': 'Crea un nuovo repository sul disco locale…',
    'Create a New Repository on your local drive…': 'Crea un nuovo repository sul disco locale…',
    'Add an Existing Repository from your Local Drive…': 'Aggiungi un repository esistente dal disco locale…',
    'Add an Existing Repository from your local drive…': 'Aggiungi un repository esistente dal disco locale…',
    'ProTip!': 'Suggerimento!',
    'You can drag & drop an existing repository folder here to add it to Desktop': 'Puoi trascinare qui una cartella repository esistente per aggiungerla a Desktop',
    'Confirm Discard All Changes': 'Conferma eliminazione di tutte le modifiche',
    'Confirm discard all changes': 'Conferma eliminazione di tutte le modifiche',
    'Confirm Discard Changes': 'Conferma eliminazione modifiche',
    'Confirm discard changes': 'Conferma eliminazione modifiche',
    'Discard All Changes': 'Elimina tutte le modifiche',
    'Discard all changes': 'Elimina tutte le modifiche',
    'Discard Changes': 'Elimina modifiche',
    'Discard changes': 'Elimina modifiche',
    'Do not show this message again': 'Non mostrare più questo messaggio',
    'Are you sure you want to discard all changes to:': 'Vuoi davvero eliminare tutte le modifiche a:',
    'Are you sure you want to discard the selected changes to:': 'Vuoi davvero eliminare le modifiche selezionate a:',
    'Changes can be restored by retrieving them from the': 'Le modifiche possono essere ripristinate dal',
    Remove: 'Rimuovi',
    Delete: 'Elimina',
    Fetch: 'Fetch',
    'Continue in Browser': 'Continua nel browser',
    'Continue in browser': 'Continua nel browser',
    'Push Rejected': 'Push rifiutato',
    'Push rejected': 'Push rifiutato',
    'Re-authorization Required': 'Riautorizzazione richiesta',
    'Re-authorization required': 'Riautorizzazione richiesta',
    'Open in Browser': 'Apri nel browser',
    'Open in browser': 'Apri nel browser',
    Dismiss: 'Ignora',
    'Check for Updates': 'Controlla aggiornamenti',
    'Checking for updates…': 'Controllo aggiornamenti…',
    'Downloading update…': 'Download aggiornamento…',
    'An update has been downloaded and is ready to be installed.': 'Un aggiornamento è stato scaricato ed è pronto per l’installazione.',
    'Repository Settings': 'Impostazioni repository',
    'Repository settings': 'Impostazioni repository',
    'Use my global Git config': 'Usa la mia configurazione Git globale',
    'Use a local Git config': 'Usa una configurazione Git locale',
    Path: 'Percorso',
    Arguments: 'Argomenti',
    Type: 'Tipo',
    Name: 'Nome',
    'Display Name': 'Nome visualizzato',
    'Display name': 'Nome visualizzato',
    'Base URL': 'URL base',
    Authentication: 'Autenticazione',
    Add: 'Aggiungi',
    Save: 'Salva',
    Update: 'Aggiorna',
    Ignore: 'Ignora',
    Browse: 'Sfoglia',
    Alias: 'Alias'
  },
  ja: {
    "Let's get started!": 'はじめましょう！',
    'Add a repository to GitHub Desktop to start collaborating': '共同作業を始めるには GitHub Desktop にリポジトリを追加してください',
    'Return to In Progress Tutorial': '進行中のチュートリアルに戻る',
    'Return to in progress tutorial': '進行中のチュートリアルに戻る',
    'Create a Tutorial Repository…': 'チュートリアルリポジトリを作成…',
    'Create a tutorial repository…': 'チュートリアルリポジトリを作成…',
    'Clone a Repository from the Internet…': 'インターネットからリポジトリをクローン…',
    'Clone a repository from the Internet…': 'インターネットからリポジトリをクローン…',
    'Create a New Repository on your Local Drive…': 'ローカルドライブに新しいリポジトリを作成…',
    'Create a New Repository on your local drive…': 'ローカルドライブに新しいリポジトリを作成…',
    'Add an Existing Repository from your Local Drive…': 'ローカルドライブから既存のリポジトリを追加…',
    'Add an Existing Repository from your local drive…': 'ローカルドライブから既存のリポジトリを追加…',
    'ProTip!': 'ヒント！',
    'You can drag & drop an existing repository folder here to add it to Desktop': '既存のリポジトリフォルダをここにドラッグ＆ドロップして Desktop に追加できます',
    'Confirm Discard All Changes': 'すべての変更の破棄を確認',
    'Confirm discard all changes': 'すべての変更の破棄を確認',
    'Confirm Discard Changes': '変更の破棄を確認',
    'Confirm discard changes': '変更の破棄を確認',
    'Discard All Changes': 'すべての変更を破棄',
    'Discard all changes': 'すべての変更を破棄',
    'Discard Changes': '変更を破棄',
    'Discard changes': '変更を破棄',
    'Do not show this message again': '今後このメッセージを表示しない',
    'Are you sure you want to discard all changes to:': '次のすべての変更を破棄しますか:',
    'Are you sure you want to discard the selected changes to:': '次の選択した変更を破棄しますか:',
    'Changes can be restored by retrieving them from the': '変更は次から復元できます:',
    Remove: '削除',
    Delete: '削除',
    Fetch: 'フェッチ',
    'Continue in Browser': 'ブラウザで続行',
    'Continue in browser': 'ブラウザで続行',
    'Push Rejected': 'プッシュが拒否されました',
    'Push rejected': 'プッシュが拒否されました',
    'Re-authorization Required': '再認証が必要です',
    'Re-authorization required': '再認証が必要です',
    'Open in Browser': 'ブラウザで開く',
    'Open in browser': 'ブラウザで開く',
    Dismiss: '閉じる',
    'Check for Updates': '更新を確認',
    'Checking for updates…': '更新を確認しています…',
    'Downloading update…': '更新をダウンロードしています…',
    'An update has been downloaded and is ready to be installed.': '更新がダウンロードされ、インストールの準備ができました。',
    'Repository Settings': 'リポジトリ設定',
    'Repository settings': 'リポジトリ設定',
    'Use my global Git config': 'グローバル Git 設定を使用',
    'Use a local Git config': 'ローカル Git 設定を使用',
    Path: 'パス',
    Arguments: '引数',
    Type: '種類',
    Name: '名前',
    'Display Name': '表示名',
    'Display name': '表示名',
    'Base URL': 'ベース URL',
    Authentication: '認証',
    Add: '追加',
    Save: '保存',
    Update: '更新',
    Ignore: '無視',
    Browse: '参照',
    Alias: 'エイリアス'
  },
  ko: {
    "Let's get started!": '시작해 봅시다!',
    'Add a repository to GitHub Desktop to start collaborating': '협업을 시작하려면 GitHub Desktop에 저장소를 추가하세요',
    'Return to In Progress Tutorial': '진행 중인 튜토리얼로 돌아가기',
    'Return to in progress tutorial': '진행 중인 튜토리얼로 돌아가기',
    'Create a Tutorial Repository…': '튜토리얼 저장소 만들기…',
    'Create a tutorial repository…': '튜토리얼 저장소 만들기…',
    'Clone a Repository from the Internet…': '인터넷에서 저장소 클론…',
    'Clone a repository from the Internet…': '인터넷에서 저장소 클론…',
    'Create a New Repository on your Local Drive…': '로컬 드라이브에 새 저장소 만들기…',
    'Create a New Repository on your local drive…': '로컬 드라이브에 새 저장소 만들기…',
    'Add an Existing Repository from your Local Drive…': '로컬 드라이브의 기존 저장소 추가…',
    'Add an Existing Repository from your local drive…': '로컬 드라이브의 기존 저장소 추가…',
    'ProTip!': '팁!',
    'You can drag & drop an existing repository folder here to add it to Desktop': '기존 저장소 폴더를 여기로 끌어다 놓아 Desktop에 추가할 수 있습니다',
    'Confirm Discard All Changes': '모든 변경 사항 삭제 확인',
    'Confirm discard all changes': '모든 변경 사항 삭제 확인',
    'Confirm Discard Changes': '변경 사항 삭제 확인',
    'Confirm discard changes': '변경 사항 삭제 확인',
    'Discard All Changes': '모든 변경 사항 삭제',
    'Discard all changes': '모든 변경 사항 삭제',
    'Discard Changes': '변경 사항 삭제',
    'Discard changes': '변경 사항 삭제',
    'Do not show this message again': '이 메시지를 다시 표시하지 않음',
    'Are you sure you want to discard all changes to:': '다음의 모든 변경 사항을 삭제하시겠습니까:',
    'Are you sure you want to discard the selected changes to:': '다음의 선택한 변경 사항을 삭제하시겠습니까:',
    'Changes can be restored by retrieving them from the': '변경 사항은 다음에서 복원할 수 있습니다:',
    Remove: '제거',
    Delete: '삭제',
    Fetch: '가져오기',
    'Continue in Browser': '브라우저에서 계속',
    'Continue in browser': '브라우저에서 계속',
    'Push Rejected': '푸시 거부됨',
    'Push rejected': '푸시 거부됨',
    'Re-authorization Required': '재인증 필요',
    'Re-authorization required': '재인증 필요',
    'Open in Browser': '브라우저에서 열기',
    'Open in browser': '브라우저에서 열기',
    Dismiss: '닫기',
    'Check for Updates': '업데이트 확인',
    'Checking for updates…': '업데이트 확인 중…',
    'Downloading update…': '업데이트 다운로드 중…',
    'An update has been downloaded and is ready to be installed.': '업데이트가 다운로드되었으며 설치할 준비가 되었습니다.',
    'Repository Settings': '저장소 설정',
    'Repository settings': '저장소 설정',
    'Use my global Git config': '전역 Git 설정 사용',
    'Use a local Git config': '로컬 Git 설정 사용',
    Path: '경로',
    Arguments: '인수',
    Type: '유형',
    Name: '이름',
    'Display Name': '표시 이름',
    'Display name': '표시 이름',
    'Base URL': '기본 URL',
    Authentication: '인증',
    Add: '추가',
    Save: '저장',
    Update: '업데이트',
    Ignore: '무시',
    Browse: '찾아보기',
    Alias: '별칭'
  },
  pt: {
    "Let's get started!": 'Vamos começar!',
    'Add a repository to GitHub Desktop to start collaborating': 'Adicione um repositório ao GitHub Desktop para começar a colaborar',
    'Return to In Progress Tutorial': 'Voltar ao tutorial em andamento',
    'Return to in progress tutorial': 'Voltar ao tutorial em andamento',
    'Create a Tutorial Repository…': 'Criar um repositório de tutorial…',
    'Create a tutorial repository…': 'Criar um repositório de tutorial…',
    'Clone a Repository from the Internet…': 'Clonar um repositório da Internet…',
    'Clone a repository from the Internet…': 'Clonar um repositório da Internet…',
    'Create a New Repository on your Local Drive…': 'Criar um novo repositório no disco local…',
    'Create a New Repository on your local drive…': 'Criar um novo repositório no disco local…',
    'Add an Existing Repository from your Local Drive…': 'Adicionar um repositório existente do disco local…',
    'Add an Existing Repository from your local drive…': 'Adicionar um repositório existente do disco local…',
    'ProTip!': 'Dica!',
    'You can drag & drop an existing repository folder here to add it to Desktop': 'Você pode arrastar uma pasta de repositório existente aqui para adicioná-la ao Desktop',
    'Confirm Discard All Changes': 'Confirmar descarte de todas as alterações',
    'Confirm discard all changes': 'Confirmar descarte de todas as alterações',
    'Confirm Discard Changes': 'Confirmar descarte de alterações',
    'Confirm discard changes': 'Confirmar descarte de alterações',
    'Discard All Changes': 'Descartar todas as alterações',
    'Discard all changes': 'Descartar todas as alterações',
    'Discard Changes': 'Descartar alterações',
    'Discard changes': 'Descartar alterações',
    'Do not show this message again': 'Não mostrar esta mensagem novamente',
    'Are you sure you want to discard all changes to:': 'Tem certeza de que deseja descartar todas as alterações em:',
    'Are you sure you want to discard the selected changes to:': 'Tem certeza de que deseja descartar as alterações selecionadas em:',
    'Changes can be restored by retrieving them from the': 'As alterações podem ser restauradas a partir da',
    Remove: 'Remover',
    Delete: 'Excluir',
    Fetch: 'Buscar',
    'Continue in Browser': 'Continuar no navegador',
    'Continue in browser': 'Continuar no navegador',
    'Push Rejected': 'Push rejeitado',
    'Push rejected': 'Push rejeitado',
    'Re-authorization Required': 'Reautorização necessária',
    'Re-authorization required': 'Reautorização necessária',
    'Open in Browser': 'Abrir no navegador',
    'Open in browser': 'Abrir no navegador',
    Dismiss: 'Dispensar',
    'Check for Updates': 'Verificar atualizações',
    'Checking for updates…': 'Verificando atualizações…',
    'Downloading update…': 'Baixando atualização…',
    'An update has been downloaded and is ready to be installed.': 'Uma atualização foi baixada e está pronta para instalação.',
    'Repository Settings': 'Configurações do repositório',
    'Repository settings': 'Configurações do repositório',
    'Use my global Git config': 'Usar minha configuração Git global',
    'Use a local Git config': 'Usar uma configuração Git local',
    Path: 'Caminho',
    Arguments: 'Argumentos',
    Type: 'Tipo',
    Name: 'Nome',
    'Display Name': 'Nome de exibição',
    'Display name': 'Nome de exibição',
    'Base URL': 'URL base',
    Authentication: 'Autenticação',
    Add: 'Adicionar',
    Save: 'Salvar',
    Update: 'Atualizar',
    Ignore: 'Ignorar',
    Browse: 'Procurar',
    Alias: 'Alias'
  },
  tr: {
    "Let's get started!": 'Hadi başlayalım!',
    'Add a repository to GitHub Desktop to start collaborating': 'İş birliğine başlamak için GitHub Desktop’a bir depo ekleyin',
    'Return to In Progress Tutorial': 'Devam eden eğitime dön',
    'Return to in progress tutorial': 'Devam eden eğitime dön',
    'Create a Tutorial Repository…': 'Eğitim deposu oluştur…',
    'Create a tutorial repository…': 'Eğitim deposu oluştur…',
    'Clone a Repository from the Internet…': 'İnternetten depo klonla…',
    'Clone a repository from the Internet…': 'İnternetten depo klonla…',
    'Create a New Repository on your Local Drive…': 'Yerel diskte yeni depo oluştur…',
    'Create a New Repository on your local drive…': 'Yerel diskte yeni depo oluştur…',
    'Add an Existing Repository from your Local Drive…': 'Yerel diskten mevcut depo ekle…',
    'Add an Existing Repository from your local drive…': 'Yerel diskten mevcut depo ekle…',
    'ProTip!': 'İpucu!',
    'You can drag & drop an existing repository folder here to add it to Desktop': 'Mevcut bir depo klasörünü Desktop’a eklemek için buraya sürükleyip bırakabilirsiniz',
    'Confirm Discard All Changes': 'Tüm değişiklikleri silmeyi onayla',
    'Confirm discard all changes': 'Tüm değişiklikleri silmeyi onayla',
    'Confirm Discard Changes': 'Değişiklikleri silmeyi onayla',
    'Confirm discard changes': 'Değişiklikleri silmeyi onayla',
    'Discard All Changes': 'Tüm değişiklikleri sil',
    'Discard all changes': 'Tüm değişiklikleri sil',
    'Discard Changes': 'Değişiklikleri sil',
    'Discard changes': 'Değişiklikleri sil',
    'Do not show this message again': 'Bu mesajı tekrar gösterme',
    'Are you sure you want to discard all changes to:': 'Şundaki tüm değişiklikleri silmek istediğinizden emin misiniz:',
    'Are you sure you want to discard the selected changes to:': 'Şundaki seçili değişiklikleri silmek istediğinizden emin misiniz:',
    'Changes can be restored by retrieving them from the': 'Değişiklikler şuradan geri alınabilir:',
    Remove: 'Kaldır',
    Delete: 'Sil',
    Fetch: 'Getir',
    'Continue in Browser': 'Tarayıcıda devam et',
    'Continue in browser': 'Tarayıcıda devam et',
    'Push Rejected': 'Push reddedildi',
    'Push rejected': 'Push reddedildi',
    'Re-authorization Required': 'Yeniden yetkilendirme gerekli',
    'Re-authorization required': 'Yeniden yetkilendirme gerekli',
    'Open in Browser': 'Tarayıcıda aç',
    'Open in browser': 'Tarayıcıda aç',
    Dismiss: 'Kapat',
    'Check for Updates': 'Güncellemeleri denetle',
    'Checking for updates…': 'Güncellemeler denetleniyor…',
    'Downloading update…': 'Güncelleme indiriliyor…',
    'An update has been downloaded and is ready to be installed.': 'Bir güncelleme indirildi ve kurulmaya hazır.',
    'Repository Settings': 'Depo ayarları',
    'Repository settings': 'Depo ayarları',
    'Use my global Git config': 'Genel Git yapılandırmamı kullan',
    'Use a local Git config': 'Yerel Git yapılandırması kullan',
    Path: 'Yol',
    Arguments: 'Argümanlar',
    Type: 'Tür',
    Name: 'Ad',
    'Display Name': 'Görünen ad',
    'Display name': 'Görünen ad',
    'Base URL': 'Temel URL',
    Authentication: 'Kimlik doğrulama',
    Add: 'Ekle',
    Save: 'Kaydet',
    Update: 'Güncelle',
    Ignore: 'Yoksay',
    Browse: 'Gözat',
    Alias: 'Takma ad'
  },
  'zh-CN': {
    "Let's get started!": '开始使用！',
    'Add a repository to GitHub Desktop to start collaborating': '添加一个仓库到 GitHub Desktop 以开始协作',
    'Return to In Progress Tutorial': '返回进行中的教程',
    'Return to in progress tutorial': '返回进行中的教程',
    'Create a Tutorial Repository…': '创建教程仓库…',
    'Create a tutorial repository…': '创建教程仓库…',
    'Clone a Repository from the Internet…': '从互联网克隆仓库…',
    'Clone a repository from the Internet…': '从互联网克隆仓库…',
    'Create a New Repository on your Local Drive…': '在本地磁盘创建新仓库…',
    'Create a New Repository on your local drive…': '在本地磁盘创建新仓库…',
    'Add an Existing Repository from your Local Drive…': '从本地磁盘添加已有仓库…',
    'Add an Existing Repository from your local drive…': '从本地磁盘添加已有仓库…',
    'ProTip!': '提示！',
    'You can drag & drop an existing repository folder here to add it to Desktop': '可以将已有仓库文件夹拖放到这里，以添加到 Desktop',
    'Confirm Discard All Changes': '确认丢弃所有更改',
    'Confirm discard all changes': '确认丢弃所有更改',
    'Confirm Discard Changes': '确认丢弃更改',
    'Confirm discard changes': '确认丢弃更改',
    'Discard All Changes': '丢弃所有更改',
    'Discard all changes': '丢弃所有更改',
    'Discard Changes': '丢弃更改',
    'Discard changes': '丢弃更改',
    'Do not show this message again': '不再显示此消息',
    'Are you sure you want to discard all changes to:': '确定要丢弃以下文件的所有更改吗：',
    'Are you sure you want to discard the selected changes to:': '确定要丢弃以下文件中选中的更改吗：',
    'Changes can be restored by retrieving them from the': '可以从以下位置恢复这些更改：',
    Remove: '移除',
    Delete: '删除',
    Fetch: '获取',
    'Continue in Browser': '在浏览器中继续',
    'Continue in browser': '在浏览器中继续',
    'Push Rejected': '推送被拒绝',
    'Push rejected': '推送被拒绝',
    'Re-authorization Required': '需要重新授权',
    'Re-authorization required': '需要重新授权',
    'Open in Browser': '在浏览器中打开',
    'Open in browser': '在浏览器中打开',
    Dismiss: '关闭',
    'Check for Updates': '检查更新',
    'Checking for updates…': '正在检查更新…',
    'Downloading update…': '正在下载更新…',
    'An update has been downloaded and is ready to be installed.': '更新已下载完成，可以安装。',
    'Repository Settings': '仓库设置',
    'Repository settings': '仓库设置',
    'Use my global Git config': '使用我的全局 Git 配置',
    'Use a local Git config': '使用本地 Git 配置',
    Path: '路径',
    Arguments: '参数',
    Type: '类型',
    Name: '名称',
    'Display Name': '显示名称',
    'Display name': '显示名称',
    'Base URL': '基础 URL',
    Authentication: '认证',
    Add: '添加',
    Save: '保存',
    Update: '更新',
    Ignore: '忽略',
    Browse: '浏览',
    Alias: '别名'
  },
  'zh-TW': {
    "Let's get started!": '開始使用！',
    'Add a repository to GitHub Desktop to start collaborating': '新增一個倉庫到 GitHub Desktop 以開始協作',
    'Return to In Progress Tutorial': '返回進行中的教學',
    'Return to in progress tutorial': '返回進行中的教學',
    'Create a Tutorial Repository…': '建立教學倉庫…',
    'Create a tutorial repository…': '建立教學倉庫…',
    'Clone a Repository from the Internet…': '從網際網路複製倉庫…',
    'Clone a repository from the Internet…': '從網際網路複製倉庫…',
    'Create a New Repository on your Local Drive…': '在本機磁碟建立新倉庫…',
    'Create a New Repository on your local drive…': '在本機磁碟建立新倉庫…',
    'Add an Existing Repository from your Local Drive…': '從本機磁碟新增既有倉庫…',
    'Add an Existing Repository from your local drive…': '從本機磁碟新增既有倉庫…',
    'ProTip!': '提示！',
    'You can drag & drop an existing repository folder here to add it to Desktop': '可以將既有倉庫資料夾拖放到這裡，以新增到 Desktop',
    'Confirm Discard All Changes': '確認捨棄所有變更',
    'Confirm discard all changes': '確認捨棄所有變更',
    'Confirm Discard Changes': '確認捨棄變更',
    'Confirm discard changes': '確認捨棄變更',
    'Discard All Changes': '捨棄所有變更',
    'Discard all changes': '捨棄所有變更',
    'Discard Changes': '捨棄變更',
    'Discard changes': '捨棄變更',
    'Do not show this message again': '不再顯示此訊息',
    'Are you sure you want to discard all changes to:': '確定要捨棄以下檔案的所有變更嗎：',
    'Are you sure you want to discard the selected changes to:': '確定要捨棄以下檔案中選取的變更嗎：',
    'Changes can be restored by retrieving them from the': '可以從以下位置恢復這些變更：',
    Remove: '移除',
    Delete: '刪除',
    Fetch: '擷取',
    'Continue in Browser': '在瀏覽器中繼續',
    'Continue in browser': '在瀏覽器中繼續',
    'Push Rejected': '推送被拒絕',
    'Push rejected': '推送被拒絕',
    'Re-authorization Required': '需要重新授權',
    'Re-authorization required': '需要重新授權',
    'Open in Browser': '在瀏覽器中開啟',
    'Open in browser': '在瀏覽器中開啟',
    Dismiss: '關閉',
    'Check for Updates': '檢查更新',
    'Checking for updates…': '正在檢查更新…',
    'Downloading update…': '正在下載更新…',
    'An update has been downloaded and is ready to be installed.': '更新已下載完成，可以安裝。',
    'Repository Settings': '倉庫設定',
    'Repository settings': '倉庫設定',
    'Use my global Git config': '使用我的全域 Git 設定',
    'Use a local Git config': '使用本機 Git 設定',
    Path: '路徑',
    Arguments: '參數',
    Type: '類型',
    Name: '名稱',
    'Display Name': '顯示名稱',
    'Display name': '顯示名稱',
    'Base URL': '基礎 URL',
    Authentication: '認證',
    Add: '新增',
    Save: '儲存',
    Update: '更新',
    Ignore: '忽略',
    Browse: '瀏覽',
    Alias: '別名'
  }
}

for (const language of SUPPORTED_LANGUAGES) {
  Object.assign(internalText[language], remainingInternalText[language])
}

const moreRemainingInternalText: Record<SupportedLanguage, Record<string, string>> = {
  de: {
    'Open With…': 'Mit … öffnen',
    'Open with…': 'Mit … öffnen',
    'Open Without Git': 'Ohne Git öffnen',
    'Open without Git': 'Ohne Git öffnen',
    'View on GitHub': 'Auf GitHub ansehen',
    'View on GitHub Enterprise': 'Auf GitHub Enterprise ansehen',
    'Notifications Settings': 'Benachrichtigungseinstellungen',
    'Repository sidebar': 'Repository-Seitenleiste',
    'No Repositories': 'Keine Repositories',
    'No repositories': 'Keine Repositories',
    'Current repository': 'Aktuelles Repository',
    'Open Git Settings': 'Git-Einstellungen öffnen',
    'Open git settings': 'Git-Einstellungen öffnen',
    'Show in Explorer': 'Im Explorer anzeigen',
    'Show in Finder': 'Im Finder anzeigen',
    'Show in your File Manager': 'Im Dateimanager anzeigen'
  },
  en: {},
  es: {
    'Open With…': 'Abrir con…',
    'Open with…': 'Abrir con…',
    'Open Without Git': 'Abrir sin Git',
    'Open without Git': 'Abrir sin Git',
    'View on GitHub': 'Ver en GitHub',
    'View on GitHub Enterprise': 'Ver en GitHub Enterprise',
    'Notifications Settings': 'Configuración de notificaciones',
    'Repository sidebar': 'Barra lateral del repositorio',
    'No Repositories': 'Sin repositorios',
    'No repositories': 'Sin repositorios',
    'Current repository': 'Repositorio actual',
    'Open Git Settings': 'Abrir ajustes de Git',
    'Open git settings': 'Abrir ajustes de Git',
    'Show in Explorer': 'Mostrar en el Explorador',
    'Show in Finder': 'Mostrar en Finder',
    'Show in your File Manager': 'Mostrar en el administrador de archivos'
  },
  fr: {
    'Open With…': 'Ouvrir avec…',
    'Open with…': 'Ouvrir avec…',
    'Open Without Git': 'Ouvrir sans Git',
    'Open without Git': 'Ouvrir sans Git',
    'View on GitHub': 'Voir sur GitHub',
    'View on GitHub Enterprise': 'Voir sur GitHub Enterprise',
    'Notifications Settings': 'Paramètres de notifications',
    'Repository sidebar': 'Barre latérale du dépôt',
    'No Repositories': 'Aucun dépôt',
    'No repositories': 'Aucun dépôt',
    'Current repository': 'Dépôt actuel',
    'Open Git Settings': 'Ouvrir les paramètres Git',
    'Open git settings': 'Ouvrir les paramètres Git',
    'Show in Explorer': "Afficher dans l’Explorateur",
    'Show in Finder': 'Afficher dans le Finder',
    'Show in your File Manager': 'Afficher dans le gestionnaire de fichiers'
  },
  it: {
    'Open With…': 'Apri con…',
    'Open with…': 'Apri con…',
    'Open Without Git': 'Apri senza Git',
    'Open without Git': 'Apri senza Git',
    'View on GitHub': 'Visualizza su GitHub',
    'View on GitHub Enterprise': 'Visualizza su GitHub Enterprise',
    'Notifications Settings': 'Impostazioni notifiche',
    'Repository sidebar': 'Barra laterale del repository',
    'No Repositories': 'Nessun repository',
    'No repositories': 'Nessun repository',
    'Current repository': 'Repository corrente',
    'Open Git Settings': 'Apri impostazioni Git',
    'Open git settings': 'Apri impostazioni Git',
    'Show in Explorer': "Mostra nell’Esplora file",
    'Show in Finder': 'Mostra nel Finder',
    'Show in your File Manager': 'Mostra nel file manager'
  },
  ja: {
    'Open With…': '別のアプリで開く…',
    'Open with…': '別のアプリで開く…',
    'Open Without Git': 'Git なしで開く',
    'Open without Git': 'Git なしで開く',
    'View on GitHub': 'GitHub で表示',
    'View on GitHub Enterprise': 'GitHub Enterprise で表示',
    'Notifications Settings': '通知設定',
    'Repository sidebar': 'リポジトリのサイドバー',
    'No Repositories': 'リポジトリがありません',
    'No repositories': 'リポジトリがありません',
    'Current repository': '現在のリポジトリ',
    'Open Git Settings': 'Git 設定を開く',
    'Open git settings': 'Git 設定を開く',
    'Show in Explorer': 'エクスプローラーで表示',
    'Show in Finder': 'Finder で表示',
    'Show in your File Manager': 'ファイルマネージャーで表示'
  },
  ko: {
    'Open With…': '다른 앱으로 열기…',
    'Open with…': '다른 앱으로 열기…',
    'Open Without Git': 'Git 없이 열기',
    'Open without Git': 'Git 없이 열기',
    'View on GitHub': 'GitHub에서 보기',
    'View on GitHub Enterprise': 'GitHub Enterprise에서 보기',
    'Notifications Settings': '알림 설정',
    'Repository sidebar': '저장소 사이드바',
    'No Repositories': '저장소가 없습니다',
    'No repositories': '저장소가 없습니다',
    'Current repository': '현재 저장소',
    'Open Git Settings': 'Git 설정 열기',
    'Open git settings': 'Git 설정 열기',
    'Show in Explorer': '탐색기에서 보기',
    'Show in Finder': 'Finder에서 보기',
    'Show in your File Manager': '파일 관리자에서 보기'
  },
  pt: {
    'Open With…': 'Abrir com…',
    'Open with…': 'Abrir com…',
    'Open Without Git': 'Abrir sem Git',
    'Open without Git': 'Abrir sem Git',
    'View on GitHub': 'Ver no GitHub',
    'View on GitHub Enterprise': 'Ver no GitHub Enterprise',
    'Notifications Settings': 'Configurações de notificações',
    'Repository sidebar': 'Barra lateral do repositório',
    'No Repositories': 'Nenhum repositório',
    'No repositories': 'Nenhum repositório',
    'Current repository': 'Repositório atual',
    'Open Git Settings': 'Abrir configurações do Git',
    'Open git settings': 'Abrir configurações do Git',
    'Show in Explorer': 'Mostrar no Explorador',
    'Show in Finder': 'Mostrar no Finder',
    'Show in your File Manager': 'Mostrar no gerenciador de arquivos'
  },
  tr: {
    'Open With…': 'Birlikte aç…',
    'Open with…': 'Birlikte aç…',
    'Open Without Git': 'Git olmadan aç',
    'Open without Git': 'Git olmadan aç',
    'View on GitHub': 'GitHub’da görüntüle',
    'View on GitHub Enterprise': 'GitHub Enterprise’da görüntüle',
    'Notifications Settings': 'Bildirim ayarları',
    'Repository sidebar': 'Depo kenar çubuğu',
    'No Repositories': 'Depo yok',
    'No repositories': 'Depo yok',
    'Current repository': 'Geçerli depo',
    'Open Git Settings': 'Git ayarlarını aç',
    'Open git settings': 'Git ayarlarını aç',
    'Show in Explorer': 'Gezgin’de göster',
    'Show in Finder': 'Finder’da göster',
    'Show in your File Manager': 'Dosya yöneticisinde göster'
  },
  'zh-CN': {
    'Open With…': '用其他应用打开…',
    'Open with…': '用其他应用打开…',
    'Open Without Git': '不使用 Git 打开',
    'Open without Git': '不使用 Git 打开',
    'View on GitHub': '在 GitHub 上查看',
    'View on GitHub Enterprise': '在 GitHub Enterprise 上查看',
    'Notifications Settings': '通知设置',
    'Repository sidebar': '仓库侧边栏',
    'No Repositories': '没有仓库',
    'No repositories': '没有仓库',
    'Current repository': '当前仓库',
    'Open Git Settings': '打开 Git 设置',
    'Open git settings': '打开 Git 设置',
    'Show in Explorer': '在资源管理器中显示',
    'Show in Finder': '在访达中显示',
    'Show in your File Manager': '在文件管理器中显示'
  },
  'zh-TW': {
    'Open With…': '用其他應用開啟…',
    'Open with…': '用其他應用開啟…',
    'Open Without Git': '不使用 Git 開啟',
    'Open without Git': '不使用 Git 開啟',
    'View on GitHub': '在 GitHub 上檢視',
    'View on GitHub Enterprise': '在 GitHub Enterprise 上檢視',
    'Notifications Settings': '通知設定',
    'Repository sidebar': '倉庫側邊欄',
    'No Repositories': '沒有倉庫',
    'No repositories': '沒有倉庫',
    'Current repository': '目前倉庫',
    'Open Git Settings': '開啟 Git 設定',
    'Open git settings': '開啟 Git 設定',
    'Show in Explorer': '在檔案總管中顯示',
    'Show in Finder': '在 Finder 中顯示',
    'Show in your File Manager': '在檔案管理器中顯示'
  }
}

for (const language of SUPPORTED_LANGUAGES) {
  Object.assign(internalText[language], moreRemainingInternalText[language])
}

const diffOverlayInternalText: Record<SupportedLanguage, Record<string, string>> = {
  de: {
    'Diff Settings': 'Diff-Einstellungen',
    'Diff Options': 'Diff-Optionen',
    Whitespace: 'Leerraum',
    'Hide Whitespace Changes': 'Leerraumänderungen ausblenden',
    'Hide whitespace changes': 'Leerraumänderungen ausblenden',
    'Interacting with individual lines or hunks will be disabled while hiding whitespace.':
      'Beim Ausblenden von Leerraum werden Interaktionen mit einzelnen Zeilen oder Hunks deaktiviert.',
    'Diff display': 'Diff-Anzeige',
    Unified: 'Einheitlich',
    Split: 'Geteilt'
  },
  en: {},
  es: {
    'Diff Settings': 'Configuración de diff',
    'Diff Options': 'Opciones de diff',
    Whitespace: 'Espacios en blanco',
    'Hide Whitespace Changes': 'Ocultar cambios de espacios en blanco',
    'Hide whitespace changes': 'Ocultar cambios de espacios en blanco',
    'Interacting with individual lines or hunks will be disabled while hiding whitespace.':
      'La interacción con líneas o bloques individuales se desactivará al ocultar espacios en blanco.',
    'Diff display': 'Vista de diff',
    Unified: 'Unificado',
    Split: 'Dividido'
  },
  fr: {
    'Diff Settings': 'Paramètres du diff',
    'Diff Options': 'Options du diff',
    Whitespace: 'Espaces',
    'Hide Whitespace Changes': "Masquer les changements d'espaces",
    'Hide whitespace changes': "Masquer les changements d'espaces",
    'Interacting with individual lines or hunks will be disabled while hiding whitespace.':
      "L'interaction avec des lignes ou blocs individuels sera désactivée lorsque les espaces sont masqués.",
    'Diff display': 'Affichage du diff',
    Unified: 'Unifié',
    Split: 'Scindé'
  },
  it: {
    'Diff Settings': 'Impostazioni diff',
    'Diff Options': 'Opzioni diff',
    Whitespace: 'Spazi bianchi',
    'Hide Whitespace Changes': 'Nascondi modifiche degli spazi bianchi',
    'Hide whitespace changes': 'Nascondi modifiche degli spazi bianchi',
    'Interacting with individual lines or hunks will be disabled while hiding whitespace.':
      'L’interazione con singole righe o blocchi sarà disabilitata quando nascondi gli spazi bianchi.',
    'Diff display': 'Visualizzazione diff',
    Unified: 'Unificato',
    Split: 'Diviso'
  },
  ja: {
    'Diff Settings': 'Diff 設定',
    'Diff Options': 'Diff オプション',
    Whitespace: '空白',
    'Hide Whitespace Changes': '空白の変更を非表示',
    'Hide whitespace changes': '空白の変更を非表示',
    'Interacting with individual lines or hunks will be disabled while hiding whitespace.':
      '空白を非表示にすると、個別の行や差分ブロックとの操作は無効になります。',
    'Diff display': 'Diff 表示',
    Unified: '統合',
    Split: '分割'
  },
  ko: {
    'Diff Settings': 'Diff 설정',
    'Diff Options': 'Diff 옵션',
    Whitespace: '공백',
    'Hide Whitespace Changes': '공백 변경 숨기기',
    'Hide whitespace changes': '공백 변경 숨기기',
    'Interacting with individual lines or hunks will be disabled while hiding whitespace.':
      '공백을 숨기면 개별 줄이나 헝크와의 상호작용이 비활성화됩니다.',
    'Diff display': 'Diff 표시',
    Unified: '통합',
    Split: '분할'
  },
  pt: {
    'Diff Settings': 'Configurações de diff',
    'Diff Options': 'Opções de diff',
    Whitespace: 'Espaços em branco',
    'Hide Whitespace Changes': 'Ocultar alterações de espaços em branco',
    'Hide whitespace changes': 'Ocultar alterações de espaços em branco',
    'Interacting with individual lines or hunks will be disabled while hiding whitespace.':
      'A interação com linhas ou blocos individuais será desativada ao ocultar espaços em branco.',
    'Diff display': 'Exibição do diff',
    Unified: 'Unificado',
    Split: 'Dividido'
  },
  tr: {
    'Diff Settings': 'Diff ayarları',
    'Diff Options': 'Diff seçenekleri',
    Whitespace: 'Boşluklar',
    'Hide Whitespace Changes': 'Boşluk değişikliklerini gizle',
    'Hide whitespace changes': 'Boşluk değişikliklerini gizle',
    'Interacting with individual lines or hunks will be disabled while hiding whitespace.':
      'Boşluklar gizlenirken tek tek satırlar veya bloklarla etkileşim devre dışı kalır.',
    'Diff display': 'Diff görünümü',
    Unified: 'Birleşik',
    Split: 'Bölünmüş'
  },
  'zh-CN': {
    'Diff Settings': '差异设置',
    'Diff Options': '差异选项',
    Whitespace: '空白字符',
    'Hide Whitespace Changes': '隐藏空白字符更改',
    'Hide whitespace changes': '隐藏空白字符更改',
    'Interacting with individual lines or hunks will be disabled while hiding whitespace.':
      '隐藏空白字符时，将无法与单独的行或代码块交互。',
    'Diff display': '差异显示',
    Unified: '统一',
    Split: '分栏'
  },
  'zh-TW': {
    'Diff Settings': '差異設定',
    'Diff Options': '差異選項',
    Whitespace: '空白字元',
    'Hide Whitespace Changes': '隱藏空白字元變更',
    'Hide whitespace changes': '隱藏空白字元變更',
    'Interacting with individual lines or hunks will be disabled while hiding whitespace.':
      '隱藏空白字元時，將無法與單獨的行或差異區塊互動。',
    'Diff display': '差異顯示',
    Unified: '統一',
    Split: '分欄'
  }
}

for (const language of SUPPORTED_LANGUAGES) {
  Object.assign(internalText[language], diffOverlayInternalText[language])
}

const compactInternalText: ReadonlyArray<readonly [
  string,
  Record<Exclude<SupportedLanguage, 'en'>, string>
]> = [
  ['Filter', {
    de: 'Filtern',
    es: 'Filtrar',
    fr: 'Filtrer',
    it: 'Filtra',
    ja: 'フィルター',
    ko: '필터',
    pt: 'Filtrar',
    tr: 'Filtrele',
    'zh-CN': '筛选',
    'zh-TW': '篩選'
  }],
  ['Remote URL', {
    de: 'Remote-URL',
    es: 'URL remota',
    fr: 'URL distante',
    it: 'URL remote',
    ja: 'リモート URL',
    ko: '원격 URL',
    pt: 'URL remota',
    tr: 'Uzak URL',
    'zh-CN': '远程 URL',
    'zh-TW': '遠端 URL'
  }],
  ['repository path', {
    de: 'Repository-Pfad',
    es: 'ruta del repositorio',
    fr: 'chemin du dépôt',
    it: 'percorso repository',
    ja: 'リポジトリパス',
    ko: '저장소 경로',
    pt: 'caminho do repositório',
    tr: 'depo yolu',
    'zh-CN': '仓库路径',
    'zh-TW': '倉庫路徑'
  }],
  ['Path to executable', {
    de: 'Pfad zur ausführbaren Datei',
    es: 'Ruta al ejecutable',
    fr: 'Chemin de l’exécutable',
    it: 'Percorso dell’eseguibile',
    ja: '実行ファイルのパス',
    ko: '실행 파일 경로',
    pt: 'Caminho do executável',
    tr: 'Çalıştırılabilir dosya yolu',
    'zh-CN': '可执行文件路径',
    'zh-TW': '可執行檔路徑'
  }],
  ['Command line arguments', {
    de: 'Befehlszeilenargumente',
    es: 'Argumentos de línea de comandos',
    fr: 'Arguments de ligne de commande',
    it: 'Argomenti della riga di comando',
    ja: 'コマンドライン引数',
    ko: '명령줄 인수',
    pt: 'Argumentos de linha de comando',
    tr: 'Komut satırı argümanları',
    'zh-CN': '命令行参数',
    'zh-TW': '命令列參數'
  }],
  ['Application menu', {
    de: 'Anwendungsmenü',
    es: 'Menú de la aplicación',
    fr: 'Menu de l’application',
    it: 'Menu applicazione',
    ja: 'アプリケーションメニュー',
    ko: '애플리케이션 메뉴',
    pt: 'Menu do aplicativo',
    tr: 'Uygulama menüsü',
    'zh-CN': '应用菜单',
    'zh-TW': '應用程式選單'
  }],
  ['External editor', {
    de: 'Externer Editor',
    es: 'Editor externo',
    fr: 'Éditeur externe',
    it: 'Editor esterno',
    ja: '外部エディタ',
    ko: '외부 편집기',
    pt: 'Editor externo',
    tr: 'Harici düzenleyici',
    'zh-CN': '外部编辑器',
    'zh-TW': '外部編輯器'
  }],
  ['Shell', {
    de: 'Shell',
    es: 'Shell',
    fr: 'Shell',
    it: 'Shell',
    ja: 'シェル',
    ko: '셸',
    pt: 'Shell',
    tr: 'Kabuk',
    'zh-CN': 'Shell',
    'zh-TW': 'Shell'
  }],
  ['Resize handle', {
    de: 'Griff zum Ändern der Größe',
    es: 'Control de redimensionado',
    fr: 'Poignée de redimensionnement',
    it: 'Maniglia di ridimensionamento',
    ja: 'サイズ変更ハンドル',
    ko: '크기 조절 핸들',
    pt: 'Alça de redimensionamento',
    tr: 'Yeniden boyutlandırma tutamacı',
    'zh-CN': '调整大小手柄',
    'zh-TW': '調整大小控制點'
  }],
  ['Toggle password visibility', {
    de: 'Passwortsichtbarkeit umschalten',
    es: 'Alternar visibilidad de contraseña',
    fr: 'Basculer la visibilité du mot de passe',
    it: 'Mostra o nascondi password',
    ja: 'パスワード表示を切り替え',
    ko: '비밀번호 표시 전환',
    pt: 'Alternar visibilidade da senha',
    tr: 'Parola görünürlüğünü değiştir',
    'zh-CN': '切换密码可见性',
    'zh-TW': '切換密碼可見性'
  }],
  ['Copy the full SHA', {
    de: 'Vollständigen SHA kopieren',
    es: 'Copiar SHA completo',
    fr: 'Copier le SHA complet',
    it: 'Copia SHA completo',
    ja: '完全な SHA をコピー',
    ko: '전체 SHA 복사',
    pt: 'Copiar SHA completo',
    tr: 'Tam SHA kopyala',
    'zh-CN': '复制完整 SHA',
    'zh-TW': '複製完整 SHA'
  }],
  ['Publish branch', {
    de: 'Branch veröffentlichen',
    es: 'Publicar rama',
    fr: 'Publier la branche',
    it: 'Pubblica branch',
    ja: 'ブランチを公開',
    ko: '브랜치 게시',
    pt: 'Publicar branch',
    tr: 'Branch yayınla',
    'zh-CN': '发布分支',
    'zh-TW': '發布分支'
  }]
]

for (const [source, translations] of compactInternalText) {
  for (const language of SUPPORTED_LANGUAGES) {
    if (language !== 'en') {
      internalText[language][source] = translations[language]
    }
  }
}

const internalTextNodes = new WeakMap<Text, string>()
const TRANSLATABLE_ATTRIBUTES = ['title', 'aria-label', 'placeholder'] as const

let currentLanguage: SupportedLanguage = 'zh-CN'

const normalizeLanguage = (language: string | undefined): SupportedLanguage => {
  if (language && SUPPORTED_LANGUAGES.includes(language as SupportedLanguage)) {
    return language as SupportedLanguage
  }
  return 'en'
}

const t = (key: keyof typeof localeText.en): string => localeText[currentLanguage][key]

const sanitize = (value: string | undefined, fallback: string): string => {
  const color = value?.trim()
  return color ? color.replace(/[{};]/g, '') : fallback
}

const getColor = (
  payload: MarkNoteProThemePayload,
  name: string,
  lightFallback: string,
  darkFallback: string = lightFallback
): string => sanitize(payload.colors[name], payload.isDark ? darkFallback : lightFallback)

const getAdapterCss = (payload: MarkNoteProThemePayload): string => {
  const background = getColor(payload, 'editorBgColor', '#ffffff', '#24292e')
  const panel = getColor(payload, 'itemBgColor', '#f6f8fa', '#2f363d')
  const toolbar = getColor(payload, 'editorBgColor', '#ffffff', '#24292e')
  const hover = getColor(payload, 'floatHoverColor', '#f3f4f6', '#3a3f4b')
  const border = getColor(payload, 'floatBorderColor', '#d0d7de', '#444c56')
  const contrastBorder = getColor(payload, 'editorColor30', '#8c959f', '#6e7681')
  const text = getColor(payload, 'editorColor', '#24292f', '#c9d1d9')
  const textStrong = getColor(payload, 'editorColor80', '#1f2328', '#f0f3f6')
  const textSecondary = getColor(payload, 'editorColor60', '#57606a', '#8b949e')
  const textMuted = getColor(payload, 'editorColor40', '#6e7781', '#6e7681')
  const accent = getColor(payload, 'themeColor', '#0969da', '#58a6ff')
  const accentSoft = getColor(payload, 'themeColor20', 'rgba(9, 105, 218, 0.16)', 'rgba(88, 166, 255, 0.18)')
  const accentSofter = getColor(payload, 'themeColor10', 'rgba(9, 105, 218, 0.08)', 'rgba(88, 166, 255, 0.10)')
  const selection = getColor(payload, 'selectionColor', accentSoft, accentSoft)
  const input = getColor(payload, 'inputBgColor', '#ffffff', '#1f242b')
  const deleteColor = getColor(payload, 'deleteColor', '#cf222e', '#ff7b72')

  return `
:root,
body,
body.theme-light,
body.theme-dark {
  --marknotepro-github-action-rail-width: 45px;
  --background-color: ${background};
  --box-background-color: ${background};
  --box-alt-background-color: ${panel};
  --box-skeleton-background-color: ${panel};
  --box-border-color: ${border};
  --box-border-contrast-color: ${contrastBorder};
  --box-border-accent-color: ${accent};
  --box-selected-background-color: ${selection};
  --box-selected-active-background-color: ${accentSoft};
  --box-selected-text-color: ${textStrong};
  --box-hover-background-color: ${hover};
  --box-hover-text-color: ${textStrong};
  --text-color: ${text};
  --text-secondary-color: ${textSecondary};
  --text-secondary-color-muted: ${textMuted};
  --toolbar-background-color: ${toolbar};
  --toolbar-border-color: ${border};
  --toolbar-text-color: ${text};
  --toolbar-text-secondary-color: ${textSecondary};
  --toolbar-button-color: ${text};
  --toolbar-button-background-color: transparent;
  --toolbar-button-border-color: ${border};
  --toolbar-button-secondary-color: ${textSecondary};
  --toolbar-button-hover-color: ${textStrong};
  --toolbar-button-hover-background-color: ${hover};
  --toolbar-button-hover-border-color: ${border};
  --toolbar-button-focus-background-color: ${hover};
  --toolbar-button-active-color: ${textStrong};
  --toolbar-button-active-background-color: ${panel};
  --toolbar-button-active-border-color: ${border};
  --toolbar-button-progress-color: ${accentSofter};
  --toolbar-button-focus-progress-color: ${accentSoft};
  --toolbar-button-hover-progress-color: ${accentSoft};
  --toolbar-dropdown-open-progress-color: ${accentSoft};
  --toolbar-badge-background-color: ${payload.isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.12)'};
  --toolbar-badge-active-background-color: ${accentSoft};
  --tab-bar-background-color: ${panel};
  --tab-bar-active-background-color: ${background};
  --tab-bar-hover-background-color: ${hover};
  --app-menu-button-color: ${text};
  --app-menu-button-hover-color: ${textStrong};
  --app-menu-button-active-color: ${textStrong};
  --app-menu-pane-color: ${text};
  --app-menu-pane-secondary-color: ${textSecondary};
  --app-menu-pane-background-color: ${panel};
  --app-menu-divider-color: ${border};
  --app-menu-button-hover-background-color: ${hover};
  --app-menu-button-active-background-color: ${accentSoft};
  --button-background: ${accent};
  --button-hover-background: ${accent};
  --button-text-color: ${getColor(payload, 'buttonPrimaryFontColor', '#ffffff', '#ffffff')};
  --button-focus-border-color: ${accentSoft};
  --secondary-button-background: ${panel};
  --secondary-button-hover-background: ${hover};
  --secondary-button-border-color: ${border};
  --secondary-button-hover-border-color: ${contrastBorder};
  --secondary-button-text-color: ${text};
  --link-button-color: ${accent};
  --link-button-hover-color: ${accent};
  --link-button-selected-hover-color: ${accent};
  --scroll-bar-thumb-background-color: ${payload.isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'};
  --scroll-bar-thumb-background-color-active: ${payload.isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.45)'};
  --input-background-color: ${input};
  --text-field-background-color: ${input};
  --form-control-background-color: ${input};
  --color-renamed: ${accent};
  --color-deleted: ${deleteColor};
}

html,
body,
#desktop-app-container {
  background: ${background};
}

body.marknotepro-theme-adapted {
  color: ${text};
}

body.marknotepro-theme-adapted::before {
  content: "";
  position: fixed;
  z-index: 15;
  top: 0;
  bottom: 0;
  left: calc(var(--marknotepro-github-action-rail-width) - 1px);
  width: 1px;
  background: ${border};
  pointer-events: none;
}

body.marknotepro-theme-adapted #desktop-app-contents {
  width: calc(100% - var(--marknotepro-github-action-rail-width));
  margin-left: var(--marknotepro-github-action-rail-width);
}

body.marknotepro-theme-adapted #desktop-app-title-bar,
body.marknotepro-theme-adapted #desktop-app-title-bar.light-title-bar,
body.marknotepro-theme-adapted #desktop-app-toolbar {
  background: ${toolbar} !important;
  background-color: ${toolbar} !important;
  border-color: ${border} !important;
}

body.marknotepro-theme-adapted #desktop-app-title-bar {
  border-bottom: 1px solid ${border} !important;
}

body.marknotepro-theme-adapted #desktop-app-toolbar {
  border-bottom: 1px solid ${border} !important;
}

body.marknotepro-theme-adapted #desktop-app-toolbar .toolbar-button > button {
  background-color: transparent;
  border-right-color: ${border};
}

body.marknotepro-theme-adapted #desktop-app-toolbar .toolbar-dropdown.open > .toolbar-button > button,
body.marknotepro-theme-adapted #desktop-app-toolbar .toolbar-button > button:focus,
body.marknotepro-theme-adapted #desktop-app-toolbar .toolbar-button > button:not(:disabled):hover {
  background-color: ${hover};
}

body.marknotepro-theme-adapted .panel,
body.marknotepro-theme-adapted .toolbar {
  border-color: ${border};
}

body.marknotepro-theme-adapted ::selection {
  background: ${accentSofter};
}

body.marknotepro-theme-adapted #app-menu-bar {
  position: fixed;
  z-index: 16;
  left: 10px;
  top: 72px;
  bottom: auto;
  width: 35px;
  height: auto;
  display: flex;
  flex-direction: column;
  gap: 7px;
  align-items: center;
  overflow: visible;
  -webkit-app-region: no-drag;
}

body.marknotepro-theme-adapted #app-menu-bar .toolbar-dropdown,
body.marknotepro-theme-adapted #app-menu-bar .toolbar-button {
  width: 34px;
  height: 34px;
  min-width: 34px;
  min-height: 34px;
}

body.marknotepro-theme-adapted #app-menu-bar .toolbar-button > button {
  width: 34px;
  height: 34px;
  min-width: 34px;
  min-height: 34px;
  justify-content: center;
  padding: 0 !important;
  border: 0;
  border-radius: 6px;
  color: ${textSecondary};
  background: transparent;
}

body.marknotepro-theme-adapted #app-menu-bar .toolbar-button > button > :not(.marknotepro-menu-button-icon) {
  display: none !important;
}

body.marknotepro-theme-adapted #app-menu-bar .toolbar-button > button:hover,
body.marknotepro-theme-adapted #app-menu-bar .toolbar-button > button:focus,
body.marknotepro-theme-adapted #app-menu-bar .toolbar-dropdown.open > .toolbar-button > button {
  color: ${accent};
  background: ${hover};
}

body.marknotepro-theme-adapted #app-menu-bar .toolbar-button .menu-item {
  width: 34px;
  height: 34px;
  min-width: 34px;
  justify-content: center;
  padding: 0;
}

body.marknotepro-theme-adapted #app-menu-bar .toolbar-button .menu-item .label,
body.marknotepro-theme-adapted #app-menu-bar .toolbar-button .menu-item .access-key {
  display: none !important;
}

body.marknotepro-theme-adapted .marknotepro-menu-button-icon {
  width: 19px;
  height: 19px;
  display: inline-flex;
  color: currentColor;
  pointer-events: none;
}

body.marknotepro-theme-adapted .marknotepro-menu-button-icon svg {
  width: 19px;
  height: 19px;
  display: block;
  stroke: currentColor;
}

body.marknotepro-theme-adapted #app-menu-bar #foldout-container .foldout {
  pointer-events: none;
}

body.marknotepro-theme-adapted #app-menu-bar #foldout-container .foldout .menu-pane {
  pointer-events: auto;
  border: 1px solid ${border};
  border-radius: 8px;
  box-shadow: 0 12px 36px ${payload.isDark ? 'rgba(0, 0, 0, 0.36)' : 'rgba(27, 31, 36, 0.16)'};
}

body.marknotepro-theme-adapted #app-menu-bar #app-menu-foldout {
  position: fixed;
  left: calc(var(--marknotepro-github-action-rail-width) + 8px);
  top: 72px;
  max-height: calc(100vh - 92px);
}

body.marknotepro-theme-adapted #app-menu-bar .menu-pane {
  padding: 5px 0 !important;
  min-width: 238px;
}

body.marknotepro-theme-adapted #app-menu-bar .menu-pane .menu-item {
  height: 28px;
  min-height: 28px;
  font-size: 13px;
}

body.marknotepro-theme-adapted #app-menu-bar .menu-pane .menu-item .label {
  margin-left: 14px;
  margin-right: 14px;
}

body.marknotepro-theme-adapted #app-menu-bar .menu-pane .menu-item .accelerator,
body.marknotepro-theme-adapted #app-menu-bar .menu-pane .menu-item .access-key {
  display: none !important;
}

body.marknotepro-theme-adapted #app-menu-bar .menu-pane hr {
  margin: 4px 0;
  height: 0;
  border: 0;
  border-bottom: 1px solid ${border};
}

.marknotepro-desktop-actions {
  position: fixed;
  left: 10px;
  bottom: 10px;
  z-index: 16;
  display: flex;
  flex-direction: column;
  gap: 7px;
  pointer-events: auto;
}

.marknotepro-desktop-action {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  color: ${textSecondary};
  background: transparent;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.marknotepro-desktop-action:hover {
  color: ${accent};
  background: ${hover};
}

.marknotepro-desktop-action:disabled {
  cursor: wait;
  opacity: 0.55;
}

.marknotepro-desktop-action svg {
  width: 19px;
  height: 19px;
  stroke: currentColor;
}
`.trim()
}

const noteIcon = `
<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 19.5V5.75A2.75 2.75 0 0 1 6.75 3H20v16H6.75A2.75 2.75 0 0 0 4 21.75" />
  <path d="M8 7h8" />
  <path d="M8 11h6" />
</svg>
`

const workspaceIcon = `
<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M3 7.75A2.75 2.75 0 0 1 5.75 5H9l2 2h7.25A2.75 2.75 0 0 1 21 9.75v6.5A2.75 2.75 0 0 1 18.25 19H5.75A2.75 2.75 0 0 1 3 16.25z" />
  <path d="m9 13 2 2 4-4" />
</svg>
`

const menuButtonIcons = [
  `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.75 20.25 7.5v9L12 21.25 3.75 16.5v-9z"/><path d="M12 12.25v9"/><path d="m3.95 7.75 8.05 4.5 8.05-4.5"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 6.75A2.75 2.75 0 0 1 7.25 4h3l2 2h4.5a2.75 2.75 0 0 1 2.75 2.75v8A2.75 2.75 0 0 1 16.75 19H7.25a2.75 2.75 0 0 1-2.75-2.75z"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 19 3.75-1 9.5-9.5a2.12 2.12 0 0 0-3-3L5.75 15z"/><path d="m14 6 4 4"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.75 12s3.5-6 9.25-6 9.25 6 9.25 6-3.5 6-9.25 6-9.25-6-9.25-6z"/><circle cx="12" cy="12" r="2.5"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 7.5A2.5 2.5 0 0 1 7 5h10a2.5 2.5 0 0 1 2.5 2.5v9A2.5 2.5 0 0 1 17 19H7a2.5 2.5 0 0 1-2.5-2.5z"/><path d="M8 9h8"/><path d="M8 13h5"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="2.25"/><circle cx="18" cy="12" r="2.25"/><circle cx="6" cy="18" r="2.25"/><path d="M6 8.25v7.5"/><path d="M8.15 7 15.9 11"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2.5"/><path d="M4 9h16"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.75 9.25a2.4 2.4 0 0 1 4.65.8c0 1.85-2.4 2.2-2.4 3.95"/><path d="M12 17.2h.01"/></svg>`
]

const syncAppMenuButtons = (): void => {
  const menuBar = document.getElementById('app-menu-bar')
  if (!menuBar) return

  menuBar.querySelectorAll<HTMLButtonElement>('.toolbar-button > button').forEach((button, index) => {
    const label =
      button.querySelector<HTMLElement>('.label')?.innerText?.trim() ||
      button.getAttribute('aria-label') ||
      ''
    if (label) {
      button.title = label
      button.setAttribute('aria-label', label)
    }

    let icon = button.querySelector<HTMLSpanElement>('.marknotepro-menu-button-icon')
    if (!icon) {
      icon = document.createElement('span')
      icon.className = 'marknotepro-menu-button-icon'
      button.appendChild(icon)
    }
    const iconIndex = String(index)
    if (icon.dataset.iconIndex !== iconIndex) {
      icon.dataset.iconIndex = iconIndex
      icon.innerHTML = menuButtonIcons[index] ?? menuButtonIcons[menuButtonIcons.length - 1]
    }
  })
}

const ensureAppMenuButtonObserver = (): void => {
  if (document.documentElement.getAttribute(MENU_OBSERVER_ID)) {
    syncAppMenuButtons()
    return
  }

  document.documentElement.setAttribute(MENU_OBSERVER_ID, 'true')
  const observer = new MutationObserver(() => syncAppMenuButtons())
  observer.observe(document.body, { childList: true, subtree: true })
  syncAppMenuButtons()
}

const shouldSkipInternalI18n = (element: Element | null): boolean => {
  if (!element) return true
  return !!element.closest([
    'script',
    'style',
    'textarea',
    'input',
    'pre',
    'code',
    '[contenteditable="true"]',
    '.CodeMirror',
    '.diff',
    '.diff-line-code',
    '.blob-code',
    '.cm-editor'
  ].join(','))
}

const shouldSkipInternalAttributeI18n = (element: Element | null): boolean => {
  if (!element) return true
  return !!element.closest([
    'script',
    'style',
    'pre',
    'code',
    '[contenteditable="true"]',
    '.CodeMirror',
    '.diff',
    '.diff-line-code',
    '.blob-code',
    '.cm-editor'
  ].join(','))
}

const translateDynamicText = (value: string): string | null => {
  if (currentLanguage === 'en') return value
  const dictionary = internalText[currentLanguage]

  let match = value.match(/^(\d+)\s+changed files?$/)
  if (match) {
    return `${match[1]} ${dictionary[Number(match[1]) === 1 ? 'changed file' : 'changed files'] ?? 'changed files'}`
  }

  match = value.match(/^(\d+)\s+added lines?$/)
  if (match) {
    return `${match[1]} ${dictionary['added lines'] ?? 'added lines'}`
  }

  match = value.match(/^(\d+)\s+removed lines?$/)
  if (match) {
    return `${match[1]} ${dictionary['removed lines'] ?? 'removed lines'}`
  }

  match = value.match(
    /^(Included in commit|Excluded from commit|New files|Modified files|Deleted files) \((\d+)\)$/
  )
  if (match) {
    const translatedLabel = dictionary[match[1]] ?? match[1]
    return `${translatedLabel} (${match[2]})`
  }

  match = value.match(/^Last fetched (.+) ago$/)
  if (match) {
    const tail = match[1]
    switch (currentLanguage) {
      case 'zh-CN':
        return `上次获取于 ${tail} 前`
      case 'zh-TW':
        return `上次擷取於 ${tail} 前`
      case 'ja':
        return `最終フェッチ: ${tail}前`
      case 'ko':
        return `마지막 가져오기: ${tail} 전`
      case 'de':
        return `Zuletzt vor ${tail} abgerufen`
      case 'es':
        return `Última obtención hace ${tail}`
      case 'fr':
        return `Dernière récupération il y a ${tail}`
      case 'it':
        return `Ultimo fetch ${tail} fa`
      case 'pt':
        return `Última busca há ${tail}`
      case 'tr':
        return `Son getirme ${tail} önce`
      default:
        return null
    }
  }

  match = value.match(/^Commit to (.+)$/)
  if (match) {
    return `${dictionary['Commit to'] ?? 'Commit to'} ${match[1]}`
  }

  match = value.match(/^Clone (.+)$/)
  if (match) {
    switch (currentLanguage) {
      case 'zh-CN':
        return `克隆 ${match[1]}`
      case 'zh-TW':
        return `複製 ${match[1]}`
      case 'ja':
        return `${match[1]} をクローン`
      case 'ko':
        return `${match[1]} 클론`
      case 'de':
        return `${match[1]} klonen`
      case 'es':
        return `Clonar ${match[1]}`
      case 'fr':
        return `Cloner ${match[1]}`
      case 'it':
        return `Clona ${match[1]}`
      case 'pt':
        return `Clonar ${match[1]}`
      case 'tr':
        return `${match[1]} deposunu klonla`
      default:
        return null
    }
  }

  match = value.match(/^Rename (.+)$/)
  if (match) {
    switch (currentLanguage) {
      case 'zh-CN':
        return `重命名 ${match[1]}`
      case 'zh-TW':
        return `重新命名 ${match[1]}`
      case 'ja':
        return `${match[1]} の名前を変更`
      case 'ko':
        return `${match[1]} 이름 변경`
      case 'de':
        return `${match[1]} umbenennen`
      case 'es':
        return `Renombrar ${match[1]}`
      case 'fr':
        return `Renommer ${match[1]}`
      case 'it':
        return `Rinomina ${match[1]}`
      case 'pt':
        return `Renomear ${match[1]}`
      case 'tr':
        return `${match[1]} öğesini yeniden adlandır`
      default:
        return null
    }
  }

  match = value.match(/^Are you sure you want to discard all (\d+) changed files\?$/)
  if (match) {
    switch (currentLanguage) {
      case 'zh-CN':
        return `确定要丢弃全部 ${match[1]} 个已更改文件吗？`
      case 'zh-TW':
        return `確定要捨棄全部 ${match[1]} 個已變更檔案嗎？`
      case 'ja':
        return `${match[1]} 個の変更済みファイルをすべて破棄しますか？`
      case 'ko':
        return `변경된 파일 ${match[1]}개를 모두 삭제하시겠습니까?`
      case 'de':
        return `Möchten Sie wirklich alle ${match[1]} geänderten Dateien verwerfen?`
      case 'es':
        return `¿Seguro que quieres descartar los ${match[1]} archivos modificados?`
      case 'fr':
        return `Voulez-vous vraiment abandonner les ${match[1]} fichiers modifiés ?`
      case 'it':
        return `Vuoi davvero eliminare tutti i ${match[1]} file modificati?`
      case 'pt':
        return `Tem certeza de que deseja descartar todos os ${match[1]} arquivos alterados?`
      case 'tr':
        return `${match[1]} değiştirilmiş dosyanın tümünü silmek istediğinizden emin misiniz?`
      default:
        return null
    }
  }

  match = value.match(/^(Commit|Amend|Committing|Amending)\s+(.+)\s+to\s+(.+)$/)
  if (match) {
    const verb = dictionary[match[1]] ?? match[1]
    return `${verb} ${match[2]} ${dictionary['Commit to'] ?? 'Commit to'} ${match[3]}`
  }

  return null
}

const translateInternalValue = (value: string): string => {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return value
  if (currentLanguage === 'en') return value

  const dictionary = internalText[currentLanguage]
  const translated = dictionary[normalized] ?? translateDynamicText(normalized)
  if (!translated || translated === normalized) return value

  const leading = value.match(/^\s*/)?.[0] ?? ''
  const trailing = value.match(/\s*$/)?.[0] ?? ''
  return `${leading}${translated}${trailing}`
}

const translateTextNode = (node: Text): void => {
  const parent = node.parentElement
  if (shouldSkipInternalI18n(parent)) return

  let original = internalTextNodes.get(node)
  const current = node.nodeValue ?? ''
  if (typeof original === 'undefined') {
    original = current
    internalTextNodes.set(node, original)
  } else {
    const previousTranslated = translateInternalValue(original)
    if (current !== original && current !== previousTranslated) {
      original = current
      internalTextNodes.set(node, original)
    }
  }

  const translated = translateInternalValue(original)
  if (node.nodeValue !== translated) {
    node.nodeValue = translated
  }
}

const translateElementAttributes = (element: Element): void => {
  if (shouldSkipInternalAttributeI18n(element)) return

  for (const attribute of TRANSLATABLE_ATTRIBUTES) {
    const originalAttribute = `data-marknotepro-original-${attribute}`
    const current = element.getAttribute(attribute)
    if (!current) continue

    if (!element.hasAttribute(originalAttribute)) {
      element.setAttribute(originalAttribute, current)
    }

    let original = element.getAttribute(originalAttribute)
    if (!original) continue

    const previousTranslated = translateInternalValue(original)
    if (current !== original && current !== previousTranslated) {
      original = current
      element.setAttribute(originalAttribute, original)
    }

    const translated = translateInternalValue(original)
    if (current !== translated) {
      element.setAttribute(attribute, translated)
    }
  }
}

const translateInternalTree = (root: ParentNode): void => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text)
  }
  textNodes.forEach(translateTextNode)

  if (root instanceof Element) {
    translateElementAttributes(root)
  }
  root.querySelectorAll?.('*').forEach(translateElementAttributes)
}

const applyInternalI18n = (): void => {
  translateInternalTree(document.body)
}

const ensureInternalI18nObserver = (): void => {
  if (document.documentElement.getAttribute(INTERNAL_I18N_OBSERVER_ID)) {
    applyInternalI18n()
    return
  }

  document.documentElement.setAttribute(INTERNAL_I18N_OBSERVER_ID, 'true')
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData' && record.target instanceof Text) {
        translateTextNode(record.target)
      }
      for (const node of Array.from(record.addedNodes)) {
        if (node instanceof Text) {
          translateTextNode(node)
        } else if (node instanceof Element) {
          translateInternalTree(node)
        }
      }
    }
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  })
  applyInternalI18n()
}

const createActionButton = (
  key: keyof typeof localeText.en,
  title: string,
  icon: string,
  onClick: (button: HTMLButtonElement) => void | Promise<void>
): HTMLButtonElement => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'marknotepro-desktop-action'
  button.dataset.localeKey = key
  button.title = title
  button.setAttribute('aria-label', title)
  button.innerHTML = icon
  button.addEventListener('click', () => {
    void onClick(button)
  })
  return button
}

const updateActionButtonLocales = (): void => {
  const container = document.getElementById(ACTIONS_ID)
  if (!container) return

  container.querySelectorAll<HTMLButtonElement>('.marknotepro-desktop-action').forEach(button => {
    const key = button.dataset.localeKey as keyof typeof localeText.en | undefined
    if (!key) return

    const title = t(key)
    button.title = title
    button.setAttribute('aria-label', title)
  })
}

const ensureMarkNoteProActions = (): void => {
  if (document.getElementById(ACTIONS_ID)) {
    updateActionButtonLocales()
    return
  }

  const container = document.createElement('div')
  container.id = ACTIONS_ID
  container.className = 'marknotepro-desktop-actions'

  container.appendChild(createActionButton('setWorkspace', t('setWorkspace'), workspaceIcon, async button => {
    button.disabled = true
    try {
      await ipcRenderer.invoke('mt::github-desktop::choose-workspace-from-current-repository')
    } finally {
      button.disabled = false
    }
  }))

  container.appendChild(createActionButton('note', t('note'), noteIcon, () => {
    ipcRenderer.send('mt::github-desktop::switch-to-note')
  }))

  document.body.appendChild(container)
}

const applyMarkNoteProTheme = (payload: MarkNoteProThemePayload): void => {
  ensureMarkNoteProActions()
  ensureAppMenuButtonObserver()
  ensureInternalI18nObserver()
  document.body.classList.add('marknotepro-theme-adapted')
  document.body.classList.toggle('marknotepro-theme-dark', payload.isDark)
  document.body.classList.toggle('marknotepro-theme-light', !payload.isDark)
  document.body.classList.toggle('theme-dark', payload.isDark)
  document.body.classList.toggle('theme-light', !payload.isDark)
  document.documentElement.style.colorScheme = payload.isDark ? 'dark' : 'light'
  document.documentElement.dataset.marknoteproTheme = payload.theme

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  style.textContent = getAdapterCss(payload)
}

const applyMarkNoteProLocale = (payload: MarkNoteProLocalePayload): void => {
  currentLanguage = normalizeLanguage(payload.language)
  document.documentElement.dataset.marknoteproLanguage = currentLanguage
  updateActionButtonLocales()
  syncAppMenuButtons()
  applyInternalI18n()
  window.setTimeout(applyInternalI18n, 100)
}

export const installMarkNoteProThemeAdapter = (): void => {
  ipcRenderer.on('marknotepro-theme-updated', (_event, payload: MarkNoteProThemePayload) => {
    applyMarkNoteProTheme(payload)
    window.setTimeout(() => applyMarkNoteProTheme(payload), 100)
    window.setTimeout(() => applyMarkNoteProTheme(payload), 500)
  })

  ipcRenderer.on('marknotepro-locale-updated', (_event, payload: MarkNoteProLocalePayload) => {
    applyMarkNoteProLocale(payload)
  })
}
