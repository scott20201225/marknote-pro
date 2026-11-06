#import <Cocoa/Cocoa.h>
#import <Foundation/Foundation.h>
#import <QuartzCore/QuartzCore.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>

@class PinPanel;
@class CapturePanel;
@class ClipboardContentView;
@class PinEditToolbarPanel;

@interface ClipboardPanel : NSPanel
@property (nonatomic, strong) ClipboardContentView *contentV;
@end

static ClipboardPanel *gClipboardPanel = nil;

static void sendEvent(NSDictionary *dict);
static void createPin(NSDictionary *dict);
static void showCaptureOverlay(NSScreen *screen, NSImage *screenshot);
static void startNativeCapture(NSString *passedImagePath);
static void toggleClipboardPanel(void);
static NSImage *getSvgIcon(NSString *iconId);

static void sendEvent(NSDictionary *dict) {
    if (!dict) return;
    NSError *error = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:dict options:0 error:&error];
    if (data && !error) {
        NSString *jsonStr = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
        printf("%s\n", [jsonStr UTF8String]);
        fflush(stdout);
    }
}

#pragma mark - Multi-language (i18n) Support (8 Languages)

@interface I18N : NSObject
+ (NSString *)currentLanguage;
+ (void)setCurrentLanguage:(NSString *)lang;
+ (NSString *)tr:(NSString *)key;
+ (NSString *)formatMinutesAgo:(NSInteger)n;
+ (NSString *)formatHoursAgo:(NSInteger)n;
+ (NSString *)formatDaysAgo:(NSInteger)n;
@end

@implementation I18N
static NSString *gCurrentLang = @"zh-CN";
static NSDictionary<NSString *, NSDictionary<NSString *, NSString *> *> *gI18nDict = nil;

+ (void)initialize {
    if (self == [I18N class]) {
        gI18nDict = @{
            @"zh-CN": @{
                @"toolbarDrag": @"拖拽移动工具栏",
                @"rect": @"矩形 (1 / R)",
                @"circle": @"圆形 (2 / C)",
                @"line": @"直线 (3 / L)",
                @"arrow": @"箭头 (4 / A)",
                @"tag": @"气泡标签 (5 / G)",
                @"text": @"文本工具 (6 / T)",
                @"pencil": @"画笔涂鸦 (7 / P)",
                @"step": @"纯序号 (8 / S)",
                @"stepNote": @"序号说明 (9)",
                @"mosaic": @"马赛克 (M)",
                @"highlight": @"矩形高亮 (H)",
                @"marker": @"荧光笔",
                @"watermark": @"添加水印 (W)",
                @"pin": @"钉在桌面 (贴图) (P)",
                @"undo": @"撤销 (⌘Z)",
                @"save": @"保存图片... (⌘S)",
                @"close": @"取消截屏 (Esc)",
                @"confirm": @"完成并复制 (Enter / 双击)",
                @"textNormal": @"无底色文字",
                @"textFilled": @"填充底色",
                @"textBordered": @"边框文字",
                @"strokeWidth": @"粗细",
                @"watermarkCustomPlaceholder": @"自定义水印...",
                @"stepNotePlaceholder": @"输入步骤说明...",
                @"textPlaceholder": @"输入文字...",
                @"tagPlaceholder": @"输入标签内容...",
                @"wmInternalOnly": @"内部资料 · 严禁外传",
                @"wmConfidential": @"机密文件",
                @"wmForReview": @"仅供审核",
                @"wmBrand": @"MarkNotePro",
                @"searchPlaceholder": @"搜索历史记录... (↑↓ 选择, ↵ 复制, P 钉在桌面, Esc 退出)",
                @"all": @"全部",
                @"image": @"图片",
                @"textType": @"文本",
                @"empty": @"无相关剪贴板历史",
                @"chars": @"字符",
                @"pinDesktop": @"钉在桌面 (P)",
                @"copied": @"已复制",
                @"enable": @"启用",
                @"enableWatermark": @"启用水印",
                @"clearHistoryConfirmTitle": @"清空全部剪贴板历史",
                @"clearHistoryConfirmDesc": @"确定要清空全部剪贴板记录吗？这将删除所有的历史记录以及本地截图文件，此操作不可恢复。",
                @"copyToClipboard": @"复制到剪贴板",
                @"delete": @"删除",
                @"copy": @"复制",
                @"pinBtn": @"贴图",
                @"resolution": @"分辨率: %ld × %ld 像素",
                @"resolutionFormat": @"分辨率: %@ × %@ 像素",
                @"textLengthFormat": @"文本长度: %lu 字符",
                @"screenshotFallback": @"截图",
                @"previewPlaceholder": @"选择左侧记录以预览内容",
                @"navTip": @"↑ ↓ 导航    ↵ 复制并退出    P 钉在桌面    Esc 退出",
                @"clearAll": @"清空全部历史",
                @"confirmClear": @"确定要清空所有剪贴板历史记录吗？",
                @"cancel": @"取消",
                @"justNow": @"刚刚",
                @"zoomReset": @"1:1",
                @"editImage": @"标注编辑 (E)",
                @"exitEdit": @"退出编辑",
                @"copyImage": @"复制图片 (⌘C)",
                @"saveImage": @"保存图片 (⌘S)",
                @"closePin": @"关闭贴图 (Esc)"
            },
            @"zh-TW": @{
                @"toolbarDrag": @"拖曳移動工具列",
                @"rect": @"矩形 (1 / R)",
                @"circle": @"圓形 (2 / C)",
                @"line": @"直線 (3 / L)",
                @"arrow": @"箭頭 (4 / A)",
                @"tag": @"氣泡標籤 (5 / G)",
                @"text": @"文字工具 (6 / T)",
                @"pencil": @"畫筆塗鴉 (7 / P)",
                @"step": @"序號標記 (8 / S)",
                @"stepNote": @"序號說明 (9)",
                @"mosaic": @"馬賽克 (M)",
                @"highlight": @"矩形高亮 (H)",
                @"marker": @"螢光筆",
                @"watermark": @"添加浮水印 (W)",
                @"pin": @"釘在桌面 (貼圖) (P)",
                @"undo": @"復原 (⌘Z)",
                @"save": @"儲存圖片... (⌘S)",
                @"close": @"取消截圖 (Esc)",
                @"confirm": @"完成並複製 (Enter / 雙擊)",
                @"textNormal": @"無底色文字",
                @"textFilled": @"填充底色",
                @"textBordered": @"邊框文字",
                @"strokeWidth": @"粗細",
                @"watermarkCustomPlaceholder": @"自訂浮水印...",
                @"stepNotePlaceholder": @"輸入步驟說明...",
                @"textPlaceholder": @"輸入文字...",
                @"tagPlaceholder": @"輸入標籤內容...",
                @"wmInternalOnly": @"內部資料 · 嚴禁外傳",
                @"wmConfidential": @"機密文件",
                @"wmForReview": @"僅供審核",
                @"wmBrand": @"MarkNotePro",
                @"searchPlaceholder": @"搜尋歷史記錄... (↑↓ 選擇, ↵ 複製, P 釘在桌面, Esc 退出)",
                @"all": @"全部",
                @"image": @"圖片",
                @"textType": @"文字",
                @"empty": @"無相關剪貼簿歷史",
                @"chars": @"字元",
                @"pinDesktop": @"釘在桌面 (P)",
                @"copied": @"已複製",
                @"enable": @"啟用",
                @"enableWatermark": @"啟用浮水印",
                @"clearHistoryConfirmTitle": @"清空全部剪貼簿歷史",
                @"clearHistoryConfirmDesc": @"確定要清空全部剪貼簿記錄嗎？這將刪除所有的歷史記錄以及本機截圖檔案，此操作不可復原。",
                @"copyToClipboard": @"複製到剪貼簿",
                @"delete": @"刪除",
                @"copy": @"複製",
                @"pinBtn": @"貼圖",
                @"resolution": @"解析度: %ld × %ld 像素",
                @"resolutionFormat": @"解析度: %@ × %@ 像素",
                @"textLengthFormat": @"文字長度: %lu 字元",
                @"screenshotFallback": @"截圖",
                @"previewPlaceholder": @"選擇左側記錄以預覽內容",
                @"navTip": @"↑ ↓ 導航    ↵ 複製並退出    P 釘在桌面    Esc 退出",
                @"clearAll": @"清空全部歷史",
                @"confirmClear": @"確定要清空所有剪貼簿歷史記錄嗎？",
                @"cancel": @"取消",
                @"justNow": @"剛剛",
                @"zoomReset": @"1:1",
                @"editImage": @"標註編輯 (E)",
                @"exitEdit": @"退出編輯",
                @"copyImage": @"複製圖片 (⌘C)",
                @"saveImage": @"儲存圖片 (⌘S)",
                @"closePin": @"關閉貼圖 (Esc)"
            },
            @"en": @{
                @"toolbarDrag": @"Drag Toolbar",
                @"rect": @"Rectangle (1 / R)",
                @"circle": @"Circle (2 / C)",
                @"line": @"Line (3 / L)",
                @"arrow": @"Arrow (4 / A)",
                @"tag": @"Tag (5 / G)",
                @"text": @"Text Tool (6 / T)",
                @"pencil": @"Pen / Doodle (7 / P)",
                @"step": @"Step Badge (8 / S)",
                @"stepNote": @"Step Note (9)",
                @"mosaic": @"Mosaic (M)",
                @"highlight": @"Highlight (H)",
                @"marker": @"Highlighter",
                @"watermark": @"Watermark (W)",
                @"pin": @"Pin to Desktop (P)",
                @"undo": @"Undo (⌘Z)",
                @"save": @"Save Image... (⌘S)",
                @"close": @"Cancel (Esc)",
                @"confirm": @"Done & Copy (Enter / Double Click)",
                @"textNormal": @"Normal Text",
                @"textFilled": @"Filled Background",
                @"textBordered": @"Bordered Text",
                @"strokeWidth": @"Stroke Width",
                @"watermarkCustomPlaceholder": @"Custom watermark...",
                @"stepNotePlaceholder": @"Enter step note...",
                @"textPlaceholder": @"Enter text...",
                @"tagPlaceholder": @"Enter tag...",
                @"wmInternalOnly": @"INTERNAL ONLY",
                @"wmConfidential": @"CONFIDENTIAL",
                @"wmForReview": @"FOR REVIEW ONLY",
                @"wmBrand": @"MarkNotePro",
                @"searchPlaceholder": @"Search history... (↑↓ Select, ↵ Copy, P Pin, Esc Close)",
                @"all": @"All",
                @"image": @"Images",
                @"textType": @"Text",
                @"empty": @"No clipboard history found",
                @"chars": @"chars",
                @"pinDesktop": @"Pin to Desktop (P)",
                @"copied": @"Copied",
                @"enable": @"Enable",
                @"enableWatermark": @"Enable Watermark",
                @"clearHistoryConfirmTitle": @"Clear All Clipboard History",
                @"clearHistoryConfirmDesc": @"Are you sure you want to clear all clipboard history? This will delete all records and local screenshot files. This action cannot be undone.",
                @"copyToClipboard": @"Copy to Clipboard",
                @"delete": @"Delete",
                @"copy": @"Copy",
                @"pinBtn": @"Pin",
                @"resolution": @"Resolution: %ld × %ld px",
                @"resolutionFormat": @"Resolution: %@ × %@ px",
                @"textLengthFormat": @"Text Length: %lu characters",
                @"screenshotFallback": @"Screenshot",
                @"previewPlaceholder": @"Select an item on the left to preview",
                @"navTip": @"↑ ↓ Navigate    ↵ Copy & Exit    P Pin    Esc Exit",
                @"clearAll": @"Clear All History",
                @"confirmClear": @"Are you sure you want to clear all clipboard history?",
                @"cancel": @"Cancel",
                @"justNow": @"Just now",
                @"zoomReset": @"1:1",
                @"editImage": @"Annotate (E)",
                @"exitEdit": @"Exit Edit",
                @"copyImage": @"Copy Image (⌘C)",
                @"saveImage": @"Save Image (⌘S)",
                @"closePin": @"Close Pin (Esc)"
            },
            @"ja": @{
                @"toolbarDrag": @"ツールバーをドラッグ",
                @"rect": @"矩形 (1 / R)",
                @"circle": @"円形 (2 / C)",
                @"line": @"直線 (3 / L)",
                @"arrow": @"矢印 (4 / A)",
                @"tag": @"吹き出し (5 / G)",
                @"text": @"テキスト (6 / T)",
                @"pencil": @"ペン / 落書き (7 / P)",
                @"step": @"番号バッジ (8 / S)",
                @"stepNote": @"番号付き説明 (9)",
                @"mosaic": @"モザイク (M)",
                @"highlight": @"ハイライト (H)",
                @"marker": @"蛍光ペン",
                @"watermark": @"透かしを追加 (W)",
                @"pin": @"ピン留め (P)",
                @"undo": @"元に戻す (⌘Z)",
                @"save": @"画像を保存... (⌘S)",
                @"close": @"キャンセル (Esc)",
                @"confirm": @"完了してコピー (Enter)",
                @"textNormal": @"標準テキスト",
                @"textFilled": @"背景塗りつぶし",
                @"textBordered": @"枠線付きテキスト",
                @"strokeWidth": @"太さ",
                @"watermarkCustomPlaceholder": @"カスタム透かし...",
                @"stepNotePlaceholder": @"ステップ説明を入力...",
                @"textPlaceholder": @"テキストを入力...",
                @"tagPlaceholder": @"タグを入力...",
                @"wmInternalOnly": @"社外秘",
                @"wmConfidential": @"機密",
                @"wmForReview": @"確認用",
                @"wmBrand": @"MarkNotePro",
                @"searchPlaceholder": @"履歴を検索... (↑↓ 選択, ↵ コピー, P ピン留め, Esc 閉じる)",
                @"all": @"すべて",
                @"image": @"画像",
                @"textType": @"テキスト",
                @"empty": @"クリップボード履歴がありません",
                @"chars": @"文字",
                @"pinDesktop": @"デスクトップにピン留め (P)",
                @"copied": @"コピーしました",
                @"enable": @"有効",
                @"enableWatermark": @"透かしを有効にする",
                @"clearHistoryConfirmTitle": @"すべてのクリップボード履歴を消去",
                @"clearHistoryConfirmDesc": @"すべてのクリップボード履歴を消去してもよろしいですか？すべての履歴とローカルのスクリーンショットファイルが削除されます。この操作は取り消せません。",
                @"copyToClipboard": @"クリップボードにコピー",
                @"delete": @"削除",
                @"copy": @"コピー",
                @"pinBtn": @"ピン留め",
                @"resolution": @"解像度: %ld × %ld ピクセル",
                @"resolutionFormat": @"解像度: %@ × %@ ピクセル",
                @"textLengthFormat": @"文字数: %lu 文字",
                @"screenshotFallback": @"スクリーンショット",
                @"previewPlaceholder": @"左の項目を選択してプレビュー",
                @"navTip": @"↑ ↓ 移動    ↵ コピーして終了    P ピン留め    Esc 終了",
                @"clearAll": @"すべての履歴を消去",
                @"confirmClear": @"すべてのクリップボード履歴を消去しますか？",
                @"cancel": @"キャンセル",
                @"justNow": @"たった今",
                @"zoomReset": @"1:1",
                @"editImage": @"注釈編集 (E)",
                @"exitEdit": @"編集を終了",
                @"copyImage": @"画像をコピー (⌘C)",
                @"saveImage": @"画像を保存 (⌘S)",
                @"closePin": @"ピンを閉じる (Esc)"
            },
            @"ko": @{
                @"toolbarDrag": @"툴바 이동",
                @"rect": @"직사각형 (1 / R)",
                @"circle": @"원형 (2 / C)",
                @"line": @"직선 (3 / L)",
                @"arrow": @"화살표 (4 / A)",
                @"tag": @"말풍선 (5 / G)",
                @"text": @"텍스트 (6 / T)",
                @"pencil": @"펜 / 그리기 (7 / P)",
                @"step": @"순서 번호 (8 / S)",
                @"stepNote": @"번호 설명 (9)",
                @"mosaic": @"모자이크 (M)",
                @"highlight": @"강조 상자 (H)",
                @"marker": @"형광펜",
                @"watermark": @"워터마크 (W)",
                @"pin": @"데스크톱 핀 (P)",
                @"undo": @"실행 취소 (⌘Z)",
                @"save": @"이미지 저장... (⌘S)",
                @"close": @"취소 (Esc)",
                @"confirm": @"완료 및 복사 (Enter)",
                @"textNormal": @"일반 텍스트",
                @"textFilled": @"배경 채우기",
                @"textBordered": @"테두리 텍스트",
                @"strokeWidth": @"굵기",
                @"watermarkCustomPlaceholder": @"사용자 지정 워터마크...",
                @"stepNotePlaceholder": @"단계 설명 입력...",
                @"textPlaceholder": @"텍스트 입력...",
                @"tagPlaceholder": @"태그 입력...",
                @"wmInternalOnly": @"대외비 · 유출금지",
                @"wmConfidential": @"기밀문서",
                @"wmForReview": @"검토용",
                @"wmBrand": @"MarkNotePro",
                @"searchPlaceholder": @"기록 검색... (↑↓ 탐색, ↵ 복사, P 데스크톱 핀, Esc 닫기)",
                @"all": @"전체",
                @"image": @"이미지",
                @"textType": @"텍스트",
                @"empty": @"클립보드 기록이 없습니다",
                @"chars": @"글자",
                @"pinDesktop": @"데스크톱 핀 (P)",
                @"copied": @"복사됨",
                @"enable": @"활성화",
                @"enableWatermark": @"워터마크 활성화",
                @"clearHistoryConfirmTitle": @"클립보드 전체 기록 삭제",
                @"clearHistoryConfirmDesc": @"모든 클립보드 기록을 삭제하시겠습니까? 모든 기록과 로컬 스크린샷 파일이 삭제되며 이 작업은 취소할 수 없습니다.",
                @"copyToClipboard": @"클립보드에 복사",
                @"delete": @"삭제",
                @"copy": @"복사",
                @"pinBtn": @"핀 고정",
                @"resolution": @"해상도: %ld × %ld px",
                @"resolutionFormat": @"해상도: %@ × %@ px",
                @"textLengthFormat": @"텍스트 길이: %lu 자",
                @"screenshotFallback": @"스크린샷",
                @"previewPlaceholder": @"왼쪽 항목을 선택하여 미리보기",
                @"navTip": @"↑ ↓ 탐색    ↵ 복사 후 종료    P 데스크톱 핀    Esc 종료",
                @"clearAll": @"모든 기록 삭제",
                @"confirmClear": @"모든 클립보드 기록을 삭제하시겠습니까?",
                @"cancel": @"취소",
                @"justNow": @"방금",
                @"zoomReset": @"1:1",
                @"editImage": @"주석 편집 (E)",
                @"exitEdit": @"편집 종료",
                @"copyImage": @"이미지 복사 (⌘C)",
                @"saveImage": @"이미지 저장 (⌘S)",
                @"closePin": @"핀 닫기 (Esc)"
            },
            @"de": @{
                @"toolbarDrag": @"Symbolleiste verschieben",
                @"rect": @"Rechteck (1 / R)",
                @"circle": @"Kreis (2 / C)",
                @"line": @"Linie (3 / L)",
                @"arrow": @"Pfeil (4 / A)",
                @"tag": @"Hinweis (5 / G)",
                @"text": @"Textwerkzeug (6 / T)",
                @"pencil": @"Stift (7 / P)",
                @"step": @"Schritt-Nummer (8 / S)",
                @"stepNote": @"Schritt-Notiz (9)",
                @"mosaic": @"Mosaik (M)",
                @"highlight": @"Hervorhebung (H)",
                @"marker": @"Textmarker",
                @"watermark": @"Wasserzeichen (W)",
                @"pin": @"An Desktop anheften (P)",
                @"undo": @"Rückgängig (⌘Z)",
                @"save": @"Bild speichern... (⌘S)",
                @"close": @"Abbrechen (Esc)",
                @"confirm": @"Fertig & Kopieren (Enter)",
                @"textNormal": @"Standardtext",
                @"textFilled": @"Ausgefüllter Hintergrund",
                @"textBordered": @"Umrandeter Text",
                @"strokeWidth": @"Strichstärke",
                @"watermarkCustomPlaceholder": @"Benutzerdefiniertes Wasserzeichen...",
                @"stepNotePlaceholder": @"Schritt-Beschreibung eingeben...",
                @"textPlaceholder": @"Text eingeben...",
                @"tagPlaceholder": @"Tag eingeben...",
                @"wmInternalOnly": @"NUR INTERN",
                @"wmConfidential": @"VERTRAULICH",
                @"wmForReview": @"ZUR PRÜFUNG",
                @"wmBrand": @"MarkNotePro",
                @"searchPlaceholder": @"Verlauf durchsuchen... (↑↓ Auswählen, ↵ Kopieren, P Anheften, Esc Schließen)",
                @"all": @"Alle",
                @"image": @"Bilder",
                @"textType": @"Text",
                @"empty": @"Kein Zwischenablage-Verlauf",
                @"chars": @"Zeichen",
                @"pinDesktop": @"An Desktop anheften (P)",
                @"copied": @"Kopiert",
                @"enable": @"Aktivieren",
                @"enableWatermark": @"Wasserzeichen aktivieren",
                @"clearHistoryConfirmTitle": @"Gesamten Zwischenablage-Verlauf löschen",
                @"clearHistoryConfirmDesc": @"Möchten Sie wirklich den gesamten Verlauf löschen? Dadurch werden alle Einträge und lokalen Screenshot-Dateien dauerhaft gelöscht.",
                @"copyToClipboard": @"In Zwischenablage kopieren",
                @"delete": @"Löschen",
                @"copy": @"Kopieren",
                @"pinBtn": @"Anheften",
                @"resolution": @"Auflösung: %ld × %ld px",
                @"resolutionFormat": @"Auflösung: %@ × %@ px",
                @"textLengthFormat": @"Textlänge: %lu Zeichen",
                @"screenshotFallback": @"Screenshot",
                @"previewPlaceholder": @"Eintrag links auswählen für Vorschau",
                @"navTip": @"↑ ↓ Navigieren    ↵ Kopieren & Beenden    P Anheften    Esc Beenden",
                @"clearAll": @"Gesamten Verlauf löschen",
                @"confirmClear": @"Möchten Sie wirklich den gesamten Zwischenablage-Verlauf löschen?",
                @"cancel": @"Abbrechen",
                @"justNow": @"Gerade eben",
                @"zoomReset": @"1:1",
                @"editImage": @"Bearbeiten (E)",
                @"exitEdit": @"Bearbeitung beenden",
                @"copyImage": @"Bild kopieren (⌘C)",
                @"saveImage": @"Bild speichern (⌘S)",
                @"closePin": @"Pin schließen (Esc)"
            },
            @"fr": @{
                @"toolbarDrag": @"Déplacer la barre d'outils",
                @"rect": @"Rectangle (1 / R)",
                @"circle": @"Cercle (2 / C)",
                @"line": @"Ligne (3 / L)",
                @"arrow": @"Flèche (4 / A)",
                @"tag": @"Étiquette (5 / G)",
                @"text": @"Outil Texte (6 / T)",
                @"pencil": @"Stylo (7 / P)",
                @"step": @"Numéro d'étape (8 / S)",
                @"stepNote": @"Note d'étape (9)",
                @"mosaic": @"Mosaïque (M)",
                @"highlight": @"Surbrillance (H)",
                @"marker": @"Surligneur",
                @"watermark": @"Filigrane (W)",
                @"pin": @"Épingler au bureau (P)",
                @"undo": @"Annuler (⌘Z)",
                @"save": @"Enregistrer... (⌘S)",
                @"close": @"Annuler (Esc)",
                @"confirm": @"Terminer et copier (Entrée)",
                @"textNormal": @"Texte normal",
                @"textFilled": @"Arrière-plan rempli",
                @"textBordered": @"Texte avec bordure",
                @"strokeWidth": @"Épaisseur",
                @"watermarkCustomPlaceholder": @"Filigrane personnalisé...",
                @"stepNotePlaceholder": @"Entrez la description de l'étape...",
                @"textPlaceholder": @"Entrez du texte...",
                @"tagPlaceholder": @"Entrez l'étiquette...",
                @"wmInternalOnly": @"INTERNE UNIQUEMENT",
                @"wmConfidential": @"CONFIDENTIEL",
                @"wmForReview": @"POUR RÉVISION",
                @"wmBrand": @"MarkNotePro",
                @"searchPlaceholder": @"Rechercher... (↑↓ Sélectionner, ↵ Copier, P Épingler, Esc Fermer)",
                @"all": @"Tout",
                @"image": @"Images",
                @"textType": @"Texte",
                @"empty": @"Aucun historique",
                @"chars": @"caractères",
                @"pinDesktop": @"Épingler au bureau (P)",
                @"copied": @"Copié",
                @"enable": @"Activer",
                @"enableWatermark": @"Activer le filigrane",
                @"clearHistoryConfirmTitle": @"Effacer tout l'historique",
                @"clearHistoryConfirmDesc": @"Voulez-vous vraiment effacer tout l'historique du presse-papiers ? Tous les enregistrements et captures d'écran locales seront supprimés. Cette action est irréversible.",
                @"copyToClipboard": @"Copier dans le presse-papiers",
                @"delete": @"Supprimer",
                @"copy": @"Copier",
                @"pinBtn": @"Épingler",
                @"resolution": @"Résolution : %ld × %ld px",
                @"resolutionFormat": @"Résolution : %@ × %@ px",
                @"textLengthFormat": @"Longueur du texte : %lu caractères",
                @"screenshotFallback": @"Capture d'écran",
                @"previewPlaceholder": @"Sélectionnez un élément à gauche",
                @"navTip": @"↑ ↓ Naviguer    ↵ Copier & Quitter    P Épingler    Esc Quitter",
                @"clearAll": @"Effacer tout l'historique",
                @"confirmClear": @"Voulez-vous vraiment effacer tout l'historique ?",
                @"cancel": @"Annuler",
                @"justNow": @"À l'instant",
                @"zoomReset": @"1:1",
                @"editImage": @"Annoter (E)",
                @"exitEdit": @"Quitter l'édition",
                @"copyImage": @"Copier l'image (⌘C)",
                @"saveImage": @"Enregistrer (⌘S)",
                @"closePin": @"Fermer l'épingle (Esc)"
            },
            @"es": @{
                @"toolbarDrag": @"Arrastrar barra",
                @"rect": @"Rectángulo (1 / R)",
                @"circle": @"Círculo (2 / C)",
                @"line": @"Línea (3 / L)",
                @"arrow": @"Flecha (4 / A)",
                @"tag": @"Etiqueta (5 / G)",
                @"text": @"Herramienta de texto (6 / T)",
                @"pencil": @"Lápiz (7 / P)",
                @"step": @"Insignia de paso (8 / S)",
                @"stepNote": @"Nota de paso (9)",
                @"mosaic": @"Mosaico (M)",
                @"highlight": @"Resaltado (H)",
                @"marker": @"Resaltador",
                @"watermark": @"Marca de agua (W)",
                @"pin": @"Fijar en escritorio (P)",
                @"undo": @"Deshacer (⌘Z)",
                @"save": @"Guardar imagen... (⌘S)",
                @"close": @"Cancelar (Esc)",
                @"confirm": @"Listo y copiar (Enter)",
                @"textNormal": @"Texto normal",
                @"textFilled": @"Fondo relleno",
                @"textBordered": @"Texto con borde",
                @"strokeWidth": @"Grosor",
                @"watermarkCustomPlaceholder": @"Marca de agua personalizada...",
                @"stepNotePlaceholder": @"Ingrese nota del paso...",
                @"textPlaceholder": @"Ingrese texto...",
                @"tagPlaceholder": @"Ingrese etiqueta...",
                @"wmInternalOnly": @"SOLO USO INTERNO",
                @"wmConfidential": @"CONFIDENCIAL",
                @"wmForReview": @"SOLO REVISIÓN",
                @"wmBrand": @"MarkNotePro",
                @"searchPlaceholder": @"Buscar historial... (↑↓ Seleccionar, ↵ Copiar, P Fijar, Esc Cerrar)",
                @"all": @"Todo",
                @"image": @"Imágenes",
                @"textType": @"Texto",
                @"empty": @"Sin historial de portapapeles",
                @"chars": @"caracteres",
                @"pinDesktop": @"Fijar en escritorio (P)",
                @"copied": @"Copiado",
                @"enable": @"Activar",
                @"enableWatermark": @"Activar marca de agua",
                @"clearHistoryConfirmTitle": @"Borrar todo el historial",
                @"clearHistoryConfirmDesc": @"¿Está seguro de que desea borrar todo el historial del portapapeles? Se eliminarán todos los registros y archivos locales de capturas de pantalla. Esta acción no se puede deshacer.",
                @"copyToClipboard": @"Copiar al portapapeles",
                @"delete": @"Eliminar",
                @"copy": @"Copiar",
                @"pinBtn": @"Fijar",
                @"resolution": @"Resolución: %ld × %ld px",
                @"resolutionFormat": @"Resolución: %@ × %@ px",
                @"textLengthFormat": @"Longitud del texto: %lu caracteres",
                @"screenshotFallback": @"Captura de pantalla",
                @"previewPlaceholder": @"Seleccione un elemento para vista previa",
                @"navTip": @"↑ ↓ Navegar    ↵ Copiar y salir    P Fijar    Esc Salir",
                @"clearAll": @"Borrar todo el historial",
                @"confirmClear": @"¿Está seguro de que desea borrar todo el historial?",
                @"cancel": @"Cancelar",
                @"justNow": @"Ahora mismo",
                @"zoomReset": @"1:1",
                @"editImage": @"Anotar (E)",
                @"exitEdit": @"Salir de edición",
                @"copyImage": @"Copiar imagen (⌘C)",
                @"saveImage": @"Guardar imagen (⌘S)",
                @"closePin": @"Cerrar fijado (Esc)"
            }
        };
    }
}

+ (NSString *)currentLanguage { return gCurrentLang; }

+ (void)setCurrentLanguage:(NSString *)lang {
    if (lang && lang.length > 0) {
        if (gI18nDict[lang]) {
            gCurrentLang = [lang copy];
        } else if ([lang hasPrefix:@"zh-"]) {
            gCurrentLang = ([lang containsString:@"TW"] || [lang containsString:@"HK"]) ? @"zh-TW" : @"zh-CN";
        } else if ([lang hasPrefix:@"en"]) {
            gCurrentLang = @"en";
        } else if ([lang hasPrefix:@"ja"]) {
            gCurrentLang = @"ja";
        } else if ([lang hasPrefix:@"ko"]) {
            gCurrentLang = @"ko";
        } else if ([lang hasPrefix:@"de"]) {
            gCurrentLang = @"de";
        } else if ([lang hasPrefix:@"fr"]) {
            gCurrentLang = @"fr";
        } else if ([lang hasPrefix:@"es"]) {
            gCurrentLang = @"es";
        } else {
            gCurrentLang = @"zh-CN";
        }
    }
}

+ (NSString *)tr:(NSString *)key {
    if (!key) return @"";
    NSDictionary *bundle = gI18nDict[gCurrentLang] ?: gI18nDict[@"zh-CN"];
    NSString *val = bundle[key];
    if (!val) {
        val = gI18nDict[@"zh-CN"][key] ?: gI18nDict[@"en"][key] ?: key;
    }
    return val;
}

+ (NSString *)formatMinutesAgo:(NSInteger)n {
    if ([gCurrentLang isEqualToString:@"en"]) return [NSString stringWithFormat:@"%ldm ago", (long)n];
    if ([gCurrentLang isEqualToString:@"ja"]) return [NSString stringWithFormat:@"%ld分前", (long)n];
    if ([gCurrentLang isEqualToString:@"ko"]) return [NSString stringWithFormat:@"%ld분 전", (long)n];
    if ([gCurrentLang isEqualToString:@"de"]) return [NSString stringWithFormat:@"vor %ldm", (long)n];
    if ([gCurrentLang isEqualToString:@"fr"]) return [NSString stringWithFormat:@"il y a %ldm", (long)n];
    if ([gCurrentLang isEqualToString:@"es"]) return [NSString stringWithFormat:@"hace %ldm", (long)n];
    return [NSString stringWithFormat:@"%ld分钟前", (long)n];
}

+ (NSString *)formatHoursAgo:(NSInteger)n {
    if ([gCurrentLang isEqualToString:@"en"]) return [NSString stringWithFormat:@"%ldh ago", (long)n];
    if ([gCurrentLang isEqualToString:@"ja"]) return [NSString stringWithFormat:@"%ld時間前", (long)n];
    if ([gCurrentLang isEqualToString:@"ko"]) return [NSString stringWithFormat:@"%ld시간 전", (long)n];
    if ([gCurrentLang isEqualToString:@"de"]) return [NSString stringWithFormat:@"vor %ldh", (long)n];
    if ([gCurrentLang isEqualToString:@"fr"]) return [NSString stringWithFormat:@"il y a %ldh", (long)n];
    if ([gCurrentLang isEqualToString:@"es"]) return [NSString stringWithFormat:@"hace %ldh", (long)n];
    return [NSString stringWithFormat:@"%ld小时前", (long)n];
}

+ (NSString *)formatDaysAgo:(NSInteger)n {
    if ([gCurrentLang isEqualToString:@"en"]) return [NSString stringWithFormat:@"%ldd ago", (long)n];
    if ([gCurrentLang isEqualToString:@"ja"]) return [NSString stringWithFormat:@"%ld日前", (long)n];
    if ([gCurrentLang isEqualToString:@"ko"]) return [NSString stringWithFormat:@"%ld일 전", (long)n];
    if ([gCurrentLang isEqualToString:@"de"]) return [NSString stringWithFormat:@"vor %ldd", (long)n];
    if ([gCurrentLang isEqualToString:@"fr"]) return [NSString stringWithFormat:@"il y a %ldj", (long)n];
    if ([gCurrentLang isEqualToString:@"es"]) return [NSString stringWithFormat:@"hace %ldd", (long)n];
    return [NSString stringWithFormat:@"%ld天前", (long)n];
}
@end

#pragma mark - Theme & Skin Manager (Supports All 32 MarkNotePro Themes)

static NSColor *colorFromHex(NSString *hex, CGFloat alpha) {
    if (!hex || hex.length == 0) return [NSColor colorWithWhite:0.2 alpha:alpha];
    NSString *clean = [hex stringByReplacingOccurrencesOfString:@"#" withString:@""];
    unsigned int rgb = 0;
    [[NSScanner scannerWithString:clean] scanHexInt:&rgb];
    if (clean.length == 6) {
        CGFloat r = ((rgb >> 16) & 0xFF) / 255.0;
        CGFloat g = ((rgb >> 8) & 0xFF) / 255.0;
        CGFloat b = (rgb & 0xFF) / 255.0;
        return [NSColor colorWithSRGBRed:r green:g blue:b alpha:alpha];
    } else if (clean.length == 3) {
        CGFloat r = (((rgb >> 8) & 0xF) * 17) / 255.0;
        CGFloat g = (((rgb >> 4) & 0xF) * 17) / 255.0;
        CGFloat b = ((rgb & 0xF) * 17) / 255.0;
        return [NSColor colorWithSRGBRed:r green:g blue:b alpha:alpha];
    }
    return [NSColor colorWithWhite:0.2 alpha:alpha];
}

@interface AppTheme : NSObject
@property (nonatomic, copy) NSString *name;
@property (nonatomic, assign) BOOL isDark;
@property (nonatomic, strong) NSColor *bgColor;
@property (nonatomic, strong) NSColor *toolbarBgColor;
@property (nonatomic, strong) NSColor *toolbarBorderColor;
@property (nonatomic, strong) NSColor *textColor;
@property (nonatomic, strong) NSColor *secondaryTextColor;
@property (nonatomic, strong) NSColor *accentColor;
@property (nonatomic, strong) NSColor *buttonHoverColor;
@property (nonatomic, strong) NSColor *buttonActiveBgColor;
@property (nonatomic, strong) NSColor *subToolbarBgColor;
@property (nonatomic, strong) NSColor *subToolbarBorderColor;
@property (nonatomic, strong) NSColor *inputBgColor;
@property (nonatomic, strong) NSColor *inputBorderColor;
@property (nonatomic, strong) NSColor *selectionBorderColor;
@property (nonatomic, strong) NSColor *sizeLabelBgColor;

+ (AppTheme *)currentTheme;
+ (void)setCurrentThemeWithName:(NSString *)name;
+ (void)loadUserPreferences;
@end

@implementation AppTheme
static AppTheme *gCurrentAppTheme = nil;

+ (AppTheme *)currentTheme {
    if (!gCurrentAppTheme) {
        [self setCurrentThemeWithName:@"dark"];
    }
    return gCurrentAppTheme;
}

+ (void)setCurrentThemeWithName:(NSString *)name {
    if (!name || name.length == 0) name = @"dark";

    // All 32 MarkNotePro Themes (common/theme.ts) mapped to {bgHex, accentHex, isDark}
    static NSDictionary *themeMeta = nil;
    if (!themeMeta) {
        themeMeta = @{
            // Dark Themes
            @"dark": @{ @"bg": @"#282828", @"accent": @"#336df4", @"dark": @YES },
            @"nord": @{ @"bg": @"#2e3440", @"accent": @"#81a1c1", @"dark": @YES },
            @"dracula": @{ @"bg": @"#282a36", @"accent": @"#bd93f9", @"dark": @YES },
            @"one-dark": @{ @"bg": @"#282c34", @"accent": @"#61afef", @"dark": @YES },
            @"solarized-dark": @{ @"bg": @"#002b36", @"accent": @"#268bd2", @"dark": @YES },
            @"material-dark": @{ @"bg": @"#34393f", @"accent": @"#00bcd4", @"dark": @YES },
            @"ayu-dark": @{ @"bg": @"#0a0e14", @"accent": @"#e6b450", @"dark": @YES },
            @"ayu-mirage": @{ @"bg": @"#1f2430", @"accent": @"#ffcc66", @"dark": @YES },
            @"catppuccin-mocha": @{ @"bg": @"#1e1e2e", @"accent": @"#89b4fa", @"dark": @YES },
            @"cyberdream": @{ @"bg": @"#16181a", @"accent": @"#5ef1ff", @"dark": @YES },
            @"everforest-dark": @{ @"bg": @"#2d353b", @"accent": @"#a7c080", @"dark": @YES },
            @"gruvbox-dark": @{ @"bg": @"#282828", @"accent": @"#fe8019", @"dark": @YES },
            @"horizon-dark": @{ @"bg": @"#1c1e26", @"accent": @"#e95678", @"dark": @YES },
            @"kanagawa": @{ @"bg": @"#1f1f28", @"accent": @"#7e9cd8", @"dark": @YES },
            @"monokai-pro": @{ @"bg": @"#2d2a2e", @"accent": @"#ffd866", @"dark": @YES },
            @"nightfox": @{ @"bg": @"#192330", @"accent": @"#719cd6", @"dark": @YES },
            @"oxocarbon-dark": @{ @"bg": @"#161616", @"accent": @"#78a9ff", @"dark": @YES },
            @"palenight": @{ @"bg": @"#292d3e", @"accent": @"#82aaff", @"dark": @YES },
            @"rose-pine": @{ @"bg": @"#191724", @"accent": @"#ebbcba", @"dark": @YES },
            @"rose-pine-moon": @{ @"bg": @"#232136", @"accent": @"#ea9a97", @"dark": @YES },
            @"synthwave-84": @{ @"bg": @"#262335", @"accent": @"#ff7edb", @"dark": @YES },
            @"tokyo-night": @{ @"bg": @"#1a1b26", @"accent": @"#7aa2f7", @"dark": @YES },
            @"tokyo-night-storm": @{ @"bg": @"#24283b", @"accent": @"#7aa2f7", @"dark": @YES },

            // Light Themes
            @"light": @{ @"bg": @"#ffffff", @"accent": @"#336df4", @"dark": @NO },
            @"ayu-light": @{ @"bg": @"#fafafa", @"accent": @"#ff9940", @"dark": @NO },
            @"catppuccin-latte": @{ @"bg": @"#eff1f5", @"accent": @"#1e66f5", @"dark": @NO },
            @"everforest-light": @{ @"bg": @"#fdf6e3", @"accent": @"#8da101", @"dark": @NO },
            @"graphite": @{ @"bg": @"#f7f7f7", @"accent": @"#4078f2", @"dark": @NO },
            @"gruvbox-light": @{ @"bg": @"#fbf1c7", @"accent": @"#d65d0e", @"dark": @NO },
            @"rose-pine-dawn": @{ @"bg": @"#faf4ed", @"accent": @"#d7827e", @"dark": @NO },
            @"solarized-light": @{ @"bg": @"#fdf6e3", @"accent": @"#268bd2", @"dark": @NO },
            @"tokyo-night-light": @{ @"bg": @"#d5d6db", @"accent": @"#34548a", @"dark": @NO },
            @"ulysses": @{ @"bg": @"#f3f3f3", @"accent": @"#007aff", @"dark": @NO }
        };
    }

    NSDictionary *meta = themeMeta[name];
    if (!meta) {
        // Fallback: check if name contains light
        BOOL isDark = ![name.lowercaseString containsString:@"light"] && ![name.lowercaseString containsString:@"latte"] && ![name.lowercaseString containsString:@"dawn"];
        meta = @{ @"bg": isDark ? @"#23252a" : @"#ffffff", @"accent": @"#336df4", @"dark": @(isDark) };
    }

    AppTheme *theme = [[AppTheme alloc] init];
    theme.name = name;
    theme.isDark = [meta[@"dark"] boolValue];
    theme.bgColor = colorFromHex(meta[@"bg"], 1.0);
    theme.accentColor = colorFromHex(meta[@"accent"], 1.0);

    if (theme.isDark) {
        // Dark theme calculations
        theme.toolbarBgColor = [theme.bgColor blendedColorWithFraction:0.12 ofColor:[NSColor whiteColor]];
        if (!theme.toolbarBgColor) theme.toolbarBgColor = [NSColor colorWithSRGBRed:0.14 green:0.16 blue:0.20 alpha:0.96];
        theme.toolbarBorderColor = [NSColor colorWithWhite:1.0 alpha:0.14];
        theme.textColor = [NSColor colorWithSRGBRed:0.94 green:0.95 blue:0.96 alpha:1.0];
        theme.secondaryTextColor = [NSColor colorWithWhite:1.0 alpha:0.55];
        theme.buttonHoverColor = [NSColor colorWithWhite:1.0 alpha:0.12];
        theme.buttonActiveBgColor = [theme.accentColor colorWithAlphaComponent:0.32];
        theme.subToolbarBgColor = theme.toolbarBgColor;
        theme.subToolbarBorderColor = theme.toolbarBorderColor;
        theme.inputBgColor = [theme.bgColor blendedColorWithFraction:0.20 ofColor:[NSColor blackColor]];
        theme.inputBorderColor = [NSColor colorWithWhite:1.0 alpha:0.12];
        theme.selectionBorderColor = theme.accentColor;
        theme.sizeLabelBgColor = [NSColor colorWithSRGBRed:0.10 green:0.12 blue:0.15 alpha:0.90];
    } else {
        // Light theme calculations
        theme.toolbarBgColor = [NSColor colorWithSRGBRed:1.0 green:1.0 blue:1.0 alpha:0.96];
        theme.toolbarBorderColor = [NSColor colorWithWhite:0.0 alpha:0.10];
        theme.textColor = [NSColor colorWithSRGBRed:0.12 green:0.14 blue:0.16 alpha:1.0];
        theme.secondaryTextColor = [NSColor colorWithWhite:0.0 alpha:0.55];
        theme.buttonHoverColor = [NSColor colorWithWhite:0.0 alpha:0.08];
        theme.buttonActiveBgColor = [theme.accentColor colorWithAlphaComponent:0.16];
        theme.subToolbarBgColor = theme.toolbarBgColor;
        theme.subToolbarBorderColor = theme.toolbarBorderColor;
        theme.inputBgColor = [NSColor colorWithWhite:0.0 alpha:0.05];
        theme.inputBorderColor = [NSColor colorWithWhite:0.0 alpha:0.10];
        theme.selectionBorderColor = theme.accentColor;
        theme.sizeLabelBgColor = [NSColor colorWithWhite:0.20 alpha:0.85];
    }

    gCurrentAppTheme = theme;
}

+ (void)loadUserPreferences {
    NSArray *paths = @[
        [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Application Support/marknotepro/preferences.json"],
        [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Application Support/MarkNotePro/preferences.json"],
        [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Application Support/marknotepro-dev/preferences.json"]
    ];
    for (NSString *prefPath in paths) {
        NSData *data = [NSData dataWithContentsOfFile:prefPath];
        if (data) {
            NSDictionary *dict = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
            if (dict) {
                if (dict[@"theme"]) [AppTheme setCurrentThemeWithName:dict[@"theme"]];
                if (dict[@"language"]) [I18N setCurrentLanguage:dict[@"language"]];
                return;
            }
        }
    }
}
@end

#pragma mark - High-Fidelity Vector SVG Icon Generator (1:1 with MarkShotHis)

static NSImage *getSvgIcon(NSString *iconId) {
    static NSMutableDictionary<NSString *, NSImage *> *cache = nil;
    if (!cache) cache = [NSMutableDictionary dictionary];
    if (cache[iconId]) return cache[iconId];

    NSSize imgSize = [iconId isEqualToString:@"grip"] ? NSMakeSize(10, 20) : NSMakeSize(20, 20);
    NSImage *image = [NSImage imageWithSize:imgSize flipped:YES drawingHandler:^BOOL(NSRect dstRect) {
        CGContextRef ctx = [[NSGraphicsContext currentContext] CGContext];
        CGContextSaveGState(ctx);
        CGContextSetStrokeColorWithColor(ctx, [NSColor whiteColor].CGColor);
        CGContextSetFillColorWithColor(ctx, [NSColor whiteColor].CGColor);
        CGContextSetLineCap(ctx, kCGLineCapRound);
        CGContextSetLineJoin(ctx, kCGLineJoinRound);

        if ([iconId isEqualToString:@"grip"]) {
            // 6 dots: cx=3,7; cy=4,10,16; r=1.5
            CGFloat r = 1.5;
            CGContextFillEllipseInRect(ctx, CGRectMake(3 - r, 4 - r, r * 2, r * 2));
            CGContextFillEllipseInRect(ctx, CGRectMake(7 - r, 4 - r, r * 2, r * 2));
            CGContextFillEllipseInRect(ctx, CGRectMake(3 - r, 10 - r, r * 2, r * 2));
            CGContextFillEllipseInRect(ctx, CGRectMake(7 - r, 10 - r, r * 2, r * 2));
            CGContextFillEllipseInRect(ctx, CGRectMake(3 - r, 16 - r, r * 2, r * 2));
            CGContextFillEllipseInRect(ctx, CGRectMake(7 - r, 16 - r, r * 2, r * 2));
        } else {
            CGFloat s = 20.0 / 24.0;
            CGContextScaleCTM(ctx, s, s);

            if ([iconId isEqualToString:@"rect"]) {
                // <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" stroke-width="2">
                CGPathRef p = CGPathCreateWithRoundedRect(CGRectMake(3.5, 3.5, 17, 17), 2.5, 2.5, NULL);
                CGContextSetLineWidth(ctx, 2.0);
                CGContextAddPath(ctx, p);
                CGContextStrokePath(ctx);
                CGPathRelease(p);
            } else if ([iconId isEqualToString:@"circle"]) {
                // <ellipse cx="12" cy="12" rx="8.5" ry="8.5" stroke-width="2">
                CGContextSetLineWidth(ctx, 2.0);
                CGContextStrokeEllipseInRect(ctx, CGRectMake(12 - 8.5, 12 - 8.5, 17, 17));
            } else if ([iconId isEqualToString:@"line"]) {
                // <line x1="4" y1="20" x2="20" y2="4" stroke-width="2">
                CGContextSetLineWidth(ctx, 2.0);
                CGContextMoveToPoint(ctx, 4, 20);
                CGContextAddLineToPoint(ctx, 20, 4);
                CGContextStrokePath(ctx);
            } else if ([iconId isEqualToString:@"arrow"]) {
                // <line x1="5" y1="19" x2="19" y2="5"><polyline points="10 5 19 5 19 14">
                CGContextSetLineWidth(ctx, 2.0);
                CGContextMoveToPoint(ctx, 5, 19);
                CGContextAddLineToPoint(ctx, 19, 5);
                CGContextStrokePath(ctx);
                CGContextMoveToPoint(ctx, 10, 5);
                CGContextAddLineToPoint(ctx, 19, 5);
                CGContextAddLineToPoint(ctx, 19, 14);
                CGContextStrokePath(ctx);
            } else if ([iconId isEqualToString:@"pencil"]) {
                // <path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
                CGContextSetLineWidth(ctx, 2.0);
                CGMutablePathRef path = CGPathCreateMutable();
                CGPathMoveToPoint(path, NULL, 12, 19);
                CGPathAddLineToPoint(path, NULL, 19, 12);
                CGPathAddLineToPoint(path, NULL, 22, 15);
                CGPathAddLineToPoint(path, NULL, 15, 22);
                CGPathCloseSubpath(path);
                CGPathMoveToPoint(path, NULL, 18, 13);
                CGPathAddLineToPoint(path, NULL, 16.5, 5.5);
                CGPathAddLineToPoint(path, NULL, 2, 2);
                CGPathAddLineToPoint(path, NULL, 5.5, 16.5);
                CGPathAddLineToPoint(path, NULL, 13, 18);
                CGPathAddLineToPoint(path, NULL, 18, 13);
                CGContextAddPath(ctx, path);
                CGContextStrokePath(ctx);
                CGPathRelease(path);
            } else if ([iconId isEqualToString:@"text"]) {
                // Bold capital "T"
                NSDictionary *attrs = @{
                    NSFontAttributeName: [NSFont systemFontOfSize:17 weight:NSFontWeightBold],
                    NSForegroundColorAttributeName: [NSColor whiteColor]
                };
                NSAttributedString *as = [[NSAttributedString alloc] initWithString:@"T" attributes:attrs];
                NSRect b = [as boundingRectWithSize:NSMakeSize(24, 24) options:0];
                [as drawAtPoint:NSMakePoint((24 - b.size.width) / 2.0, (24 - b.size.height) / 2.0 - 1.0)];
            } else if ([iconId isEqualToString:@"tag"]) {
                // Lark callout tag icon
                CGContextFillEllipseInRect(ctx, CGRectMake(5 - 2.5, 19 - 2.5, 5, 5));
                CGContextFillEllipseInRect(ctx, CGRectMake(17.5 - 1.2, 9.5 - 1.2, 2.4, 2.4));
                CGContextSetLineWidth(ctx, 1.8);
                CGMutablePathRef path = CGPathCreateMutable();
                CGPathMoveToPoint(path, NULL, 7, 17);
                CGPathAddLineToPoint(path, NULL, 11.5, 12.5);
                CGPathAddLineToPoint(path, NULL, 17, 12.5);
                CGPathAddArcToPoint(path, NULL, 20, 12.5, 20, 9.5, 3.0);
                CGPathAddArcToPoint(path, NULL, 20, 6.5, 17, 6.5, 3.0);
                CGPathAddLineToPoint(path, NULL, 13, 6.5);
                CGPathAddArcToPoint(path, NULL, 10, 6.5, 10, 9.5, 3.0);
                CGPathAddLineToPoint(path, NULL, 10, 10.5);
                CGContextAddPath(ctx, path);
                CGContextStrokePath(ctx);
                CGPathRelease(path);
            } else if ([iconId isEqualToString:@"step"]) {
                // Number 1 inside solid circle
                CGContextFillEllipseInRect(ctx, CGRectMake(12 - 9, 12 - 9, 18, 18));
                NSDictionary *attrs = @{
                    NSFontAttributeName: [NSFont systemFontOfSize:12 weight:NSFontWeightHeavy],
                    NSForegroundColorAttributeName: [NSColor blackColor]
                };
                NSAttributedString *as = [[NSAttributedString alloc] initWithString:@"1" attributes:attrs];
                NSRect b = [as boundingRectWithSize:NSMakeSize(24, 24) options:0];
                [as drawAtPoint:NSMakePoint((24 - b.size.width) / 2.0, (24 - b.size.height) / 2.0)];
            } else if ([iconId isEqualToString:@"stepNote"]) {
                // Number 1 circle + "T"
                CGContextFillEllipseInRect(ctx, CGRectMake(7 - 6, 12 - 6, 12, 12));
                NSDictionary *attrs1 = @{
                    NSFontAttributeName: [NSFont systemFontOfSize:9 weight:NSFontWeightHeavy],
                    NSForegroundColorAttributeName: [NSColor blackColor]
                };
                NSAttributedString *as1 = [[NSAttributedString alloc] initWithString:@"1" attributes:attrs1];
                NSRect b1 = [as1 boundingRectWithSize:NSMakeSize(12, 12) options:0];
                [as1 drawAtPoint:NSMakePoint(7 - b1.size.width / 2.0, 12 - b1.size.height / 2.0)];
                NSDictionary *attrsT = @{
                    NSFontAttributeName: [NSFont systemFontOfSize:13 weight:NSFontWeightBold],
                    NSForegroundColorAttributeName: [NSColor whiteColor]
                };
                NSAttributedString *asT = [[NSAttributedString alloc] initWithString:@"T" attributes:attrsT];
                [asT drawAtPoint:NSMakePoint(14, 4)];
            } else if ([iconId isEqualToString:@"mosaic"]) {
                // Rounded rect + 2 diagonal filled quadrants
                CGPathRef p = CGPathCreateWithRoundedRect(CGRectMake(3.5, 3.5, 17, 17), 2, 2, NULL);
                CGContextSetLineWidth(ctx, 2.0);
                CGContextAddPath(ctx, p);
                CGContextStrokePath(ctx);
                CGPathRelease(p);
                CGContextFillRect(ctx, CGRectMake(3.5, 3.5, 8.5, 8.5));
                CGContextFillRect(ctx, CGRectMake(12, 12, 8.5, 8.5));
            } else if ([iconId isEqualToString:@"highlight"]) {
                // Rounded rect + center circle + stripes
                CGPathRef p = CGPathCreateWithRoundedRect(CGRectMake(3.5, 3.5, 17, 17), 3.5, 3.5, NULL);
                CGContextSetLineWidth(ctx, 1.8);
                CGContextAddPath(ctx, p);
                CGContextStrokePath(ctx);
                CGPathRelease(p);
                CGContextSetLineWidth(ctx, 1.6);
                CGContextStrokeEllipseInRect(ctx, CGRectMake(12 - 5.2, 12 - 5.2, 10.4, 10.4));
                CGContextSetLineWidth(ctx, 1.4);
                CGContextMoveToPoint(ctx, 8.5, 12); CGContextAddLineToPoint(ctx, 12, 8.5); CGContextStrokePath(ctx);
                CGContextMoveToPoint(ctx, 9.5, 14.5); CGContextAddLineToPoint(ctx, 14.5, 9.5); CGContextStrokePath(ctx);
                CGContextMoveToPoint(ctx, 12, 15.5); CGContextAddLineToPoint(ctx, 15.5, 12); CGContextStrokePath(ctx);
            } else if ([iconId isEqualToString:@"marker"]) {
                // 4 diagonal slanted marker lines
                CGContextSetLineWidth(ctx, 2.0);
                CGContextMoveToPoint(ctx, 4.5, 19.5); CGContextAddLineToPoint(ctx, 10.5, 4.5); CGContextStrokePath(ctx);
                CGContextMoveToPoint(ctx, 8.5, 19.5); CGContextAddLineToPoint(ctx, 14.5, 4.5); CGContextStrokePath(ctx);
                CGContextMoveToPoint(ctx, 12.5, 19.5); CGContextAddLineToPoint(ctx, 18.5, 4.5); CGContextStrokePath(ctx);
                CGContextMoveToPoint(ctx, 16.5, 19.5); CGContextAddLineToPoint(ctx, 22.5, 4.5); CGContextStrokePath(ctx);
            } else if ([iconId isEqualToString:@"watermark"]) {
                // Rounded rect + dashed diagonal + circle with "印"
                CGPathRef p = CGPathCreateWithRoundedRect(CGRectMake(3.5, 3.5, 17, 17), 3, 3, NULL);
                CGContextSetLineWidth(ctx, 1.8);
                CGContextAddPath(ctx, p);
                CGContextStrokePath(ctx);
                CGPathRelease(p);

                CGFloat lengths[] = {2, 2};
                CGContextSetLineDash(ctx, 0, lengths, 2);
                CGContextSetLineWidth(ctx, 1.4);
                CGContextMoveToPoint(ctx, 6.5, 17.5); CGContextAddLineToPoint(ctx, 17.5, 6.5); CGContextStrokePath(ctx);
                CGContextSetLineDash(ctx, 0, NULL, 0);

                CGContextSetLineWidth(ctx, 1.6);
                CGContextStrokeEllipseInRect(ctx, CGRectMake(12 - 4.2, 12 - 4.2, 8.4, 8.4));

                NSDictionary *attrs = @{
                    NSFontAttributeName: [NSFont systemFontOfSize:7 weight:NSFontWeightBold],
                    NSForegroundColorAttributeName: [NSColor whiteColor]
                };
                NSAttributedString *as = [[NSAttributedString alloc] initWithString:@"印" attributes:attrs];
                NSRect b = [as boundingRectWithSize:NSMakeSize(12, 12) options:0];
                [as drawAtPoint:NSMakePoint(12 - b.size.width / 2.0, 12 - b.size.height / 2.0)];
            } else if ([iconId isEqualToString:@"pin"]) {
                // Exact pushpin shape
                CGPathRef cap = CGPathCreateWithRoundedRect(CGRectMake(7, 3, 10, 2.5), 1, 1, NULL);
                CGContextAddPath(ctx, cap);
                CGContextFillPath(ctx);
                CGPathRelease(cap);

                CGContextSetLineWidth(ctx, 1.8);
                CGMutablePathRef body = CGPathCreateMutable();
                CGPathMoveToPoint(body, NULL, 8.5, 5.5);
                CGPathAddLineToPoint(body, NULL, 15.5, 5.5);
                CGPathAddLineToPoint(body, NULL, 15.0, 9.5);
                CGPathAddLineToPoint(body, NULL, 17.5, 12.5);
                CGPathAddLineToPoint(body, NULL, 17.5, 14.0);
                CGPathAddLineToPoint(body, NULL, 6.5, 14.0);
                CGPathAddLineToPoint(body, NULL, 6.5, 12.5);
                CGPathAddLineToPoint(body, NULL, 9.0, 9.5);
                CGPathCloseSubpath(body);
                CGContextAddPath(ctx, body);
                CGContextStrokePath(ctx);
                CGPathRelease(body);

                CGContextSetLineWidth(ctx, 2.0);
                CGContextMoveToPoint(ctx, 12, 14);
                CGContextAddLineToPoint(ctx, 12, 21);
                CGContextStrokePath(ctx);
            } else if ([iconId isEqualToString:@"undo"]) {
                // Curved counter-clockwise arrow
                CGContextSetLineWidth(ctx, 2.0);
                CGContextMoveToPoint(ctx, 3, 7);
                CGContextAddLineToPoint(ctx, 3, 13);
                CGContextAddLineToPoint(ctx, 9, 13);
                CGContextStrokePath(ctx);

                CGMutablePathRef arc = CGPathCreateMutable();
                CGPathMoveToPoint(arc, NULL, 21, 17);
                CGPathAddArcToPoint(arc, NULL, 21, 8, 12, 8, 9.0);
                CGPathAddArcToPoint(arc, NULL, 6, 8, 3, 13, 9.0);
                CGContextAddPath(ctx, arc);
                CGContextStrokePath(ctx);
                CGPathRelease(arc);
            } else if ([iconId isEqualToString:@"save"]) {
                // Tray + downward arrow
                CGContextSetLineWidth(ctx, 2.0);
                CGMutablePathRef tray = CGPathCreateMutable();
                CGPathMoveToPoint(tray, NULL, 21, 15);
                CGPathAddLineToPoint(tray, NULL, 21, 19);
                CGPathAddArcToPoint(tray, NULL, 21, 21, 19, 21, 2.0);
                CGPathAddLineToPoint(tray, NULL, 5, 21);
                CGPathAddArcToPoint(tray, NULL, 3, 21, 3, 19, 2.0);
                CGPathAddLineToPoint(tray, NULL, 3, 15);
                CGContextAddPath(ctx, tray);
                CGContextStrokePath(ctx);
                CGPathRelease(tray);

                CGContextMoveToPoint(ctx, 7, 10);
                CGContextAddLineToPoint(ctx, 12, 15);
                CGContextAddLineToPoint(ctx, 17, 10);
                CGContextStrokePath(ctx);

                CGContextMoveToPoint(ctx, 12, 15);
                CGContextAddLineToPoint(ctx, 12, 3);
                CGContextStrokePath(ctx);
            } else if ([iconId isEqualToString:@"close"]) {
                // 45-degree cross
                CGContextSetLineWidth(ctx, 2.0);
                CGContextMoveToPoint(ctx, 18, 6);
                CGContextAddLineToPoint(ctx, 6, 18);
                CGContextStrokePath(ctx);
                CGContextMoveToPoint(ctx, 6, 6);
                CGContextAddLineToPoint(ctx, 18, 18);
                CGContextStrokePath(ctx);
            } else if ([iconId isEqualToString:@"confirm"]) {
                // Checkmark with 2.5 stroke
                CGContextSetLineWidth(ctx, 2.5);
                CGContextMoveToPoint(ctx, 20, 6);
                CGContextAddLineToPoint(ctx, 9, 17);
                CGContextAddLineToPoint(ctx, 4, 12);
                CGContextStrokePath(ctx);
            } else if ([iconId isEqualToString:@"edit"]) {
                // Pencil on line
                CGContextSetLineWidth(ctx, 2.0);
                CGContextMoveToPoint(ctx, 12, 20);
                CGContextAddLineToPoint(ctx, 21, 20);
                CGContextStrokePath(ctx);
                CGMutablePathRef pen = CGPathCreateMutable();
                CGPathMoveToPoint(pen, NULL, 16.5, 3.5);
                CGPathAddLineToPoint(pen, NULL, 19.5, 6.5);
                CGPathAddLineToPoint(pen, NULL, 7, 19);
                CGPathAddLineToPoint(pen, NULL, 3, 20);
                CGPathAddLineToPoint(pen, NULL, 4, 16);
                CGPathCloseSubpath(pen);
                CGContextAddPath(ctx, pen);
                CGContextStrokePath(ctx);
                CGPathRelease(pen);
            } else if ([iconId isEqualToString:@"copy"]) {
                // Two overlapping rounded rects
                CGPathRef r = CGPathCreateWithRoundedRect(CGRectMake(9, 9, 13, 13), 2, 2, NULL);
                CGContextSetLineWidth(ctx, 2.0);
                CGContextAddPath(ctx, r);
                CGContextStrokePath(ctx);
                CGPathRelease(r);

                CGMutablePathRef back = CGPathCreateMutable();
                CGPathMoveToPoint(back, NULL, 5, 15);
                CGPathAddLineToPoint(back, NULL, 4, 15);
                CGPathAddArcToPoint(back, NULL, 2, 15, 2, 13, 2.0);
                CGPathAddLineToPoint(back, NULL, 2, 4);
                CGPathAddArcToPoint(back, NULL, 2, 2, 4, 2, 2.0);
                CGPathAddLineToPoint(back, NULL, 13, 2);
                CGPathAddArcToPoint(back, NULL, 15, 2, 15, 4, 2.0);
                CGPathAddLineToPoint(back, NULL, 15, 5);
                CGContextAddPath(ctx, back);
                CGContextStrokePath(ctx);
                CGPathRelease(back);
            } else if ([iconId isEqualToString:@"delete"]) {
                // Trash can
                CGContextSetLineWidth(ctx, 2.0);
                CGContextMoveToPoint(ctx, 3, 6);
                CGContextAddLineToPoint(ctx, 21, 6);
                CGContextStrokePath(ctx);

                CGMutablePathRef can = CGPathCreateMutable();
                CGPathMoveToPoint(can, NULL, 19, 6);
                CGPathAddLineToPoint(can, NULL, 19, 20);
                CGPathAddArcToPoint(can, NULL, 19, 22, 17, 22, 2.0);
                CGPathAddLineToPoint(can, NULL, 7, 22);
                CGPathAddArcToPoint(can, NULL, 5, 22, 5, 20, 2.0);
                CGPathAddLineToPoint(can, NULL, 5, 6);
                CGContextAddPath(ctx, can);
                CGContextStrokePath(ctx);
                CGPathRelease(can);

                CGMutablePathRef lid = CGPathCreateMutable();
                CGPathMoveToPoint(lid, NULL, 8, 6);
                CGPathAddLineToPoint(lid, NULL, 8, 4);
                CGPathAddArcToPoint(lid, NULL, 8, 2, 10, 2, 2.0);
                CGPathAddLineToPoint(lid, NULL, 14, 2);
                CGPathAddArcToPoint(lid, NULL, 16, 2, 16, 4, 2.0);
                CGPathAddLineToPoint(lid, NULL, 16, 6);
                CGContextAddPath(ctx, lid);
                CGContextStrokePath(ctx);
                CGPathRelease(lid);
            } else if ([iconId isEqualToString:@"search"]) {
                // Magnifying glass
                CGContextSetLineWidth(ctx, 2.0);
                CGContextStrokeEllipseInRect(ctx, CGRectMake(11 - 8, 11 - 8, 16, 16));
                CGContextMoveToPoint(ctx, 21, 21);
                CGContextAddLineToPoint(ctx, 16.65, 16.65);
                CGContextStrokePath(ctx);
            }
        }

        CGContextRestoreGState(ctx);
        return YES;
    }];

    [image setTemplate:YES];
    cache[iconId] = image;
    return image;
}

#pragma mark - Custom Hover Button with Cursor & State Styling

@interface HoverButton : NSButton
@property (nonatomic, strong) NSColor *customHoverColor;
@property (nonatomic, strong) NSColor *customActiveBgColor;
@property (nonatomic, strong) NSColor *customNormalBgColor;
@property (nonatomic, strong) NSColor *fixedBgColor;
@property (nonatomic, assign) BOOL isSelected;
@end

@implementation HoverButton {
    NSTrackingArea *_trackingArea;
    BOOL _isHovered;
}

- (instancetype)initWithFrame:(NSRect)frameRect {
    self = [super initWithFrame:frameRect];
    if (self) {
        self.title = @"";
        self.wantsLayer = YES;
        self.layer.cornerRadius = 7.0;
        self.layer.masksToBounds = YES;
        self.bordered = NO;
        [self setButtonType:NSButtonTypeMomentaryChange];
        self.bezelStyle = NSBezelStyleRegularSquare;
        self.imageScaling = NSImageScaleProportionallyDown;
        [self updateTrackingAreas];
    }
    return self;
}

- (void)updateTrackingAreas {
    [super updateTrackingAreas];
    if (_trackingArea) [self removeTrackingArea:_trackingArea];
    _trackingArea = [[NSTrackingArea alloc] initWithRect:self.bounds
                                                 options:NSTrackingMouseEnteredAndExited | NSTrackingActiveAlways | NSTrackingCursorUpdate
                                                   owner:self
                                                userInfo:nil];
    [self addTrackingArea:_trackingArea];
}

- (void)cursorUpdate:(NSEvent *)event {
    [[NSCursor pointingHandCursor] set];
}

- (void)resetCursorRects {
    [super resetCursorRects];
    [self addCursorRect:self.bounds cursor:[NSCursor pointingHandCursor]];
}

- (void)mouseEntered:(NSEvent *)event {
    _isHovered = YES;
    [self updateAppearance];
}

- (void)mouseExited:(NSEvent *)event {
    _isHovered = NO;
    [self updateAppearance];
}

- (void)setIsSelected:(BOOL)isSelected {
    _isSelected = isSelected;
    [self updateAppearance];
}

- (void)updateAppearance {
    if (self.fixedBgColor) {
        self.layer.backgroundColor = self.fixedBgColor.CGColor;
        if (_isHovered) {
            self.layer.borderWidth = 2.0;
            self.layer.borderColor = [NSColor whiteColor].CGColor;
        } else {
            self.layer.borderWidth = (self.tag == 6) ? 1.0 : 0.5;
            self.layer.borderColor = (self.tag == 6) ? [[NSColor colorWithWhite:0.4 alpha:0.6] CGColor] : [[NSColor clearColor] CGColor];
        }
        return;
    }
    if (_isSelected && self.customActiveBgColor) {
        self.layer.backgroundColor = self.customActiveBgColor.CGColor;
    } else if (_isHovered && self.customHoverColor) {
        self.layer.backgroundColor = self.customHoverColor.CGColor;
    } else if (self.customNormalBgColor) {
        self.layer.backgroundColor = self.customNormalBgColor.CGColor;
    } else {
        self.layer.backgroundColor = [NSColor clearColor].CGColor;
    }
}
@end

#pragma mark - Diagonal Resize Cursors

static NSCursor *nwseCursor(void) {
    SEL sel = NSSelectorFromString(@"_windowResizeNorthWestSouthEastCursor");
    if ([NSCursor respondsToSelector:sel]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
        return [NSCursor performSelector:sel];
#pragma clang diagnostic pop
    }
    return [NSCursor crosshairCursor];
}

static NSCursor *neswCursor(void) {
    SEL sel = NSSelectorFromString(@"_windowResizeNorthEastSouthWestCursor");
    if ([NSCursor respondsToSelector:sel]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
        return [NSCursor performSelector:sel];
#pragma clang diagnostic pop
    }
    return [NSCursor crosshairCursor];
}

#pragma mark - Vertically Centered Text Field Cell

@interface VerticallyCenteredTextFieldCell : NSTextFieldCell
@property (nonatomic, assign) CGFloat verticalOffset;
@end

@implementation VerticallyCenteredTextFieldCell

- (NSRect)adjustedFrameToVerticallyCenterRect:(NSRect)frame {
    NSSize textSize = [self cellSizeForBounds:frame];
    CGFloat delta = frame.size.height - textSize.height;
    if (delta > 0) {
        frame.origin.y += floor(delta / 2.0) + self.verticalOffset;
        frame.size.height = textSize.height;
    }
    return frame;
}

- (NSRect)drawingRectForBounds:(NSRect)theRect {
    NSRect newRect = [super drawingRectForBounds:theRect];
    return [self adjustedFrameToVerticallyCenterRect:newRect];
}

- (void)editWithFrame:(NSRect)aRect inView:(NSView *)controlView editor:(NSText *)textObj delegate:(id)anObject event:(NSEvent *)theEvent {
    [super editWithFrame:[self adjustedFrameToVerticallyCenterRect:aRect] inView:controlView editor:textObj delegate:anObject event:theEvent];
}

- (void)selectWithFrame:(NSRect)aRect inView:(NSView *)controlView editor:(NSText *)textObj delegate:(id)anObject start:(NSInteger)selStart length:(NSInteger)selLength {
    [super selectWithFrame:[self adjustedFrameToVerticallyCenterRect:aRect] inView:controlView editor:textObj delegate:anObject start:selStart length:selLength];
}

- (void)drawInteriorWithFrame:(NSRect)cellFrame inView:(NSView *)controlView {
    [super drawInteriorWithFrame:[self adjustedFrameToVerticallyCenterRect:cellFrame] inView:controlView];
}

@end

#pragma mark - Annotation Data Model & Styles

typedef NS_ENUM(NSInteger, AnnotationToolType) {
    ToolNone = 0,
    ToolRect = 1,       // ◻ 矩形
    ToolCircle = 2,     // ◯ 圆形
    ToolLine = 3,       // ╱ 直线
    ToolArrow = 4,      // ↗ 箭头
    ToolTag = 5,        // 🏷️ 气泡标签
    ToolText = 6,       // T 文本
    ToolPencil = 7,     // ✏️ 涂鸦画笔
    ToolStep = 8,       // ❶ 纯序号
    ToolStepNote = 9,   // ❶T 序号说明 (序号+文本)
    ToolMosaic = 10,    // ▦ 马赛克
    ToolHighlight = 11, // ⬚ 高亮框
    ToolMarker = 12,    // 彡 荧光笔
    ToolWatermark = 13  // ㊞ 水印
};

typedef NS_ENUM(NSInteger, AnnotationTextStyle) {
    TextStyleNormal = 0,   // 无底色文字 (透明底)
    TextStyleFilled = 1,   // 填充底色 (实心胶囊/卡片)
    TextStyleBordered = 2  // 边框文字 (半透明底 + 边框)
};

typedef NS_ENUM(NSInteger, HandleHitType) {
    HitNone = 0,
    HitTopLeft,
    HitTop,
    HitTopRight,
    HitRight,
    HitBottomRight,
    HitBottom,
    HitBottomLeft,
    HitLeft,
    HitInside,
    HitOutside
};

@interface AnnotationItem : NSObject
@property (nonatomic, assign) AnnotationToolType toolType;
@property (nonatomic, assign) AnnotationTextStyle textStyle;
@property (nonatomic, assign) NSPoint startPoint;
@property (nonatomic, assign) NSPoint endPoint;
@property (nonatomic, strong) NSMutableArray<NSValue *> *points;
@property (nonatomic, strong) NSColor *color;
@property (nonatomic, assign) CGFloat lineWidth;
@property (nonatomic, assign) CGFloat fontSize;
@property (nonatomic, strong) NSString *text;
@property (nonatomic, assign) NSInteger stepNumber;
@property (nonatomic, assign) NSRect itemRect;
@end

@implementation AnnotationItem
- (instancetype)init {
    self = [super init];
    if (self) {
        _points = [NSMutableArray array];
        _color = [NSColor colorWithSRGBRed:0.96 green:0.29 blue:0.27 alpha:1.0]; // Lark Red #f64b45
        _lineWidth = 4.0;
        _fontSize = 14.0;
        _textStyle = TextStyleNormal;
        _stepNumber = 1;
        _itemRect = NSZeroRect;
    }
    return self;
}
@end

#pragma mark - Centered Step Badge View

@interface StepBadgeView : NSView
@property (nonatomic, assign) NSInteger number;
@property (nonatomic, strong) NSColor *bgColor;
@property (nonatomic, strong) NSColor *textColor;
@end

@implementation StepBadgeView
- (void)drawRect:(NSRect)dirtyRect {
    [super drawRect:dirtyRect];
    NSRect b = self.bounds;
    NSBezierPath *circle = [NSBezierPath bezierPathWithOvalInRect:b];
    [self.bgColor setFill];
    [circle fill];

    NSString *str = [NSString stringWithFormat:@"%ld", (long)self.number];
    NSFont *font = [NSFont systemFontOfSize:11 weight:NSFontWeightBold];
    NSDictionary *attrs = @{
        NSFontAttributeName: font,
        NSForegroundColorAttributeName: self.textColor
    };
    NSSize s = [str sizeWithAttributes:attrs];
    CGFloat capH = font.capHeight;
    CGFloat desc = fabs(font.descender);
    CGFloat glyphDrawY = (b.size.height / 2.0) - desc - (capH / 2.0);
    NSPoint p = NSMakePoint((b.size.width - s.width) / 2.0, glyphDrawY);
    [str drawAtPoint:p withAttributes:attrs];
}
@end

#pragma mark - Multi-line Auto-Resizing Symmetrical Inline Editor

@interface AnnotationInlineEditorView : NSView <NSTextViewDelegate>
@property (nonatomic, assign) AnnotationToolType toolType;
@property (nonatomic, assign) AnnotationTextStyle textStyle;
@property (nonatomic, assign) NSPoint centerPoint; // Center anchor invariant
@property (nonatomic, assign) NSInteger stepNumber;
@property (nonatomic, strong) NSColor *activeColor;
@property (nonatomic, assign) CGFloat fontSize;
@property (nonatomic, strong) NSTextView *textView;
@property (nonatomic, strong) StepBadgeView *stepBadge;
@property (nonatomic, assign) CGFloat maxAllowedWidth;
@property (nonatomic, copy) void (^onCommit)(NSString *text, AnnotationToolType type, AnnotationTextStyle style, NSPoint center, NSInteger step, CGFloat fSize);
@property (nonatomic, copy) void (^onCancel)(void);
- (void)commit;
@end

@implementation AnnotationInlineEditorView

- (instancetype)initWithCenter:(NSPoint)center toolType:(AnnotationToolType)toolType textStyle:(AnnotationTextStyle)textStyle step:(NSInteger)step color:(NSColor *)color fontSize:(CGFloat)fSize {
    // Initial size: 4 Chinese characters length (~80px), 1 line height (~30px)
    CGFloat initialW = (toolType == ToolStepNote) ? 120.0 : ((toolType == ToolTag) ? 84.0 : 80.0);
    CGFloat initialH = 30.0;
    NSRect initialFrame = NSMakeRect(center.x, center.y - initialH / 2.0, initialW, initialH);

    self = [super initWithFrame:initialFrame];
    if (self) {
        _centerPoint = center;
        _toolType = toolType;
        _textStyle = textStyle;
        _stepNumber = step;
        _activeColor = color;
        _fontSize = (fSize > 0) ? fSize : 14.0;
        _maxAllowedWidth = 420.0;

        self.wantsLayer = YES;
        self.layer.masksToBounds = YES;
        self.layer.cornerRadius = 6.0;

        if (toolType == ToolTag) {
            // Tag bubble: Charcoal #2b2f3a with subtle shadow
            self.layer.backgroundColor = [[NSColor colorWithSRGBRed:0.17 green:0.18 blue:0.23 alpha:0.96] CGColor];
            self.layer.borderWidth = 1.0;
            self.layer.borderColor = [[NSColor colorWithWhite:1.0 alpha:0.2] CGColor];
        } else if (textStyle == TextStyleFilled) {
            self.layer.backgroundColor = [color CGColor];
            self.layer.borderWidth = 1.0;
            self.layer.borderColor = [[NSColor colorWithWhite:1.0 alpha:0.3] CGColor];
        } else if (textStyle == TextStyleBordered) {
            self.layer.backgroundColor = [[NSColor colorWithWhite:0.0 alpha:0.55] CGColor];
            self.layer.borderWidth = 1.5;
            self.layer.borderColor = [color CGColor];
        } else {
            // Normal: subtle focus frame during edit
            self.layer.backgroundColor = [[NSColor colorWithSRGBRed:0.12 green:0.14 blue:0.18 alpha:0.92] CGColor];
            self.layer.borderWidth = 1.5;
            self.layer.borderColor = [[NSColor colorWithSRGBRed:0.20 green:0.43 blue:0.96 alpha:1.0] CGColor]; // Lark Blue focus ring
        }

        CGFloat textX = 6.0;

        if (toolType == ToolStepNote) {
            // Numbered circle badge on left: always vertically centered!
            _stepBadge = [[StepBadgeView alloc] initWithFrame:NSMakeRect(6, (initialH - 22.0) / 2.0, 22.0, 22.0)];
            _stepBadge.number = step;
            _stepBadge.bgColor = (textStyle == TextStyleFilled) ? [NSColor whiteColor] : color;
            _stepBadge.textColor = (textStyle == TextStyleFilled) ? [NSColor colorWithSRGBRed:0.1 green:0.1 blue:0.15 alpha:1.0] : [NSColor whiteColor];
            [self addSubview:_stepBadge];
            textX += 28.0;
        }

        NSRect textRect = NSMakeRect(textX, 2, initialFrame.size.width - textX - 6, initialFrame.size.height - 4);
        _textView = [[NSTextView alloc] initWithFrame:textRect];
        _textView.delegate = self;
        _textView.font = [NSFont systemFontOfSize:_fontSize weight:NSFontWeightMedium];
        _textView.textColor = (toolType == ToolTag || textStyle == TextStyleFilled) ? [NSColor whiteColor] : color;
        _textView.backgroundColor = [NSColor clearColor];
        _textView.drawsBackground = NO;
        _textView.richText = NO;
        _textView.importsGraphics = NO;
        _textView.allowsUndo = YES;
        _textView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
        CGFloat initPadY = MAX(2.0, (initialH - (_fontSize * 1.35)) / 2.0);
        _textView.textContainerInset = NSMakeSize(0, initPadY);
        [self addSubview:_textView];
    }
    return self;
}

- (void)drawRect:(NSRect)dirtyRect {
    [super drawRect:dirtyRect];
}

- (void)textDidChange:(NSNotification *)notification {
    // Symmetrical Vertical Expansion (Centering around _centerPoint.y):
    // "换行都应该以中间为中心，向上下两边各自延伸相同距离，哪有只往上延伸的道理，编辑完成展示也是一样。"
    NSString *str = _textView.string;
    NSDictionary *attrs = @{ NSFontAttributeName: _textView.font };
    NSSize size = [str sizeWithAttributes:attrs];

    CGFloat leftPad = (_toolType == ToolStepNote) ? 36.0 : 8.0;
    CGFloat targetW = MAX((_toolType == ToolStepNote) ? 110.0 : 80.0, ceil(size.width) + leftPad + 18.0);
    targetW = MIN(targetW, _maxAllowedWidth);

    NSArray *lines = [str componentsSeparatedByString:@"\n"];
    NSInteger lineCount = MAX(1, lines.count);
    CGFloat lineHeight = _fontSize * 1.35;
    CGFloat targetH = MAX(30.0, lineCount * lineHeight + 8.0);

    // Expand UP and DOWN by the exact same distance from _centerPoint.y!
    NSRect f = self.frame;
    f.origin.y = _centerPoint.y - targetH / 2.0;
    f.size.width = targetW;
    f.size.height = targetH;
    self.frame = f;

    // Center step badge vertically inside the card
    if (_stepBadge) {
        NSRect bFrame = _stepBadge.frame;
        bFrame.origin.y = (targetH - 22.0) / 2.0;
        _stepBadge.frame = bFrame;
    }

    CGFloat padY = MAX(2.0, (targetH - (lineCount * lineHeight)) / 2.0);
    _textView.textContainerInset = NSMakeSize(0, padY);
}

- (BOOL)textView:(NSTextView *)textView doCommandBySelector:(SEL)commandSelector {
    if (commandSelector == @selector(insertNewline:)) {
        // Enter inserts newline!
        [textView insertText:@"\n" replacementRange:textView.selectedRange];
        [self textDidChange:[NSNotification notificationWithName:NSTextDidChangeNotification object:textView]];
        return YES;
    }
    if (commandSelector == @selector(cancelOperation:)) {
        if (_onCancel) _onCancel();
        return YES;
    }
    return NO;
}

- (void)commit {
    NSString *txt = [_textView.string stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    if (txt.length > 0 && _onCommit) {
        _onCommit(txt, _toolType, _textStyle, _centerPoint, _stepNumber, _fontSize);
    }
}

@end

#pragma mark - Pin Window & In-Place Annotation Editing

@class PinContentView;
@class PinEditToolbarView;

#pragma mark - Pin Window & In-Place Secondary Annotation Editing

@interface PinPanel : NSPanel
@property (nonatomic, strong) NSString *pinId;
@property (nonatomic, strong) PinContentView *pinView;
@property (nonatomic, strong) NSPanel *editToolbarPanel;
@end

@interface PinContentView : NSView
@property (nonatomic, strong) NSImage *image;
@property (nonatomic, strong) NSString *pinId;
@property (nonatomic, strong) NSString *imagePath;
@property (nonatomic, assign) NSSize originalImageSize;
@property (nonatomic, assign) CGFloat zoomLevel;
@property (nonatomic, strong) NSVisualEffectView *toolbarView;
@property (nonatomic, strong) NSTextField *zoomLabel;
@property (nonatomic, strong) HoverButton *pinCopyBtn;
@property (nonatomic, strong) NSTrackingArea *trackingArea;

// 8-Direction Resizing & Dragging
@property (nonatomic, assign) HandleHitType activeDragHandle;
@property (nonatomic, assign) NSPoint dragStartMouseLoc;
@property (nonatomic, assign) NSRect initialWindowFrame;

// In-place Editing state
@property (nonatomic, assign) BOOL isEditing;
@property (nonatomic, strong) PinEditToolbarView *editToolbarView;
@property (nonatomic, strong) NSMutableArray<AnnotationItem *> *pinAnnotations;
@property (nonatomic, strong) AnnotationItem *pinCurrentDrawingItem;
@property (nonatomic, assign) AnnotationToolType pinActiveTool;
@property (nonatomic, assign) AnnotationTextStyle pinActiveTextStyle;
@property (nonatomic, strong) NSColor *pinActiveColor;
@property (nonatomic, assign) CGFloat pinActiveLineWidth;
@property (nonatomic, assign) CGFloat pinActiveFontSize;
@property (nonatomic, assign) NSInteger pinCurrentStep;
@property (nonatomic, assign) BOOL pinIsWatermarkActive;
@property (nonatomic, strong) NSString *pinWatermarkText;
@property (nonatomic, strong) AnnotationInlineEditorView *pinInlineEditor;

- (instancetype)initWithFrame:(NSRect)frame image:(NSImage *)img path:(NSString *)path pinId:(NSString *)pid;
- (void)updateToolbarPosition;
- (void)updateEditToolbarPosition;
- (void)resetZoomAction;
- (void)toggleEditMode;
- (void)showEditToolbar;
- (void)hideEditToolbar;
- (void)undoPinAnnotation;
- (void)commitEditAnnotations;
- (void)cancelEditAnnotations;
- (void)closePinAction;
- (void)copyImageAction;
- (void)saveImageAction;
- (void)renderPinAnnotation:(AnnotationItem *)item;
- (void)renderPinWatermarkInRect:(NSRect)bounds;
- (void)renderPinTagNotchForEditor:(AnnotationInlineEditorView *)editor;
@end

static NSMutableDictionary<NSString *, PinPanel *> *gPanels = nil;

@implementation PinPanel
- (BOOL)canBecomeKeyWindow { return YES; }
- (BOOL)canBecomeMainWindow { return NO; }

- (void)keyDown:(NSEvent *)event {
    if (event.keyCode == 53) { // Escape key
        if (self.pinView.isEditing) {
            [self.pinView cancelEditAnnotations];
        } else {
            [self.pinView closePinAction];
        }
        return;
    }
    [super keyDown:event];
}

- (void)magnifyWithEvent:(NSEvent *)event {
    if (self.pinView) {
        [self.pinView magnifyWithEvent:event];
    } else {
        [super magnifyWithEvent:event];
    }
}

- (void)sendEvent:(NSEvent *)event {
    if (event.type == NSEventTypeMagnify) {
        if (self.pinView) {
            [self.pinView magnifyWithEvent:event];
            return;
        }
    }
    [super sendEvent:event];
}
@end

#pragma mark - Pin In-Place Floating Toolbar View

@interface PinEditToolbarView : NSView <NSTextFieldDelegate>
@property (nonatomic, weak) PinContentView *pinContentView;
@property (nonatomic, strong) NSVisualEffectView *primaryBar;
@property (nonatomic, strong) NSVisualEffectView *secondaryBar;
@property (nonatomic, strong) NSMutableArray<HoverButton *> *primaryButtons;
@property (nonatomic, strong) NSMutableArray<NSButton *> *colorButtons;
@property (nonatomic, strong) NSMutableArray<NSButton *> *sizeButtons;
@property (nonatomic, strong) NSMutableArray<NSButton *> *styleButtons;
@property (nonatomic, strong) NSMutableArray<HoverButton *> *presetPills;
@property (nonatomic, strong) NSTextField *watermarkInputField;
@property (nonatomic, strong) HoverButton *undoButton;
@property (nonatomic, strong) HoverButton *watermarkCheckBtn;
@property (nonatomic, assign) AnnotationToolType activeTool;
@property (nonatomic, assign) AnnotationToolType lastSecondaryTool;
@property (nonatomic, assign) CGFloat totalHeight;

- (instancetype)initWithPinContentView:(PinContentView *)pinView;
- (void)rebuildSecondaryToolbar;
- (void)selectTool:(AnnotationToolType)tool button:(HoverButton *)sender;
@end

@implementation PinEditToolbarView

- (instancetype)initWithPinContentView:(PinContentView *)pinView {
    NSRect f = NSMakeRect(0, 0, 720, 48);
    self = [super initWithFrame:f];
    if (self) {
        _pinContentView = pinView;
        _primaryButtons = [NSMutableArray array];
        _colorButtons = [NSMutableArray array];
        _sizeButtons = [NSMutableArray array];
        _styleButtons = [NSMutableArray array];
        _presetPills = [NSMutableArray array];
        _activeTool = ToolRect;
        _lastSecondaryTool = ToolRect;
        _totalHeight = 48.0;

        self.wantsLayer = YES;

        [self setupPrimaryToolbar];
        [self setupSecondaryToolbar];
        [self rebuildSecondaryToolbar];
    }
    return self;
}

- (void)setupPrimaryToolbar {
    CGFloat barW = 700.0;
    _primaryBar = [[NSVisualEffectView alloc] initWithFrame:NSMakeRect((720.0 - barW) / 2.0, 0, barW, 48)];
    if (@available(macOS 10.14, *)) {
        _primaryBar.material = AppTheme.currentTheme.isDark ? NSVisualEffectMaterialHUDWindow : NSVisualEffectMaterialToolTip;
    }
    _primaryBar.blendingMode = NSVisualEffectBlendingModeWithinWindow;
    _primaryBar.state = NSVisualEffectStateActive;
    _primaryBar.wantsLayer = YES;
    _primaryBar.layer.cornerRadius = 10.0;
    _primaryBar.layer.masksToBounds = YES;
    _primaryBar.layer.borderWidth = 1.0;
    _primaryBar.layer.borderColor = [AppTheme.currentTheme.toolbarBorderColor CGColor];
    _primaryBar.layer.backgroundColor = [AppTheme.currentTheme.toolbarBgColor CGColor];

    NSArray *iconIds = @[
        @"grip", @"rect", @"circle", @"line", @"arrow", @"tag",
        @"text", @"pencil", @"step", @"stepNote", @"mosaic", @"highlight",
        @"marker", @"watermark", @"undo", @"save", @"close", @"confirm"
    ];
    NSArray *tipKeys = @[
        @"toolbarDrag", @"rect", @"circle", @"line", @"arrow", @"tag",
        @"text", @"pencil", @"step", @"stepNote", @"mosaic", @"highlight",
        @"marker", @"watermark", @"undo", @"save", @"close", @"confirm"
    ];

    CGFloat curX = 6.0;
    for (NSInteger i = 0; i < iconIds.count; i++) {
        if (i == 14) {
            NSBox *sep = [[NSBox alloc] initWithFrame:NSMakeRect(curX + 2, 11, 1, 26)];
            sep.boxType = NSBoxSeparator;
            [_primaryBar addSubview:sep];
            curX += 9.0;
        }

        CGFloat btnW = (i == 0) ? 16.0 : 36.0;
        HoverButton *btn = [[HoverButton alloc] initWithFrame:NSMakeRect(curX, 6, btnW, 36)];
        btn.title = @"";
        btn.toolTip = [I18N tr:tipKeys[i]];
        btn.tag = i;
        btn.target = self;
        btn.action = @selector(primaryButtonAction:);
        btn.customHoverColor = AppTheme.currentTheme.buttonHoverColor;
        btn.customActiveBgColor = AppTheme.currentTheme.buttonActiveBgColor;

        NSImage *icon = getSvgIcon(iconIds[i]);
        btn.image = icon;
        btn.imagePosition = NSImageOnly;
        btn.imageScaling = NSImageScaleProportionallyDown;
        if (@available(macOS 10.14, *)) {
            btn.contentTintColor = (i == 17) ? [NSColor colorWithSRGBRed:0.19 green:0.76 blue:0.36 alpha:1.0] :
                                   (i == 16) ? [NSColor colorWithSRGBRed:0.96 green:0.29 blue:0.27 alpha:1.0] :
                                   AppTheme.currentTheme.textColor;
        }

        if (i == 1) { // Default Rect tool selected
            btn.isSelected = YES;
            if (@available(macOS 10.14, *)) {
                btn.contentTintColor = [NSColor colorWithSRGBRed:0.20 green:0.43 blue:0.96 alpha:1.0];
            }
        }

        if (i == 14) {
            _undoButton = btn;
            _undoButton.enabled = NO;
        }

        [_primaryButtons addObject:btn];
        [_primaryBar addSubview:btn];
        curX += btnW + 2.0;
    }

    [self addSubview:_primaryBar];
}

- (void)setupSecondaryToolbar {
    _secondaryBar = [[NSVisualEffectView alloc] initWithFrame:NSMakeRect((720.0 - 520.0) / 2.0, 54, 520, 44)];
    if (@available(macOS 10.14, *)) {
        _secondaryBar.material = AppTheme.currentTheme.isDark ? NSVisualEffectMaterialHUDWindow : NSVisualEffectMaterialToolTip;
    }
    _secondaryBar.blendingMode = NSVisualEffectBlendingModeWithinWindow;
    _secondaryBar.state = NSVisualEffectStateActive;
    _secondaryBar.wantsLayer = YES;
    _secondaryBar.layer.cornerRadius = 8.0;
    _secondaryBar.layer.masksToBounds = YES;
    _secondaryBar.layer.borderWidth = 1.0;
    _secondaryBar.layer.borderColor = [AppTheme.currentTheme.toolbarBorderColor CGColor];
    _secondaryBar.layer.backgroundColor = [AppTheme.currentTheme.toolbarBgColor CGColor];
    [self addSubview:_secondaryBar];
}

- (void)primaryButtonAction:(HoverButton *)sender {
    NSInteger tag = sender.tag;
    switch (tag) {
        case 0: break; // Grip
        case 1: [self selectTool:ToolRect button:sender]; break;
        case 2: [self selectTool:ToolCircle button:sender]; break;
        case 3: [self selectTool:ToolLine button:sender]; break;
        case 4: [self selectTool:ToolArrow button:sender]; break;
        case 5: [self selectTool:ToolTag button:sender]; break;
        case 6: [self selectTool:ToolText button:sender]; break;
        case 7: [self selectTool:ToolPencil button:sender]; break;
        case 8: [self selectTool:ToolStep button:sender]; break;
        case 9: [self selectTool:ToolStepNote button:sender]; break;
        case 10: [self selectTool:ToolMosaic button:sender]; break;
        case 11: [self selectTool:ToolHighlight button:sender]; break;
        case 12: [self selectTool:ToolMarker button:sender]; break;
        case 13: [self selectTool:ToolWatermark button:sender]; break;
        case 14: [_pinContentView undoPinAnnotation]; break;
        case 15: [_pinContentView saveImageAction]; break;
        case 16: [_pinContentView cancelEditAnnotations]; break;
        case 17: [_pinContentView commitEditAnnotations]; break;
        default: break;
    }
}

- (void)selectTool:(AnnotationToolType)tool button:(HoverButton *)sender {
    if (_activeTool == tool) {
        _activeTool = ToolNone;
        _pinContentView.pinActiveTool = ToolNone;
        sender.isSelected = NO;
        if (@available(macOS 10.14, *)) {
            sender.contentTintColor = [NSColor whiteColor];
        }
    } else {
        _activeTool = tool;
        _lastSecondaryTool = tool;
        _pinContentView.pinActiveTool = tool;
        for (HoverButton *btn in _primaryButtons) {
            if (btn.tag >= 1 && btn.tag <= 13) {
                BOOL isTarget = (btn == sender);
                btn.isSelected = isTarget;
                if (@available(macOS 10.14, *)) {
                    btn.contentTintColor = isTarget ? [NSColor colorWithSRGBRed:0.20 green:0.43 blue:0.96 alpha:1.0] : [NSColor whiteColor];
                }
            }
        }
    }

    [self rebuildSecondaryToolbar];
    [_pinContentView updateEditToolbarPosition];
    [_pinContentView setNeedsDisplay:YES];
}

- (void)rebuildSecondaryToolbar {
    for (NSView *sub in [_secondaryBar.subviews copy]) {
        [sub removeFromSuperview];
    }
    [_sizeButtons removeAllObjects];
    [_styleButtons removeAllObjects];
    [_presetPills removeAllObjects];
    [_colorButtons removeAllObjects];

    AnnotationToolType tool = (_activeTool != ToolNone) ? _activeTool : _lastSecondaryTool;
    if (tool == ToolNone && !_pinContentView.pinIsWatermarkActive) {
        _secondaryBar.hidden = YES;
        _totalHeight = 48.0;
        return;
    }

    _secondaryBar.hidden = NO;
    _totalHeight = 100.0;
    CGFloat optX = 8.0;

    // 1. Text / StepNote Options: 3 Styles + 3 Font Sizes
    if (tool == ToolText || tool == ToolStepNote) {
        NSArray *styleTitles = @[@"T", @"■T", @"□T"];
        NSArray *styleTips = @[[I18N tr:@"textNormal"], [I18N tr:@"textFilled"], [I18N tr:@"textBordered"]];
        for (NSInteger s = 0; s < 3; s++) {
            HoverButton *sBtn = [[HoverButton alloc] initWithFrame:NSMakeRect(optX, 6, 32, 26)];
            sBtn.title = styleTitles[s];
            sBtn.toolTip = styleTips[s];
            sBtn.font = [NSFont systemFontOfSize:12 weight:NSFontWeightBold];
            sBtn.wantsLayer = YES;
            sBtn.layer.cornerRadius = 4.0;
            BOOL isSel = (_pinContentView.pinActiveTextStyle == s);
            sBtn.layer.borderWidth = isSel ? 1.5 : 0.5;
            sBtn.layer.borderColor = isSel ? [[NSColor colorWithSRGBRed:0.20 green:0.43 blue:0.96 alpha:1.0] CGColor] : [[NSColor colorWithWhite:1.0 alpha:0.18] CGColor];
            sBtn.tag = s;
            sBtn.target = self;
            sBtn.action = @selector(textStyleAction:);
            [_styleButtons addObject:sBtn];
            [_secondaryBar addSubview:sBtn];
            optX += 36.0;
        }

        NSArray *fSizes = @[@"12pt", @"14pt", @"18pt"];
        for (NSInteger f = 0; f < 3; f++) {
            HoverButton *fBtn = [[HoverButton alloc] initWithFrame:NSMakeRect(optX, 6, 38, 26)];
            fBtn.title = fSizes[f];
            fBtn.font = [NSFont systemFontOfSize:11 weight:NSFontWeightMedium];
            fBtn.tag = f;
            fBtn.target = self;
            fBtn.action = @selector(fontSizeAction:);
            [_secondaryBar addSubview:fBtn];
            optX += 40.0;
        }

        NSBox *sSep = [[NSBox alloc] initWithFrame:NSMakeRect(optX + 2, 8, 1, 22)];
        sSep.boxType = NSBoxSeparator;
        [_secondaryBar addSubview:sSep];
        optX += 10.0;
    }
    // 2. Watermark Tool Settings: Compact Native Checkbox + 4 Presets + Input Field
    else if (tool == ToolWatermark || (_pinContentView.pinIsWatermarkActive && _activeTool == ToolNone)) {
        HoverButton *chkBtn = [[HoverButton alloc] initWithFrame:NSMakeRect(optX, 11, 16, 16)];
        BOOL active = _pinContentView.pinIsWatermarkActive;
        chkBtn.title = active ? @"✓" : @"";
        chkBtn.font = [NSFont systemFontOfSize:11 weight:NSFontWeightBold];
        if (@available(macOS 10.14, *)) {
            chkBtn.contentTintColor = [NSColor whiteColor];
        }
        chkBtn.wantsLayer = YES;
        chkBtn.layer.cornerRadius = 3.5;
        chkBtn.layer.borderWidth = active ? 0.0 : 1.2;
        chkBtn.layer.borderColor = [[NSColor colorWithWhite:1.0 alpha:0.35] CGColor];
        chkBtn.customNormalBgColor = active ? [NSColor colorWithSRGBRed:0.20 green:0.43 blue:0.96 alpha:1.0] : [NSColor colorWithWhite:1.0 alpha:0.06];
        chkBtn.customHoverColor = active ? [NSColor colorWithSRGBRed:0.30 green:0.52 blue:0.98 alpha:1.0] : [NSColor colorWithWhite:1.0 alpha:0.18];
        chkBtn.toolTip = [I18N tr:@"enableWatermark"];
        chkBtn.target = self;
        chkBtn.action = @selector(toggleWatermarkCheckboxAction:);
        _watermarkCheckBtn = chkBtn;
        [_secondaryBar addSubview:chkBtn];
        optX += 16.0 + 8.0;

        NSBox *chkSep = [[NSBox alloc] initWithFrame:NSMakeRect(optX, 8, 1, 22)];
        chkSep.boxType = NSBoxSeparator;
        [_secondaryBar addSubview:chkSep];
        optX += 8.0;

        NSArray *presets = @[[I18N tr:@"wmInternalOnly"], [I18N tr:@"wmConfidential"], [I18N tr:@"wmForReview"], [I18N tr:@"wmBrand"]];
        for (NSInteger p = 0; p < presets.count; p++) {
            CGFloat pillW = [presets[p] sizeWithAttributes:@{NSFontAttributeName: [NSFont systemFontOfSize:11 weight:NSFontWeightMedium]}].width + 16.0;
            HoverButton *pBtn = [[HoverButton alloc] initWithFrame:NSMakeRect(optX, 6, pillW, 26)];
            pBtn.title = presets[p];
            pBtn.font = [NSFont systemFontOfSize:11 weight:NSFontWeightMedium];
            pBtn.wantsLayer = YES;
            pBtn.layer.cornerRadius = 4.0;
            BOOL isActivePreset = [_pinContentView.pinWatermarkText isEqualToString:presets[p]];
            pBtn.layer.borderWidth = isActivePreset ? 1.5 : 0.5;
            pBtn.layer.borderColor = isActivePreset ? [[NSColor colorWithSRGBRed:0.20 green:0.43 blue:0.96 alpha:1.0] CGColor] : [[NSColor colorWithWhite:1.0 alpha:0.18] CGColor];
            pBtn.customNormalBgColor = isActivePreset ? [NSColor colorWithSRGBRed:0.20 green:0.43 blue:0.96 alpha:0.25] : [NSColor colorWithWhite:1.0 alpha:0.08];
            pBtn.tag = p;
            pBtn.target = self;
            pBtn.action = @selector(watermarkPresetAction:);
            [_presetPills addObject:pBtn];
            [_secondaryBar addSubview:pBtn];
            optX += pillW + 4.0;
        }

        _watermarkInputField = [[NSTextField alloc] initWithFrame:NSMakeRect(optX, 6, 130, 26)];
        VerticallyCenteredTextFieldCell *wmCell = [[VerticallyCenteredTextFieldCell alloc] initTextCell:@""];
        wmCell.scrollable = YES;
        wmCell.editable = YES;
        wmCell.verticalOffset = 0.5;
        _watermarkInputField.cell = wmCell;
        _watermarkInputField.bezeled = NO;
        _watermarkInputField.drawsBackground = YES;
        _watermarkInputField.backgroundColor = AppTheme.currentTheme.inputBgColor;
        _watermarkInputField.textColor = AppTheme.currentTheme.textColor;
        _watermarkInputField.font = [NSFont systemFontOfSize:11];
        NSMutableAttributedString *wmPh = [[NSMutableAttributedString alloc] initWithString:[I18N tr:@"watermarkCustomPlaceholder"]];
        [wmPh addAttributes:@{ NSForegroundColorAttributeName: AppTheme.currentTheme.secondaryTextColor } range:NSMakeRange(0, wmPh.length)];
        _watermarkInputField.placeholderAttributedString = wmPh;
        _watermarkInputField.stringValue = _pinContentView.pinWatermarkText ?: @"";
        _watermarkInputField.wantsLayer = YES;
        _watermarkInputField.layer.cornerRadius = 4.0;
        _watermarkInputField.layer.borderWidth = 1.0;
        _watermarkInputField.layer.borderColor = [AppTheme.currentTheme.inputBorderColor CGColor];
        _watermarkInputField.delegate = self;
        _watermarkInputField.target = self;
        _watermarkInputField.action = @selector(watermarkCustomInputChanged:);
        [_secondaryBar addSubview:_watermarkInputField];
        optX += 136.0;

        NSBox *sSep = [[NSBox alloc] initWithFrame:NSMakeRect(optX + 2, 8, 1, 22)];
        sSep.boxType = NSBoxSeparator;
        [_secondaryBar addSubview:sSep];
        optX += 10.0;
    }
    // 3. Shapes & Stroke Widths: 3 Dot Sizes (NO "But" text!)
    else if (tool == ToolRect || tool == ToolCircle || tool == ToolLine || tool == ToolArrow || tool == ToolPencil || tool == ToolHighlight || tool == ToolMarker || tool == ToolMosaic) {
        CGFloat dotRadii[] = { 3.0, 5.0, 7.5 };
        for (NSInteger s = 0; s < 3; s++) {
            HoverButton *sBtn = [[HoverButton alloc] initWithFrame:NSMakeRect(optX, 6, 26, 26)];
            sBtn.title = @""; // Explicitly clear title
            sBtn.wantsLayer = YES;
            sBtn.layer.cornerRadius = 13.0;
            sBtn.layer.borderWidth = (s == 1) ? 1.5 : 0.0;
            sBtn.layer.borderColor = [[NSColor whiteColor] CGColor];
            sBtn.tag = s;
            sBtn.target = self;
            sBtn.action = @selector(strokeSizeAction:);

            CALayer *dotLayer = [CALayer layer];
            CGFloat r = dotRadii[s];
            dotLayer.frame = CGRectMake((26 - r * 2) / 2.0, (26 - r * 2) / 2.0, r * 2, r * 2);
            dotLayer.cornerRadius = r;
            dotLayer.backgroundColor = [[NSColor whiteColor] CGColor];
            [sBtn.layer addSublayer:dotLayer];

            [_sizeButtons addObject:sBtn];
            [_secondaryBar addSubview:sBtn];
            optX += 30.0;
        }

        NSBox *sSep = [[NSBox alloc] initWithFrame:NSMakeRect(optX + 2, 8, 1, 22)];
        sSep.boxType = NSBoxSeparator;
        [_secondaryBar addSubview:sSep];
        optX += 10.0;
    }

    // 4. Color Swatches (NO "But" text & Fixed Background!)
    if (tool != ToolMosaic) {
        NSArray *colors = @[
            [NSColor colorWithSRGBRed:0.96 green:0.29 blue:0.27 alpha:1.0], // #f64b45 Red
            [NSColor colorWithSRGBRed:1.00 green:0.78 blue:0.05 alpha:1.0], // #ffc60c Yellow
            [NSColor colorWithSRGBRed:0.20 green:0.75 blue:0.29 alpha:1.0], // #34be4b Green
            [NSColor colorWithSRGBRed:0.20 green:0.43 blue:0.96 alpha:1.0], // #336df4 Blue
            [NSColor colorWithSRGBRed:0.12 green:0.14 blue:0.16 alpha:1.0], // #1f2329 Black
            [NSColor colorWithSRGBRed:0.56 green:0.58 blue:0.62 alpha:1.0], // #8f959e Gray
            [NSColor whiteColor]                                            // #ffffff White
        ];

        for (NSInteger c = 0; c < colors.count; c++) {
            HoverButton *cBtn = [[HoverButton alloc] initWithFrame:NSMakeRect(optX, 7, 24, 24)];
            cBtn.title = @""; // Clear title!
            cBtn.fixedBgColor = colors[c]; // Fixed background color! NEVER disappears on hover!
            cBtn.wantsLayer = YES;
            cBtn.layer.cornerRadius = 6.0;
            cBtn.layer.backgroundColor = [colors[c] CGColor];
            cBtn.layer.borderWidth = (c == 6) ? 1.0 : 0.5;
            cBtn.layer.borderColor = (c == 6) ? [[NSColor colorWithWhite:0.4 alpha:0.6] CGColor] : [[NSColor clearColor] CGColor];
            cBtn.tag = c;
            cBtn.target = self;
            cBtn.action = @selector(colorPickAction:);

            if ([colors[c] isEqual:_pinContentView.pinActiveColor]) {
                cBtn.title = @"✓";
                cBtn.font = [NSFont systemFontOfSize:13 weight:NSFontWeightBold];
                if (@available(macOS 10.14, *)) {
                    cBtn.contentTintColor = (c == 1 || c == 6) ? [NSColor blackColor] : [NSColor whiteColor];
                }
            }

            [_colorButtons addObject:cBtn];
            [_secondaryBar addSubview:cBtn];
            optX += 28.0;
        }
    }

    NSRect soFrame = _secondaryBar.frame;
    soFrame.size.width = optX + 8.0;
    _secondaryBar.frame = soFrame;

    [self layoutBarsWithPositionIsBelow:YES];
    [_pinContentView updateEditToolbarPosition];
}

- (void)layoutBarsWithPositionIsBelow:(BOOL)isBelow {
    CGFloat maxChildW = MAX(_primaryBar.frame.size.width, _secondaryBar.frame.size.width);
    CGFloat neededW = maxChildW + 20.0;
    self.frame = NSMakeRect(0, 0, neededW, _totalHeight);

    if (_secondaryBar.hidden) {
        _primaryBar.frame = NSMakeRect((neededW - _primaryBar.frame.size.width) / 2.0, 0, _primaryBar.frame.size.width, 48.0);
    } else if (isBelow) {
        // Toolbar is BELOW pin window: Primary bar at top (closest to pin), Secondary bar below it
        _primaryBar.frame = NSMakeRect((neededW - _primaryBar.frame.size.width) / 2.0, 50.0, _primaryBar.frame.size.width, 48.0);
        _secondaryBar.frame = NSMakeRect((neededW - _secondaryBar.frame.size.width) / 2.0, 0, _secondaryBar.frame.size.width, 44.0);
    } else {
        // Toolbar is ABOVE pin window: Primary bar at bottom (closest to pin), Secondary bar above it
        _primaryBar.frame = NSMakeRect((neededW - _primaryBar.frame.size.width) / 2.0, 0, _primaryBar.frame.size.width, 48.0);
        _secondaryBar.frame = NSMakeRect((neededW - _secondaryBar.frame.size.width) / 2.0, 54.0, _secondaryBar.frame.size.width, 44.0);
    }
}

- (void)updateWatermarkUIState {
    NSArray *presets = @[[I18N tr:@"wmInternalOnly"], [I18N tr:@"wmConfidential"], [I18N tr:@"wmForReview"], [I18N tr:@"wmBrand"]];
    NSString *current = _watermarkInputField.stringValue ?: _pinContentView.pinWatermarkText;

    BOOL active = _pinContentView.pinIsWatermarkActive;
    _watermarkCheckBtn.title = active ? @"✓" : @"";
    _watermarkCheckBtn.layer.borderWidth = active ? 0.0 : 1.2;
    _watermarkCheckBtn.layer.borderColor = active ? [AppTheme.currentTheme.accentColor CGColor] : [AppTheme.currentTheme.toolbarBorderColor CGColor];
    _watermarkCheckBtn.customNormalBgColor = active ? AppTheme.currentTheme.accentColor : AppTheme.currentTheme.inputBgColor;
    _watermarkCheckBtn.customHoverColor = active ? [AppTheme.currentTheme.accentColor blendedColorWithFraction:0.2 ofColor:[NSColor whiteColor]] : AppTheme.currentTheme.buttonHoverColor;
    [_watermarkCheckBtn updateAppearance];

    for (NSInteger p = 0; p < _presetPills.count && p < presets.count; p++) {
        HoverButton *pill = _presetPills[p];
        BOOL isMatch = [current isEqualToString:presets[p]];
        pill.isSelected = isMatch;
        pill.layer.borderWidth = isMatch ? 1.5 : 0.5;
        pill.layer.borderColor = isMatch ? [AppTheme.currentTheme.accentColor CGColor] : [AppTheme.currentTheme.toolbarBorderColor CGColor];
        pill.customNormalBgColor = isMatch ? [AppTheme.currentTheme.accentColor colorWithAlphaComponent:0.25] : AppTheme.currentTheme.inputBgColor;
        pill.customHoverColor = AppTheme.currentTheme.buttonHoverColor;
        NSMutableParagraphStyle *style = [[NSMutableParagraphStyle alloc] init];
        style.alignment = NSTextAlignmentCenter;
        pill.attributedTitle = [[NSAttributedString alloc] initWithString:pill.title ?: @"" attributes:@{
            NSForegroundColorAttributeName: isMatch ? AppTheme.currentTheme.accentColor : AppTheme.currentTheme.textColor,
            NSFontAttributeName: [NSFont systemFontOfSize:11 weight:isMatch ? NSFontWeightBold : NSFontWeightMedium],
            NSParagraphStyleAttributeName: style
        }];
        [pill updateAppearance];
    }
}

- (void)textStyleAction:(NSButton *)sender {
    _pinContentView.pinActiveTextStyle = (AnnotationTextStyle)sender.tag;
    for (NSButton *btn in _styleButtons) {
        btn.layer.borderWidth = (btn == sender) ? 1.5 : 0.5;
        btn.layer.borderColor = (btn == sender) ? [[NSColor colorWithSRGBRed:0.20 green:0.43 blue:0.96 alpha:1.0] CGColor] : [[NSColor colorWithWhite:1.0 alpha:0.18] CGColor];
    }
}

- (void)fontSizeAction:(NSButton *)sender {
    CGFloat sizes[] = { 12.0, 14.0, 18.0 };
    _pinContentView.pinActiveFontSize = sizes[sender.tag];
}

- (void)strokeSizeAction:(NSButton *)sender {
    CGFloat strokeMap[] = { 2.0, 4.0, 8.0 };
    _pinContentView.pinActiveLineWidth = strokeMap[sender.tag];
    for (NSButton *btn in _sizeButtons) {
        btn.layer.borderWidth = (btn == sender) ? 1.5 : 0.0;
    }
}

- (void)colorPickAction:(NSButton *)sender {
    NSArray *colors = @[
        [NSColor colorWithSRGBRed:0.96 green:0.29 blue:0.27 alpha:1.0],
        [NSColor colorWithSRGBRed:1.00 green:0.78 blue:0.05 alpha:1.0],
        [NSColor colorWithSRGBRed:0.20 green:0.75 blue:0.29 alpha:1.0],
        [NSColor colorWithSRGBRed:0.20 green:0.43 blue:0.96 alpha:1.0],
        [NSColor colorWithSRGBRed:0.12 green:0.14 blue:0.16 alpha:1.0],
        [NSColor colorWithSRGBRed:0.56 green:0.58 blue:0.62 alpha:1.0],
        [NSColor whiteColor]
    ];
    _pinContentView.pinActiveColor = colors[sender.tag];

    for (NSButton *btn in _colorButtons) {
        if (btn == sender) {
            btn.title = @"✓";
            btn.font = [NSFont systemFontOfSize:13 weight:NSFontWeightBold];
            if (@available(macOS 10.14, *)) {
                btn.contentTintColor = (btn.tag == 1 || btn.tag == 6) ? [NSColor blackColor] : [NSColor whiteColor];
            }
        } else {
            btn.title = @"";
        }
    }
}

- (void)toggleWatermarkCheckboxAction:(NSButton *)sender {
    _pinContentView.pinIsWatermarkActive = !_pinContentView.pinIsWatermarkActive;
    [self updateWatermarkUIState];
    [_pinContentView setNeedsDisplay:YES];
}

- (void)watermarkPresetAction:(NSButton *)sender {
    NSArray *presets = @[[I18N tr:@"wmInternalOnly"], [I18N tr:@"wmConfidential"], [I18N tr:@"wmForReview"], [I18N tr:@"wmBrand"]];
    if (sender.tag < presets.count) {
        _pinContentView.pinWatermarkText = presets[sender.tag];
        _pinContentView.pinIsWatermarkActive = YES;
        if (_watermarkInputField) {
            _watermarkInputField.stringValue = _pinContentView.pinWatermarkText;
        }
        [self updateWatermarkUIState];
        [_pinContentView setNeedsDisplay:YES];
    }
}

- (void)controlTextDidChange:(NSNotification *)notification {
    if (notification.object == _watermarkInputField) {
        _pinContentView.pinWatermarkText = _watermarkInputField.stringValue;
        _pinContentView.pinIsWatermarkActive = YES;
        [self updateWatermarkUIState];
        [_pinContentView setNeedsDisplay:YES];
    }
}

- (void)watermarkCustomInputChanged:(NSTextField *)sender {
    _pinContentView.pinWatermarkText = [sender.stringValue stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
    _pinContentView.pinIsWatermarkActive = YES;
    [self updateWatermarkUIState];
    [_pinContentView setNeedsDisplay:YES];
}
@end

#pragma mark - Pin ContentView Implementation

@implementation PinContentView

- (instancetype)initWithFrame:(NSRect)frame image:(NSImage *)img path:(NSString *)path pinId:(NSString *)pid {
    self = [super initWithFrame:frame];
    if (self) {
        _image = img;
        _imagePath = [path copy];
        _pinId = [pid copy];
        _originalImageSize = img.size;
        _zoomLevel = 1.0;
        _isEditing = NO;
        _pinAnnotations = [NSMutableArray array];
        _pinActiveTool = ToolNone;
        _pinActiveTextStyle = TextStyleNormal;
        _pinActiveColor = [NSColor colorWithSRGBRed:0.96 green:0.29 blue:0.27 alpha:1.0];
        _pinActiveLineWidth = 4.0;
        _pinActiveFontSize = 14.0;
        _pinCurrentStep = 1;
        _pinWatermarkText = [I18N tr:@"wmInternalOnly"];
        _pinIsWatermarkActive = NO;

        self.wantsLayer = YES;
        self.layer.masksToBounds = YES;
        self.layer.cornerRadius = 8.0;
        self.layer.borderWidth = 1.0;
        self.layer.borderColor = [AppTheme.currentTheme.toolbarBorderColor CGColor];
        self.layer.backgroundColor = [AppTheme.currentTheme.bgColor CGColor];

        [self setupToolbar];
    }
    return self;
}

- (void)setupToolbar {
    // Lark Top-Right Hover Capsule Toolbar: Zoom % | 1:1 | Edit ✏️ | Copy 📋 | Save 💾 | Close ✕
    _toolbarView = [[NSVisualEffectView alloc] initWithFrame:NSMakeRect(0, 0, 244, 34)];
    if (@available(macOS 10.14, *)) {
        _toolbarView.material = AppTheme.currentTheme.isDark ? NSVisualEffectMaterialHUDWindow : NSVisualEffectMaterialToolTip;
    }
    _toolbarView.blendingMode = NSVisualEffectBlendingModeWithinWindow;
    _toolbarView.state = NSVisualEffectStateActive;
    _toolbarView.wantsLayer = YES;
    _toolbarView.layer.cornerRadius = 8.0;
    _toolbarView.layer.masksToBounds = YES;
    _toolbarView.layer.borderWidth = 1.0;
    _toolbarView.layer.borderColor = [AppTheme.currentTheme.toolbarBorderColor CGColor];
    _toolbarView.layer.backgroundColor = [AppTheme.currentTheme.toolbarBgColor CGColor];
    _toolbarView.alphaValue = 0.0;

    CGFloat curX = 6.0;

    // Zoom % label
    _zoomLabel = [[NSTextField alloc] initWithFrame:NSMakeRect(curX, 7, 44, 20)];
    _zoomLabel.bezeled = NO;
    _zoomLabel.drawsBackground = NO;
    _zoomLabel.textColor = AppTheme.currentTheme.textColor;
    _zoomLabel.font = [NSFont monospacedDigitSystemFontOfSize:11 weight:NSFontWeightMedium];
    _zoomLabel.alignment = NSTextAlignmentCenter;
    _zoomLabel.stringValue = @"100%";
    _zoomLabel.editable = NO;
    _zoomLabel.selectable = NO;
    [_toolbarView addSubview:_zoomLabel];
    curX += 46.0;

    // 1:1 Reset Zoom button
    HoverButton *resetBtn = [[HoverButton alloc] initWithFrame:NSMakeRect(curX, 4, 30, 26)];
    resetBtn.title = @"1:1";
    resetBtn.font = [NSFont systemFontOfSize:11 weight:NSFontWeightBold];
    resetBtn.toolTip = [I18N tr:@"zoomReset"];
    resetBtn.customHoverColor = AppTheme.currentTheme.buttonHoverColor;
    resetBtn.target = self;
    resetBtn.action = @selector(resetZoomAction);
    [_toolbarView addSubview:resetBtn];
    curX += 32.0;

    // Separator
    NSBox *sep = [[NSBox alloc] initWithFrame:NSMakeRect(curX, 7, 1, 20)];
    sep.boxType = NSBoxSeparator;
    [_toolbarView addSubview:sep];
    curX += 6.0;

    // Action buttons: 0: Edit, 1: Copy, 2: Save, 3: Close
    NSArray *iconIds   = @[@"edit", @"copy", @"save", @"close"];
    NSArray *tipsKeys  = @[@"editImage", @"copyImage", @"saveImage", @"closePin"];

    for (NSInteger i = 0; i < 4; i++) {
        HoverButton *btn = [[HoverButton alloc] initWithFrame:NSMakeRect(curX, 4, 30, 26)];
        btn.title = @"";
        btn.toolTip = [I18N tr:tipsKeys[i]];
        btn.tag = i;
        btn.target = self;
        btn.action = @selector(toolbarButtonAction:);
        btn.customHoverColor = AppTheme.currentTheme.buttonHoverColor;

        NSImage *icon = getSvgIcon(iconIds[i]);
        btn.image = icon;
        btn.imagePosition = NSImageOnly;
        btn.imageScaling = NSImageScaleProportionallyDown;
        if (@available(macOS 10.14, *)) {
            btn.contentTintColor = (i == 3) ? [NSColor colorWithSRGBRed:0.95 green:0.32 blue:0.32 alpha:1.0] : AppTheme.currentTheme.textColor;
        }

        if (i == 1) {
            _pinCopyBtn = btn;
        }

        [_toolbarView addSubview:btn];
        curX += 32.0;
    }

    NSRect tbFrame = _toolbarView.frame;
    tbFrame.size.width = curX + 4.0;
    _toolbarView.frame = tbFrame;
    _toolbarView.autoresizingMask = NSViewMinXMargin | NSViewMinYMargin;

    [self addSubview:_toolbarView];
}

- (void)updateToolbarPosition {
    NSRect bounds = self.bounds;
    NSRect tbFrame = _toolbarView.frame;
    tbFrame.origin.x = bounds.size.width - tbFrame.size.width - 10.0;
    tbFrame.origin.y = bounds.size.height - tbFrame.size.height - 10.0;
    _toolbarView.frame = tbFrame;
}

- (void)layout {
    [super layout];
    [self updateToolbarPosition];
    if (_isEditing) {
        [self updateEditToolbarPosition];
    }
}

- (void)setFrame:(NSRect)frame {
    [super setFrame:frame];
    [self updateToolbarPosition];
    if (_isEditing) {
        [self updateEditToolbarPosition];
    }
}

- (void)resetCursorRects {
    [super resetCursorRects];
    if (_isEditing && _pinActiveTool != ToolNone) {
        [self addCursorRect:self.bounds cursor:[NSCursor crosshairCursor]];
        return;
    }

    NSRect b = self.bounds;
    CGFloat c = 18.0;
    CGFloat m = 10.0;
    if (b.size.width < c * 2 || b.size.height < c * 2) return;

    // 4 Corners: Exact match with hitTestPinEdges
    [self addCursorRect:NSMakeRect(0, b.size.height - c, c, c) cursor:nwseCursor()];
    [self addCursorRect:NSMakeRect(b.size.width - c, b.size.height - c, c, c) cursor:neswCursor()];
    [self addCursorRect:NSMakeRect(b.size.width - c, 0, c, c) cursor:nwseCursor()];
    [self addCursorRect:NSMakeRect(0, 0, c, c) cursor:neswCursor()];

    // 4 Edges: Exact match with hitTestPinEdges
    [self addCursorRect:NSMakeRect(c, b.size.height - m, b.size.width - 2 * c, m) cursor:[NSCursor resizeUpDownCursor]];
    [self addCursorRect:NSMakeRect(c, 0, b.size.width - 2 * c, m) cursor:[NSCursor resizeUpDownCursor]];
    [self addCursorRect:NSMakeRect(0, c, m, b.size.height - 2 * c) cursor:[NSCursor resizeLeftRightCursor]];
    [self addCursorRect:NSMakeRect(b.size.width - m, c, m, b.size.height - 2 * c) cursor:[NSCursor resizeLeftRightCursor]];
}

- (void)updateTrackingAreas {
    [super updateTrackingAreas];
    if (_trackingArea) {
        [self removeTrackingArea:_trackingArea];
    }
    _trackingArea = [[NSTrackingArea alloc] initWithRect:self.bounds
                                                 options:(NSTrackingMouseEnteredAndExited |
                                                          NSTrackingMouseMoved |
                                                          NSTrackingActiveAlways |
                                                          NSTrackingInVisibleRect)
                                                   owner:self
                                                userInfo:nil];
    [self addTrackingArea:_trackingArea];
}

- (void)mouseEntered:(NSEvent *)event {
    [NSAnimationContext runAnimationGroup:^(NSAnimationContext *ctx) {
        ctx.duration = 0.12;
        self->_toolbarView.animator.alphaValue = 1.0;
    }];
    [self.window makeKeyWindow];
    [self.window makeFirstResponder:self];
    NSPoint loc = [self convertPoint:event.locationInWindow fromView:nil];
    [self updateCursorForPoint:loc];
}

- (void)updateCursorForPoint:(NSPoint)loc {
    if (!NSPointInRect(loc, self.bounds)) {
        [[NSCursor arrowCursor] set];
        return;
    }

    if (!_toolbarView.hidden && _toolbarView.alphaValue > 0.05 && NSPointInRect(loc, _toolbarView.frame)) {
        NSPoint pInToolbar = [_toolbarView convertPoint:loc fromView:self];
        NSView *hitSub = [_toolbarView hitTest:pInToolbar];
        if (hitSub && hitSub != _toolbarView) {
            [[NSCursor pointingHandCursor] set];
            return;
        }
    }

    HandleHitType hit = [self hitTestPinEdges:loc];

    switch (hit) {
        case HitTopLeft:
        case HitBottomRight:
            [nwseCursor() set];
            break;
        case HitTopRight:
        case HitBottomLeft:
            [neswCursor() set];
            break;
        case HitTop:
        case HitBottom:
            [[NSCursor resizeUpDownCursor] set];
            break;
        case HitLeft:
        case HitRight:
            [[NSCursor resizeLeftRightCursor] set];
            break;
        default:
            if (_isEditing && _pinActiveTool != ToolNone) {
                [[NSCursor crosshairCursor] set];
            } else {
                [[NSCursor arrowCursor] set];
            }
            break;
    }
}

- (void)mouseMoved:(NSEvent *)event {
    if (_toolbarView.alphaValue < 0.99) {
        _toolbarView.alphaValue = 1.0;
    }

    NSPoint loc = [self convertPoint:event.locationInWindow fromView:nil];
    [self updateCursorForPoint:loc];
}

- (void)mouseExited:(NSEvent *)event {
    if (!_isEditing) {
        [NSAnimationContext runAnimationGroup:^(NSAnimationContext *ctx) {
            ctx.duration = 0.2;
            self->_toolbarView.animator.alphaValue = 0.0;
        }];
    }
    [[NSCursor arrowCursor] set];
}

- (HandleHitType)hitTestPinEdges:(NSPoint)pt {
    NSRect b = self.bounds;
    // Strictly inside window bounds only:
    if (!NSPointInRect(pt, b)) {
        return HitNone;
    }

    CGFloat c = 18.0;
    CGFloat m = 10.0;

    // 4 Corners: Exact match with resetCursorRects
    if (pt.x < c && pt.y >= b.size.height - c) return HitTopLeft;
    if (pt.x >= b.size.width - c && pt.y >= b.size.height - c) return HitTopRight;
    if (pt.x >= b.size.width - c && pt.y < c) return HitBottomRight;
    if (pt.x < c && pt.y < c) return HitBottomLeft;

    // 4 Edges: Exact match with resetCursorRects
    if (pt.y >= b.size.height - m) return HitTop;
    if (pt.y < m) return HitBottom;
    if (pt.x < m) return HitLeft;
    if (pt.x >= b.size.width - m) return HitRight;

    return HitInside;
}

- (NSView *)hitTest:(NSPoint)point {
    if (!NSPointInRect(point, self.bounds)) {
        return nil;
    }
    return [super hitTest:point];
}

- (void)mouseDown:(NSEvent *)event {
    [self.window makeKeyWindow];
    [self.window makeFirstResponder:self];

    NSPoint loc = [self convertPoint:event.locationInWindow fromView:nil];
    if (!NSPointInRect(loc, self.bounds)) {
        return;
    }

    // Priority 1: Check edge/corner resizing FIRST!
    HandleHitType hit = [self hitTestPinEdges:loc];
    if (hit != HitInside && hit != HitNone) {
        _activeDragHandle = hit;
        _dragStartMouseLoc = [NSEvent mouseLocation];
        _initialWindowFrame = self.window.frame;
        return;
    }

    // Priority 2: If top-right toolbar button clicked
    if (!_toolbarView.hidden && _toolbarView.alphaValue > 0.05 && NSPointInRect(loc, _toolbarView.frame)) {
        NSPoint pInToolbar = [_toolbarView convertPoint:loc fromView:self];
        NSView *hitSub = [_toolbarView hitTest:pInToolbar];
        if (hitSub && hitSub != _toolbarView) {
            return; // Clicked an actual button on the toolbar!
        }
        // Clicked toolbar empty space: fall through to window moving!
    }

    if (_pinInlineEditor) {
        [self commitPinInlineEditor];
    }

    if (_isEditing && _pinActiveTool != ToolNone) {
        [self startPinAnnotationAtPoint:loc];
        return;
    }

    // Window moving (inside body)
    _activeDragHandle = HitInside;
    _dragStartMouseLoc = [NSEvent mouseLocation];
    _initialWindowFrame = self.window.frame;
}

- (void)mouseDragged:(NSEvent *)event {
    if (_isEditing && _pinCurrentDrawingItem) {
        NSPoint loc = [self convertPoint:event.locationInWindow fromView:nil];
        [self updatePinAnnotationAtPoint:loc];
        [self setNeedsDisplay:YES];
        return;
    }

    NSPoint currentLoc = [NSEvent mouseLocation];
    CGFloat dx = currentLoc.x - _dragStartMouseLoc.x;
    CGFloat dy = currentLoc.y - _dragStartMouseLoc.y;
    NSWindow *win = self.window;

    if (_activeDragHandle == HitInside) {
        NSRect f = _initialWindowFrame;
        f.origin.x += dx;
        f.origin.y += dy;
        [win setFrameOrigin:f.origin];
        return;
    }

    // 8-Direction Resizing strictly preserving aspect ratio
    if (_activeDragHandle >= HitTopLeft && _activeDragHandle <= HitLeft) {
        CGFloat aspect = (_originalImageSize.width > 0 && _originalImageSize.height > 0) ? (_originalImageSize.width / _originalImageSize.height) : (self.bounds.size.width / MAX(1.0, self.bounds.size.height));
        CGFloat minToolbarW = _toolbarView.frame.size.width + 24.0;
        CGFloat minToolbarH = _toolbarView.frame.size.height + 24.0;
        CGFloat minW = MAX(minToolbarW, 80.0);
        CGFloat minH = minW / aspect;
        if (minH < MAX(minToolbarH, 60.0)) { minH = MAX(minToolbarH, 60.0); minW = minH * aspect; }

        NSScreen *screen = self.window.screen ?: [NSScreen mainScreen];
        NSRect screenF = screen.visibleFrame;
        CGFloat maxW = screenF.size.width;
        CGFloat maxH = screenF.size.height;
        if (maxW / aspect > maxH) { maxW = maxH * aspect; } else { maxH = maxW / aspect; }

        NSRect r = _initialWindowFrame;
        CGFloat newW = r.size.width;
        CGFloat newH = r.size.height;
        CGFloat fixedRight = r.origin.x + r.size.width;
        CGFloat fixedTop = r.origin.y + r.size.height;
        CGFloat fixedCenterX = r.origin.x + r.size.width / 2.0;
        CGFloat fixedCenterY = r.origin.y + r.size.height / 2.0;

        switch (_activeDragHandle) {
            case HitRight: {
                newW = MAX(minW, MIN(maxW, r.size.width + dx));
                newH = round(newW / aspect);
                newW = round(newH * aspect);
                r.size = NSMakeSize(newW, newH);
                r.origin.y = round(fixedCenterY - newH / 2.0);
                break;
            }
            case HitLeft: {
                newW = MAX(minW, MIN(maxW, r.size.width - dx));
                newH = round(newW / aspect);
                newW = round(newH * aspect);
                r.size = NSMakeSize(newW, newH);
                r.origin.x = fixedRight - newW;
                r.origin.y = round(fixedCenterY - newH / 2.0);
                break;
            }
            case HitTop: {
                newH = MAX(minH, MIN(maxH, r.size.height + dy));
                newW = round(newH * aspect);
                newH = round(newW / aspect);
                r.size = NSMakeSize(newW, newH);
                r.origin.x = round(fixedCenterX - newW / 2.0);
                break;
            }
            case HitBottom: {
                newH = MAX(minH, MIN(maxH, r.size.height - dy));
                newW = round(newH * aspect);
                newH = round(newW / aspect);
                r.size = NSMakeSize(newW, newH);
                r.origin.x = round(fixedCenterX - newW / 2.0);
                r.origin.y = fixedTop - newH;
                break;
            }
            case HitTopRight: {
                CGFloat dW_x = dx;
                CGFloat dW_y = dy * aspect;
                CGFloat delta = (fabs(dW_x) >= fabs(dW_y)) ? dW_x : dW_y;
                newW = MAX(minW, MIN(maxW, r.size.width + delta));
                newH = round(newW / aspect);
                newW = round(newH * aspect);
                r.size = NSMakeSize(newW, newH);
                break;
            }
            case HitBottomRight: {
                CGFloat dW_x = dx;
                CGFloat dW_y = -dy * aspect;
                CGFloat delta = (fabs(dW_x) >= fabs(dW_y)) ? dW_x : dW_y;
                newW = MAX(minW, MIN(maxW, r.size.width + delta));
                newH = round(newW / aspect);
                newW = round(newH * aspect);
                r.size = NSMakeSize(newW, newH);
                r.origin.y = fixedTop - newH;
                break;
            }
            case HitTopLeft: {
                CGFloat dW_x = -dx;
                CGFloat dW_y = dy * aspect;
                CGFloat delta = (fabs(dW_x) >= fabs(dW_y)) ? dW_x : dW_y;
                newW = MAX(minW, MIN(maxW, r.size.width + delta));
                newH = round(newW / aspect);
                newW = round(newH * aspect);
                r.size = NSMakeSize(newW, newH);
                r.origin.x = fixedRight - newW;
                break;
            }
            case HitBottomLeft: {
                CGFloat dW_x = -dx;
                CGFloat dW_y = -dy * aspect;
                CGFloat delta = (fabs(dW_x) >= fabs(dW_y)) ? dW_x : dW_y;
                newW = MAX(minW, MIN(maxW, r.size.width + delta));
                newH = round(newW / aspect);
                newW = round(newH * aspect);
                r.size = NSMakeSize(newW, newH);
                r.origin.x = fixedRight - newW;
                r.origin.y = fixedTop - newH;
                break;
            }
            default: break;
        }

        [win setFrame:r display:YES animate:NO];
        _zoomLevel = r.size.width / MAX(1.0, _originalImageSize.width);
        _zoomLabel.stringValue = [NSString stringWithFormat:@"%.0f%%", _zoomLevel * 100.0];
        [self updateToolbarPosition];
        if (_isEditing) [self updateEditToolbarPosition];
        [win invalidateCursorRectsForView:self];
    }
}

- (void)mouseUp:(NSEvent *)event {
    if (_isEditing && _pinCurrentDrawingItem) {
        [self finishPinAnnotation];
        [self setNeedsDisplay:YES];
    }
    _activeDragHandle = HitNone;
}

- (void)scrollWheel:(NSEvent *)event {
    CGFloat delta = event.scrollingDeltaY;
    if (fabs(delta) < 0.1) return;

    CGFloat factor = (delta > 0) ? 1.05 : 0.95;
    CGFloat aspect = (_originalImageSize.width > 0 && _originalImageSize.height > 0) ? (_originalImageSize.width / _originalImageSize.height) : (self.bounds.size.width / MAX(1.0, self.bounds.size.height));
    CGFloat minToolbarW = _toolbarView.frame.size.width + 24.0;
    CGFloat minToolbarH = _toolbarView.frame.size.height + 24.0;
    CGFloat minW = MAX(minToolbarW, 80.0);
    CGFloat minH = minW / aspect;
    if (minH < MAX(minToolbarH, 60.0)) { minH = MAX(minToolbarH, 60.0); minW = minH * aspect; }

    NSScreen *screen = self.window.screen ?: [NSScreen mainScreen];
    NSRect screenF = screen.visibleFrame;
    CGFloat maxW = screenF.size.width;
    CGFloat maxH = screenF.size.height;
    if (maxW / aspect > maxH) { maxW = maxH * aspect; } else { maxH = maxW / aspect; }

    NSRect oldF = self.window.frame;
    CGFloat targetW = oldF.size.width * factor;
    targetW = MAX(minW, MIN(maxW, targetW));
    CGFloat newW = round(targetW);
    CGFloat newH = round(newW / aspect);
    newW = round(newH * aspect);

    NSPoint mouseScreen = [NSEvent mouseLocation];
    CGFloat newOriginX, newOriginY;
    if (NSPointInRect(mouseScreen, oldF)) {
        CGFloat rx = (mouseScreen.x - oldF.origin.x) / oldF.size.width;
        CGFloat ry = (mouseScreen.y - oldF.origin.y) / oldF.size.height;
        newOriginX = round(mouseScreen.x - rx * newW);
        newOriginY = round(mouseScreen.y - ry * newH);
    } else {
        CGFloat cx = oldF.origin.x + oldF.size.width / 2.0;
        CGFloat cy = oldF.origin.y + oldF.size.height / 2.0;
        newOriginX = round(cx - newW / 2.0);
        newOriginY = round(cy - newH / 2.0);
    }

    NSRect newF = NSMakeRect(newOriginX, newOriginY, newW, newH);
    [self.window setFrame:newF display:YES animate:NO];

    _zoomLevel = newW / MAX(1.0, _originalImageSize.width);
    _zoomLabel.stringValue = [NSString stringWithFormat:@"%.0f%%", _zoomLevel * 100.0];
    [self updateToolbarPosition];
    if (_isEditing) [self updateEditToolbarPosition];
    [self.window invalidateCursorRectsForView:self];
}

- (void)magnifyWithEvent:(NSEvent *)event {
    CGFloat mag = event.magnification;
    if (fabs(mag) < 0.0005) return;

    CGFloat factor = 1.0 + mag;
    CGFloat aspect = (_originalImageSize.width > 0 && _originalImageSize.height > 0) ? (_originalImageSize.width / _originalImageSize.height) : (self.bounds.size.width / MAX(1.0, self.bounds.size.height));
    CGFloat minToolbarW = _toolbarView.frame.size.width + 24.0;
    CGFloat minToolbarH = _toolbarView.frame.size.height + 24.0;
    CGFloat minW = MAX(minToolbarW, 80.0);
    CGFloat minH = minW / aspect;
    if (minH < MAX(minToolbarH, 60.0)) { minH = MAX(minToolbarH, 60.0); minW = minH * aspect; }

    NSScreen *screen = self.window.screen ?: [NSScreen mainScreen];
    NSRect screenF = screen.visibleFrame;
    CGFloat maxW = screenF.size.width;
    CGFloat maxH = screenF.size.height;
    if (maxW / aspect > maxH) { maxW = maxH * aspect; } else { maxH = maxW / aspect; }

    NSRect oldF = self.window.frame;
    CGFloat targetW = oldF.size.width * factor;
    targetW = MAX(minW, MIN(maxW, targetW));
    CGFloat newW = round(targetW);
    CGFloat newH = round(newW / aspect);
    newW = round(newH * aspect);

    NSPoint mouseScreen = [NSEvent mouseLocation];
    CGFloat newOriginX, newOriginY;
    if (NSPointInRect(mouseScreen, oldF)) {
        CGFloat rx = (mouseScreen.x - oldF.origin.x) / oldF.size.width;
        CGFloat ry = (mouseScreen.y - oldF.origin.y) / oldF.size.height;
        newOriginX = round(mouseScreen.x - rx * newW);
        newOriginY = round(mouseScreen.y - ry * newH);
    } else {
        CGFloat cx = oldF.origin.x + oldF.size.width / 2.0;
        CGFloat cy = oldF.origin.y + oldF.size.height / 2.0;
        newOriginX = round(cx - newW / 2.0);
        newOriginY = round(cy - newH / 2.0);
    }

    NSRect newF = NSMakeRect(newOriginX, newOriginY, newW, newH);
    [self.window setFrame:newF display:YES animate:NO];

    _zoomLevel = newW / MAX(1.0, _originalImageSize.width);
    _zoomLabel.stringValue = [NSString stringWithFormat:@"%.0f%%", _zoomLevel * 100.0];
    [self updateToolbarPosition];
    if (_isEditing) [self updateEditToolbarPosition];
    [self.window invalidateCursorRectsForView:self];
}

- (void)resetZoomAction {
    _zoomLevel = 1.0;
    CGFloat aspect = (_originalImageSize.width > 0 && _originalImageSize.height > 0) ? (_originalImageSize.width / _originalImageSize.height) : (self.bounds.size.width / MAX(1.0, self.bounds.size.height));
    CGFloat minW = MAX(240.0, 44.0 * aspect);
    CGFloat minH = minW / aspect;
    if (minH < 44.0) { minH = 44.0; minW = minH * aspect; }

    NSScreen *screen = self.window.screen ?: [NSScreen mainScreen];
    NSRect screenF = screen.visibleFrame;
    CGFloat maxW = screenF.size.width;
    CGFloat maxH = screenF.size.height;
    if (maxW / aspect > maxH) { maxW = maxH * aspect; } else { maxH = maxW / aspect; }

    CGFloat targetW = _originalImageSize.width;
    targetW = MAX(minW, MIN(maxW, targetW));
    CGFloat targetH = targetW / aspect;

    NSRect oldF = self.window.frame;
    CGFloat cx = oldF.origin.x + oldF.size.width / 2.0;
    CGFloat cy = oldF.origin.y + oldF.size.height / 2.0;
    NSRect newF = NSMakeRect(cx - targetW / 2.0, cy - targetH / 2.0, targetW, targetH);
    [self.window setFrame:newF display:YES animate:NO];

    _zoomLabel.stringValue = @"100%";
    [self updateToolbarPosition];
    if (_isEditing) [self updateEditToolbarPosition];
}

- (void)toolbarButtonAction:(NSButton *)sender {
    switch (sender.tag) {
        case 0: [self toggleEditMode]; break;
        case 1: [self copyImageAction]; break;
        case 2: [self saveImageAction]; break;
        case 3: [self closePinAction]; break;
        default: break;
    }
}

- (void)toggleEditMode {
    if (_isEditing) {
        [self cancelEditAnnotations];
        return;
    }
    _isEditing = YES;
    _pinActiveTool = ToolRect;
    _toolbarView.alphaValue = 1.0;
    [self showEditToolbar];
    [self setNeedsDisplay:YES];
}

- (void)showEditToolbar {
    PinPanel *panel = gPanels[_pinId];
    if (!panel) return;

    if (!panel.editToolbarPanel) {
        _editToolbarView = [[PinEditToolbarView alloc] initWithPinContentView:self];
        CGFloat tbW = _editToolbarView.bounds.size.width;
        CGFloat tbH = _editToolbarView.totalHeight;
        NSRect winF = self.window.frame;
        NSScreen *screen = self.window.screen ?: [NSScreen mainScreen];
        NSRect screenF = screen.visibleFrame;

        CGFloat x = winF.origin.x + (winF.size.width - tbW) / 2.0;
        CGFloat y = winF.origin.y - tbH - 8.0;
        if (y < screenF.origin.y + 10.0) {
            y = winF.origin.y + winF.size.height + 8.0;
        }
        if (x < screenF.origin.x + 8.0) x = screenF.origin.x + 8.0;
        if (x + tbW > screenF.origin.x + screenF.size.width - 8.0) x = screenF.origin.x + screenF.size.width - tbW - 8.0;

        NSPanel *tbPanel = [[NSPanel alloc] initWithContentRect:NSMakeRect(x, y, tbW, tbH)
                                                      styleMask:NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel
                                                        backing:NSBackingStoreBuffered
                                                          defer:NO];
        tbPanel.level = panel.level + 1;
        tbPanel.backgroundColor = [NSColor clearColor];
        tbPanel.opaque = NO;
        tbPanel.hasShadow = YES;

        tbPanel.contentView = _editToolbarView;
        panel.editToolbarPanel = tbPanel;
        [panel addChildWindow:tbPanel ordered:NSWindowAbove];
    }
    [self updateEditToolbarPosition];
    [panel.editToolbarPanel orderFrontRegardless];
}

- (void)hideEditToolbar {
    PinPanel *panel = gPanels[_pinId];
    if (panel && panel.editToolbarPanel) {
        [panel.editToolbarPanel orderOut:nil];
        [panel removeChildWindow:panel.editToolbarPanel];
        panel.editToolbarPanel = nil;
        _editToolbarView = nil;
    }
}

- (void)updateEditToolbarPosition {
    PinPanel *panel = gPanels[_pinId];
    if (!panel || !panel.editToolbarPanel || !_editToolbarView) return;

    NSRect winF = self.window.frame;
    NSScreen *screen = self.window.screen ?: [NSScreen mainScreen];
    NSRect screenF = screen.visibleFrame;

    CGFloat tbW = _editToolbarView.bounds.size.width;
    CGFloat tbH = _editToolbarView.totalHeight;
    CGFloat x = winF.origin.x + (winF.size.width - tbW) / 2.0;
    CGFloat y = winF.origin.y - tbH - 8.0;
    BOOL isBelow = YES;
    if (y < screenF.origin.y + 10.0) {
        y = winF.origin.y + winF.size.height + 8.0;
        isBelow = NO;
    }
    if (x < screenF.origin.x + 8.0) x = screenF.origin.x + 8.0;
    if (x + tbW > screenF.origin.x + screenF.size.width - 8.0) x = screenF.origin.x + screenF.size.width - tbW - 8.0;

    [_editToolbarView layoutBarsWithPositionIsBelow:isBelow];
    [panel.editToolbarPanel setFrame:NSMakeRect(x, y, tbW, tbH) display:YES];
}

- (void)undoPinAnnotation {
    [self commitPinInlineEditor];
    if (_pinAnnotations.count > 0) {
        [_pinAnnotations removeLastObject];
        [_editToolbarView.undoButton setEnabled:(_pinAnnotations.count > 0)];
        [self setNeedsDisplay:YES];
    }
}

- (void)commitEditAnnotations {
    [self commitPinInlineEditor];

    if (_pinAnnotations.count > 0 || _pinIsWatermarkActive) {
        NSSize imgSize = _originalImageSize;
        if (imgSize.width <= 0 || imgSize.height <= 0) {
            imgSize = self.bounds.size;
        }

        NSImage *composite = [[NSImage alloc] initWithSize:imgSize];
        [composite lockFocus];

        [_image drawInRect:NSMakeRect(0, 0, imgSize.width, imgSize.height)
                  fromRect:NSZeroRect
                 operation:NSCompositingOperationCopy
                  fraction:1.0];

        CGFloat scaleX = imgSize.width / MAX(1.0, self.bounds.size.width);
        CGFloat scaleY = imgSize.height / MAX(1.0, self.bounds.size.height);

        NSAffineTransform *trans = [NSAffineTransform transform];
        [trans scaleXBy:scaleX yBy:scaleY];
        [trans concat];

        if (_pinIsWatermarkActive) {
            [self renderPinWatermarkInRect:self.bounds];
        }

        for (AnnotationItem *item in _pinAnnotations) {
            [self renderPinAnnotation:item];
        }

        [composite unlockFocus];
        _image = composite;
        _originalImageSize = composite.size;

        if (_imagePath && [[NSFileManager defaultManager] fileExistsAtPath:_imagePath]) {
            NSBitmapImageRep *rep = [NSBitmapImageRep imageRepWithData:[composite TIFFRepresentation]];
            NSData *pngData = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
            [pngData writeToFile:_imagePath atomically:YES];
        }

        sendEvent(@{ @"event": @"annotated", @"pinId": _pinId ?: @"", @"imagePath": _imagePath ?: @"" });
    }

    [self cancelEditAnnotations];
}

- (void)cancelEditAnnotations {
    [self cancelPinInlineEditor];
    [_pinAnnotations removeAllObjects];
    _pinCurrentDrawingItem = nil;
    _isEditing = NO;
    _pinActiveTool = ToolNone;
    [self hideEditToolbar];
    [self setNeedsDisplay:YES];
}

- (void)closePinAction {
    [self hideEditToolbar];
    PinPanel *panel = gPanels[_pinId];
    if (panel) {
        [panel close];
        [gPanels removeObjectForKey:_pinId];
        sendEvent(@{ @"event": @"closed", @"pinId": _pinId });
    }
}

- (void)copyImageAction {
    if (_image) {
        NSPasteboard *pb = [NSPasteboard generalPasteboard];
        [pb clearContents];
        [pb writeObjects:@[_image]];
        sendEvent(@{ @"event": @"copied", @"pinId": _pinId });

        NSString *oldTitle = _pinCopyBtn.title;
        NSImage *oldIcon = _pinCopyBtn.image;
        _pinCopyBtn.image = nil;
        _pinCopyBtn.title = @"✓";
        if (@available(macOS 10.14, *)) {
            _pinCopyBtn.contentTintColor = [NSColor colorWithSRGBRed:0.2 green:0.8 blue:0.4 alpha:1.0];
        }
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.2 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            self->_pinCopyBtn.image = oldIcon;
            self->_pinCopyBtn.title = oldTitle;
            if (@available(macOS 10.14, *)) {
                self->_pinCopyBtn.contentTintColor = [NSColor whiteColor];
            }
        });
    }
}

- (void)saveImageAction {
    if (!_image) return;
    NSSavePanel *savePanel = [NSSavePanel savePanel];
    if (@available(macOS 11.0, *)) {
        savePanel.allowedContentTypes = @[[UTType typeWithIdentifier:@"public.png"]];
    }
    savePanel.canCreateDirectories = YES;
    savePanel.nameFieldStringValue = [NSString stringWithFormat:@"%@.png", _pinId];
    [savePanel beginWithCompletionHandler:^(NSModalResponse result) {
        if (result == NSModalResponseOK && savePanel.URL) {
            NSURL *destURL = savePanel.URL;
            if (![destURL.path.lowercaseString hasSuffix:@".png"]) {
                destURL = [destURL URLByAppendingPathExtension:@"png"];
            }
            NSBitmapImageRep *rep = [NSBitmapImageRep imageRepWithData:[self->_image TIFFRepresentation]];
            NSData *pngData = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
            [pngData writeToURL:destURL atomically:YES];
            sendEvent(@{ @"event": @"saved", @"pinId": self->_pinId, @"path": destURL.path ?: @"" });
        }
    }];
}

#pragma mark - Pin Drawing & Rendering Logic

- (void)drawRect:(NSRect)dirtyRect {
    [super drawRect:dirtyRect];

    // Themed background matching current skin
    [AppTheme.currentTheme.bgColor setFill];
    NSBezierPath *bgPath = [NSBezierPath bezierPathWithRoundedRect:self.bounds xRadius:8.0 yRadius:8.0];
    [bgPath fill];

    if (_image) {
        [NSGraphicsContext saveGraphicsState];
        [bgPath addClip];
        [_image drawInRect:self.bounds fromRect:NSZeroRect operation:NSCompositingOperationSourceOver fraction:1.0];
        [NSGraphicsContext restoreGraphicsState];
    }

    if (_pinIsWatermarkActive) {
        [self renderPinWatermarkInRect:self.bounds];
    }

    for (AnnotationItem *item in _pinAnnotations) {
        [self renderPinAnnotation:item];
    }

    if (_pinCurrentDrawingItem) {
        [self renderPinAnnotation:_pinCurrentDrawingItem];
    }

    if (_pinInlineEditor && _pinInlineEditor.toolType == ToolTag) {
        [self renderPinTagNotchForEditor:_pinInlineEditor];
    }
}

- (void)renderPinWatermarkInRect:(NSRect)bounds {
    NSString *wm = (_pinWatermarkText.length > 0) ? _pinWatermarkText : [I18N tr:@"wmInternalOnly"];
    NSDictionary *attrs = @{
        NSFontAttributeName: [NSFont systemFontOfSize:15 weight:NSFontWeightBold],
        NSForegroundColorAttributeName: [NSColor colorWithWhite:1.0 alpha:0.22]
    };
    NSSize strSize = [wm sizeWithAttributes:attrs];

    NSGraphicsContext *gc = [NSGraphicsContext currentContext];
    CGContextRef ctx = gc.CGContext;
    CGContextSaveGState(ctx);

    for (CGFloat wy = bounds.origin.y - 100; wy < bounds.origin.y + bounds.size.height + 100; wy += 120.0) {
        for (CGFloat wx = bounds.origin.x - 100; wx < bounds.origin.x + bounds.size.width + 100; wx += 200.0) {
            CGContextSaveGState(ctx);
            CGContextTranslateCTM(ctx, wx, wy);
            CGContextRotateCTM(ctx, M_PI / 4.0);
            [wm drawAtPoint:NSMakePoint(-strSize.width / 2.0, -strSize.height / 2.0) withAttributes:attrs];
            CGContextRestoreGState(ctx);
        }
    }
    CGContextRestoreGState(ctx);
}

- (void)renderPinTagNotchForEditor:(AnnotationInlineEditorView *)editor {
    NSPoint anchor = editor.centerPoint;
    NSRect bubble = editor.frame;

    NSBezierPath *anchorDot = [NSBezierPath bezierPathWithOvalInRect:NSMakeRect(anchor.x - 4.5, anchor.y - 4.5, 9.0, 9.0)];
    [editor.activeColor setFill];
    [anchorDot fill];
    [[NSColor whiteColor] setStroke];
    anchorDot.lineWidth = 1.5;
    [anchorDot stroke];

    NSBezierPath *notch = [NSBezierPath bezierPath];
    [notch moveToPoint:NSMakePoint(anchor.x + 5.0, anchor.y)];
    [notch lineToPoint:NSMakePoint(bubble.origin.x, anchor.y + 6.0)];
    [notch lineToPoint:NSMakePoint(bubble.origin.x, anchor.y - 6.0)];
    [notch closePath];
    [[NSColor colorWithSRGBRed:0.17 green:0.18 blue:0.23 alpha:0.96] setFill];
    [notch fill];
}

- (void)renderPinAnnotation:(AnnotationItem *)item {
    [item.color setStroke];
    [item.color setFill];

    CGFloat x = MIN(item.startPoint.x, item.endPoint.x);
    CGFloat y = MIN(item.startPoint.y, item.endPoint.y);
    CGFloat w = fabs(item.startPoint.x - item.endPoint.x);
    CGFloat h = fabs(item.startPoint.y - item.endPoint.y);
    NSRect r = NSMakeRect(x, y, w, h);

    switch (item.toolType) {
        case ToolRect: {
            NSBezierPath *path = [NSBezierPath bezierPathWithRoundedRect:r xRadius:4.0 yRadius:4.0];
            path.lineWidth = item.lineWidth;
            [path stroke];
            break;
        }
        case ToolCircle: {
            NSBezierPath *path = [NSBezierPath bezierPathWithOvalInRect:r];
            path.lineWidth = item.lineWidth;
            [path stroke];
            break;
        }
        case ToolLine: {
            NSBezierPath *path = [NSBezierPath bezierPath];
            [path moveToPoint:item.startPoint];
            [path lineToPoint:item.endPoint];
            path.lineWidth = item.lineWidth;
            path.lineCapStyle = NSLineCapStyleRound;
            [path stroke];
            break;
        }
        case ToolArrow: {
            NSBezierPath *path = [NSBezierPath bezierPath];
            [path moveToPoint:item.startPoint];
            [path lineToPoint:item.endPoint];
            path.lineWidth = item.lineWidth;
            path.lineCapStyle = NSLineCapStyleRound;
            [path stroke];

            CGFloat angle = atan2(item.endPoint.y - item.startPoint.y, item.endPoint.x - item.startPoint.x);
            CGFloat arrowLen = 14.0 + item.lineWidth;
            CGFloat arrowAngle = M_PI / 6.0;

            NSPoint p1 = NSMakePoint(item.endPoint.x - arrowLen * cos(angle - arrowAngle),
                                     item.endPoint.y - arrowLen * sin(angle - arrowAngle));
            NSPoint p2 = NSMakePoint(item.endPoint.x - arrowLen * cos(angle + arrowAngle),
                                     item.endPoint.y - arrowLen * sin(angle + arrowAngle));

            NSBezierPath *head = [NSBezierPath bezierPath];
            [head moveToPoint:item.endPoint];
            [head lineToPoint:p1];
            [head lineToPoint:p2];
            [head closePath];
            [head fill];
            break;
        }
        case ToolPencil: {
            if (item.points.count < 2) break;
            NSBezierPath *path = [NSBezierPath bezierPath];
            path.lineWidth = item.lineWidth;
            path.lineCapStyle = NSLineCapStyleRound;
            path.lineJoinStyle = NSLineJoinStyleRound;
            [path moveToPoint:[item.points[0] pointValue]];
            for (NSUInteger i = 1; i < item.points.count; i++) {
                [path lineToPoint:[item.points[i] pointValue]];
            }
            [path stroke];
            break;
        }
        case ToolHighlight: {
            NSColor *tintColor = [item.color colorWithAlphaComponent:0.25];
            [tintColor setFill];
            NSBezierPath *box = [NSBezierPath bezierPathWithRoundedRect:r xRadius:4.0 yRadius:4.0];
            [box fill];
            [[item.color colorWithAlphaComponent:0.85] setStroke];
            box.lineWidth = 2.0;
            [box stroke];
            break;
        }
        case ToolMarker: {
            if (item.points.count < 2) break;
            [NSGraphicsContext saveGraphicsState];
            [[item.color colorWithAlphaComponent:0.38] setStroke];
            NSBezierPath *path = [NSBezierPath bezierPath];
            path.lineWidth = 18.0;
            path.lineCapStyle = NSLineCapStyleRound;
            path.lineJoinStyle = NSLineJoinStyleRound;
            [path moveToPoint:[item.points[0] pointValue]];
            for (NSUInteger i = 1; i < item.points.count; i++) {
                [path lineToPoint:[item.points[i] pointValue]];
            }
            [path stroke];
            [NSGraphicsContext restoreGraphicsState];
            break;
        }
        case ToolMosaic: {
            if (!_image || item.points.count == 0) break;
            NSGraphicsContext *gc = [NSGraphicsContext currentContext];
            CGContextRef ctx = gc.CGContext;
            CGContextSaveGState(ctx);

            CGMutablePathRef cgPath = CGPathCreateMutable();
            NSPoint pt0 = [item.points[0] pointValue];
            CGPathMoveToPoint(cgPath, NULL, pt0.x, pt0.y);
            for (NSUInteger i = 1; i < item.points.count; i++) {
                NSPoint pt = [item.points[i] pointValue];
                CGPathAddLineToPoint(cgPath, NULL, pt.x, pt.y);
            }

            CGContextAddPath(ctx, cgPath);
            CGPathRelease(cgPath);
            CGContextSetLineWidth(ctx, 26.0);
            CGContextSetLineCap(ctx, kCGLineCapRound);
            CGContextSetLineJoin(ctx, kCGLineJoinRound);
            CGContextReplacePathWithStrokedPath(ctx);
            CGContextClip(ctx);

            CGImageRef fullCG = [_image CGImageForProposedRect:NULL context:nil hints:nil];
            if (fullCG) {
                CGRect boundsCG = NSRectToCGRect(self.bounds);
                int blockW = MAX(4, (int)(boundsCG.size.width / 10.0));
                int blockH = MAX(4, (int)(boundsCG.size.height / 10.0));

                CGColorSpaceRef cs = CGColorSpaceCreateDeviceRGB();
                CGContextRef smallCtx = CGBitmapContextCreate(NULL, blockW, blockH, 8, blockW * 4,
                                                              cs, (CGBitmapInfo)kCGImageAlphaPremultipliedLast);
                if (smallCtx) {
                    CGContextSetInterpolationQuality(smallCtx, kCGInterpolationNone);
                    CGContextDrawImage(smallCtx, CGRectMake(0, 0, blockW, blockH), fullCG);
                    CGImageRef pixelated = CGBitmapContextCreateImage(smallCtx);
                    if (pixelated) {
                        CGContextSetInterpolationQuality(ctx, kCGInterpolationNone);
                        CGContextDrawImage(ctx, boundsCG, pixelated);
                        CGImageRelease(pixelated);
                    }
                    CGContextRelease(smallCtx);
                }
                CGColorSpaceRelease(cs);
            }
            CGContextRestoreGState(ctx);
            break;
        }
        case ToolTag: {
            if (!item.text || item.text.length == 0) break;

            NSPoint anchor = item.startPoint;
            CGFloat centerY = item.startPoint.y;

            NSArray *lines = [item.text componentsSeparatedByString:@"\n"];
            CGFloat fSize = item.fontSize ?: 14.0;
            NSDictionary *attrs = @{
                NSFontAttributeName: [NSFont systemFontOfSize:fSize weight:NSFontWeightMedium],
                NSForegroundColorAttributeName: [NSColor whiteColor]
            };

            CGFloat maxTextW = 0;
            for (NSString *l in lines) {
                NSSize s = [l sizeWithAttributes:attrs];
                if (s.width > maxTextW) maxTextW = s.width;
            }

            CGFloat lineHeight = fSize * 1.35;
            CGFloat totalTextH = lines.count * lineHeight;
            CGFloat bW = MAX(42.0, maxTextW + 20.0);
            CGFloat bH = MAX(28.0, totalTextH + 10.0);

            CGFloat bubbleX = anchor.x + 14.0;
            CGFloat bubbleY = centerY - bH / 2.0;
            NSRect bubbleRect = NSMakeRect(bubbleX, bubbleY, bW, bH);

            NSBezierPath *anchorDot = [NSBezierPath bezierPathWithOvalInRect:NSMakeRect(anchor.x - 4.5, centerY - 4.5, 9.0, 9.0)];
            [item.color setFill];
            [anchorDot fill];
            [[NSColor whiteColor] setStroke];
            anchorDot.lineWidth = 1.5;
            [anchorDot stroke];

            NSBezierPath *notch = [NSBezierPath bezierPath];
            [notch moveToPoint:NSMakePoint(anchor.x + 5.0, centerY)];
            [notch lineToPoint:NSMakePoint(bubbleX, centerY + 6.0)];
            [notch lineToPoint:NSMakePoint(bubbleX, centerY - 6.0)];
            [notch closePath];
            [[NSColor colorWithSRGBRed:0.17 green:0.18 blue:0.23 alpha:0.96] setFill];
            [notch fill];

            NSBezierPath *bubble = [NSBezierPath bezierPathWithRoundedRect:bubbleRect xRadius:6.0 yRadius:6.0];
            [[NSColor colorWithSRGBRed:0.17 green:0.18 blue:0.23 alpha:0.96] setFill];
            [bubble fill];

            NSFont *tagFont = [NSFont systemFontOfSize:fSize weight:NSFontWeightMedium];
            CGFloat firstLineY = (centerY + (lines.count - 1) * lineHeight / 2.0) - fabs(tagFont.descender) - (tagFont.capHeight / 2.0);
            for (NSInteger i = 0; i < lines.count; i++) {
                NSString *l = lines[i];
                NSSize lSize = [l sizeWithAttributes:attrs];
                NSPoint p = NSMakePoint(bubbleX + (bW - lSize.width) / 2.0, firstLineY - i * lineHeight);
                [l drawAtPoint:p withAttributes:attrs];
            }
            break;
        }
        case ToolStep: {
            CGFloat radius = 11.0;
            NSRect circleRect = NSMakeRect(item.startPoint.x - radius, item.startPoint.y - radius, radius * 2, radius * 2);
            NSBezierPath *circle = [NSBezierPath bezierPathWithOvalInRect:circleRect];
            [item.color setFill];
            [circle fill];

            NSString *numStr = [NSString stringWithFormat:@"%ld", (long)item.stepNumber];
            NSFont *numFont = [NSFont systemFontOfSize:11 weight:NSFontWeightBold];
            NSDictionary *numAttrs = @{
                NSFontAttributeName: numFont,
                NSForegroundColorAttributeName: [NSColor whiteColor]
            };
            NSSize s = [numStr sizeWithAttributes:numAttrs];
            CGFloat glyphDrawY = item.startPoint.y - fabs(numFont.descender) - (numFont.capHeight / 2.0);
            NSPoint p = NSMakePoint(item.startPoint.x - s.width / 2.0, glyphDrawY);
            [numStr drawAtPoint:p withAttributes:numAttrs];
            break;
        }
        case ToolStepNote: {
            if (!item.text || item.text.length == 0) break;
            CGFloat centerY = item.startPoint.y;
            NSArray *lines = [item.text componentsSeparatedByString:@"\n"];
            CGFloat fSize = item.fontSize ?: 14.0;
            NSDictionary *attrs = @{
                NSFontAttributeName: [NSFont systemFontOfSize:fSize weight:NSFontWeightMedium],
                NSForegroundColorAttributeName: (item.textStyle == TextStyleFilled) ? [NSColor whiteColor] : item.color
            };

            CGFloat maxTextW = 0;
            for (NSString *l in lines) {
                NSSize s = [l sizeWithAttributes:attrs];
                if (s.width > maxTextW) maxTextW = s.width;
            }

            CGFloat lineHeight = fSize * 1.35;
            CGFloat totalTextH = lines.count * lineHeight;
            CGFloat targetH = MAX(30.0, totalTextH + 8.0);
            CGFloat targetW = MAX(110.0, maxTextW + 36.0 + 16.0);
            NSRect cardRect = NSMakeRect(item.startPoint.x, centerY - targetH / 2.0, targetW, targetH);

            if (item.textStyle == TextStyleFilled) {
                NSBezierPath *bg = [NSBezierPath bezierPathWithRoundedRect:cardRect xRadius:6.0 yRadius:6.0];
                [item.color setFill];
                [bg fill];
            } else if (item.textStyle == TextStyleBordered) {
                NSBezierPath *bg = [NSBezierPath bezierPathWithRoundedRect:cardRect xRadius:6.0 yRadius:6.0];
                [[NSColor colorWithWhite:0.0 alpha:0.55] setFill];
                [bg fill];
                [item.color setStroke];
                bg.lineWidth = 1.5;
                [bg stroke];
            }

            CGFloat badgeRadius = 11.0;
            NSPoint badgeCenter = NSMakePoint(cardRect.origin.x + 16.0, centerY);
            NSRect badgeRect = NSMakeRect(badgeCenter.x - badgeRadius, badgeCenter.y - badgeRadius, badgeRadius * 2, badgeRadius * 2);
            NSBezierPath *badge = [NSBezierPath bezierPathWithOvalInRect:badgeRect];
            if (item.textStyle == TextStyleFilled) {
                [[NSColor whiteColor] setFill];
                [badge fill];
            } else {
                [item.color setFill];
                [badge fill];
            }

            NSString *numStr = [NSString stringWithFormat:@"%ld", (long)item.stepNumber];
            NSFont *numFont = [NSFont systemFontOfSize:11 weight:NSFontWeightBold];
            NSDictionary *numAttrs = @{
                NSFontAttributeName: numFont,
                NSForegroundColorAttributeName: (item.textStyle == TextStyleFilled) ? [NSColor colorWithSRGBRed:0.1 green:0.1 blue:0.15 alpha:1.0] : [NSColor whiteColor]
            };
            NSSize ns = [numStr sizeWithAttributes:numAttrs];
            CGFloat numGlyphY = badgeCenter.y - fabs(numFont.descender) - (numFont.capHeight / 2.0);
            [numStr drawAtPoint:NSMakePoint(badgeCenter.x - ns.width / 2.0, numGlyphY) withAttributes:numAttrs];

            NSFont *textFont = [NSFont systemFontOfSize:item.fontSize ?: 14.0 weight:NSFontWeightMedium];
            CGFloat firstLineY = (centerY + (lines.count - 1) * lineHeight / 2.0) - fabs(textFont.descender) - (textFont.capHeight / 2.0);
            CGFloat textStartX = cardRect.origin.x + 34.0;
            for (NSInteger i = 0; i < lines.count; i++) {
                NSString *l = lines[i];
                NSPoint p = NSMakePoint(textStartX, firstLineY - i * lineHeight);
                [l drawAtPoint:p withAttributes:attrs];
            }
            break;
        }
        case ToolText: {
            if (!item.text || item.text.length == 0) break;
            CGFloat centerY = item.startPoint.y;
            NSArray *lines = [item.text componentsSeparatedByString:@"\n"];
            CGFloat fSize = item.fontSize ?: 14.0;
            NSDictionary *attrs = @{
                NSFontAttributeName: [NSFont systemFontOfSize:fSize weight:NSFontWeightMedium],
                NSForegroundColorAttributeName: (item.textStyle == TextStyleFilled) ? [NSColor whiteColor] : item.color
            };

            CGFloat maxTextW = 0;
            for (NSString *l in lines) {
                NSSize s = [l sizeWithAttributes:attrs];
                if (s.width > maxTextW) maxTextW = s.width;
            }

            CGFloat lineHeight = fSize * 1.35;
            CGFloat totalTextH = lines.count * lineHeight;
            CGFloat targetH = MAX(30.0, totalTextH + 8.0);
            CGFloat targetW = MAX(80.0, maxTextW + 16.0);
            NSRect cardRect = NSMakeRect(item.startPoint.x, centerY - targetH / 2.0, targetW, targetH);

            if (item.textStyle == TextStyleFilled) {
                NSBezierPath *bg = [NSBezierPath bezierPathWithRoundedRect:cardRect xRadius:6.0 yRadius:6.0];
                [item.color setFill];
                [bg fill];
            } else if (item.textStyle == TextStyleBordered) {
                NSBezierPath *bg = [NSBezierPath bezierPathWithRoundedRect:cardRect xRadius:6.0 yRadius:6.0];
                [[NSColor colorWithWhite:0.0 alpha:0.55] setFill];
                [bg fill];
                [item.color setStroke];
                bg.lineWidth = 1.5;
                [bg stroke];
            }

            NSFont *textFont = [NSFont systemFontOfSize:fSize weight:NSFontWeightMedium];
            CGFloat firstLineY = (centerY + (lines.count - 1) * lineHeight / 2.0) - fabs(textFont.descender) - (textFont.capHeight / 2.0);
            CGFloat textStartX = cardRect.origin.x + 8.0;
            for (NSInteger i = 0; i < lines.count; i++) {
                NSString *l = lines[i];
                NSPoint p = NSMakePoint(textStartX, firstLineY - i * lineHeight);
                [l drawAtPoint:p withAttributes:attrs];
            }
            break;
        }
        default: break;
    }
}

- (void)startPinAnnotationAtPoint:(NSPoint)pt {
    if (_pinActiveTool == ToolText || _pinActiveTool == ToolTag || _pinActiveTool == ToolStepNote) {
        _pinInlineEditor = [[AnnotationInlineEditorView alloc] initWithCenter:pt
                                                                    toolType:_pinActiveTool
                                                                   textStyle:_pinActiveTextStyle
                                                                        step:_pinCurrentStep
                                                                       color:_pinActiveColor
                                                                    fontSize:_pinActiveFontSize];
        __weak typeof(self) weakSelf = self;
        _pinInlineEditor.onCommit = ^(NSString *text, AnnotationToolType type, AnnotationTextStyle style, NSPoint center, NSInteger step, CGFloat fSize) {
            __strong typeof(weakSelf) strongSelf = weakSelf;
            if (!strongSelf) return;
            AnnotationItem *item = [[AnnotationItem alloc] init];
            item.toolType = type;
            item.textStyle = style;
            item.startPoint = center;
            item.endPoint = center;
            item.text = text;
            item.color = strongSelf.pinActiveColor;
            item.fontSize = fSize;
            item.stepNumber = step;
            [strongSelf.pinAnnotations addObject:item];
            if (type == ToolStepNote || type == ToolStep) {
                strongSelf.pinCurrentStep++;
            }
            [strongSelf.pinInlineEditor removeFromSuperview];
            strongSelf.pinInlineEditor = nil;
            [strongSelf.editToolbarView.undoButton setEnabled:YES];
            [strongSelf setNeedsDisplay:YES];
        };
        _pinInlineEditor.onCancel = ^{
            __strong typeof(weakSelf) strongSelf = weakSelf;
            if (!strongSelf) return;
            [strongSelf.pinInlineEditor removeFromSuperview];
            strongSelf.pinInlineEditor = nil;
            [strongSelf setNeedsDisplay:YES];
        };
        [self addSubview:_pinInlineEditor];
        [self.window makeFirstResponder:_pinInlineEditor.textView];
        [self setNeedsDisplay:YES];
        return;
    }

    if (_pinActiveTool == ToolStep) {
        AnnotationItem *item = [[AnnotationItem alloc] init];
        item.toolType = ToolStep;
        item.startPoint = pt;
        item.endPoint = pt;
        item.color = _pinActiveColor;
        item.stepNumber = _pinCurrentStep++;
        [_pinAnnotations addObject:item];
        [_editToolbarView.undoButton setEnabled:YES];
        [self setNeedsDisplay:YES];
        return;
    }

    _pinCurrentDrawingItem = [[AnnotationItem alloc] init];
    _pinCurrentDrawingItem.toolType = _pinActiveTool;
    _pinCurrentDrawingItem.color = _pinActiveColor;
    _pinCurrentDrawingItem.lineWidth = _pinActiveLineWidth;
    _pinCurrentDrawingItem.startPoint = pt;
    _pinCurrentDrawingItem.endPoint = pt;
    [_pinCurrentDrawingItem.points addObject:[NSValue valueWithPoint:pt]];
    [self setNeedsDisplay:YES];
}

- (void)updatePinAnnotationAtPoint:(NSPoint)pt {
    if (!_pinCurrentDrawingItem) return;
    _pinCurrentDrawingItem.endPoint = pt;
    [_pinCurrentDrawingItem.points addObject:[NSValue valueWithPoint:pt]];
}

- (void)finishPinAnnotation {
    if (_pinCurrentDrawingItem) {
        [_pinAnnotations addObject:_pinCurrentDrawingItem];
        _pinCurrentDrawingItem = nil;
        [_editToolbarView.undoButton setEnabled:YES];
    }
}

- (void)commitPinInlineEditor {
    if (_pinInlineEditor) {
        [_pinInlineEditor commit];
        [self cancelPinInlineEditor];
    }
}

- (void)cancelPinInlineEditor {
    if (_pinInlineEditor) {
        [_pinInlineEditor removeFromSuperview];
        _pinInlineEditor = nil;
        [self.window makeFirstResponder:self];
    }
}

- (void)keyDown:(NSEvent *)event {
    if (event.keyCode == 53) { // Esc
        if (_isEditing) {
            [self cancelEditAnnotations];
        } else {
            [self closePinAction];
        }
        return;
    }
    [super keyDown:event];
}

- (BOOL)acceptsFirstResponder { return YES; }
- (BOOL)becomeFirstResponder { return YES; }

@end

static id gMagnifyLocalMonitor = nil;
static id gMagnifyGlobalMonitor = nil;
static void setupMagnifyMonitorIfNeeded(void) {
    if (!gMagnifyLocalMonitor) {
        gMagnifyLocalMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskMagnify handler:^NSEvent *(NSEvent *event) {
            NSPoint mouseLoc = [NSEvent mouseLocation];
            for (PinPanel *panel in [gPanels allValues]) {
                if (panel.isVisible && NSPointInRect(mouseLoc, panel.frame)) {
                    [panel.pinView magnifyWithEvent:event];
                    return nil;
                }
            }
            return event;
        }];
    }
    if (!gMagnifyGlobalMonitor) {
        gMagnifyGlobalMonitor = [NSEvent addGlobalMonitorForEventsMatchingMask:NSEventMaskMagnify handler:^(NSEvent *event) {
            dispatch_async(dispatch_get_main_queue(), ^{
                NSPoint mouseLoc = [NSEvent mouseLocation];
                for (PinPanel *panel in [gPanels allValues]) {
                    if (panel.isVisible && NSPointInRect(mouseLoc, panel.frame)) {
                        [panel.pinView magnifyWithEvent:event];
                        break;
                    }
                }
            });
        }];
    }
}

static void createPin(NSDictionary *dict) {
    dispatch_async(dispatch_get_main_queue(), ^{
        setupMagnifyMonitorIfNeeded();
        [AppTheme loadUserPreferences];
        if (dict[@"theme"]) {
            [AppTheme setCurrentThemeWithName:dict[@"theme"]];
        }

        NSString *pinId = dict[@"pinId"];
        NSString *imagePath = dict[@"imagePath"];
        NSString *base64Data = dict[@"base64"];

        if (!pinId) return;

        PinPanel *existing = gPanels[pinId];
        if (existing) {
            [existing orderFrontRegardless];
            return;
        }

        NSImage *image = nil;
        if (imagePath && [[NSFileManager defaultManager] fileExistsAtPath:imagePath]) {
            image = [[NSImage alloc] initWithContentsOfFile:imagePath];
        } else if (base64Data) {
            NSString *pureBase64 = base64Data;
            if ([pureBase64 containsString:@","]) {
                pureBase64 = [[pureBase64 componentsSeparatedByString:@","] lastObject];
            }
            NSData *decoded = [[NSData alloc] initWithBase64EncodedString:pureBase64
                                                                  options:NSDataBase64DecodingIgnoreUnknownCharacters];
            if (decoded) {
                image = [[NSImage alloc] initWithData:decoded];
            }
        }

        if (!image) return;

        NSSize imgSize = image.size;
        CGFloat w = [dict[@"width"] doubleValue] ?: imgSize.width;
        CGFloat h = [dict[@"height"] doubleValue] ?: imgSize.height;

        NSScreen *screen = [NSScreen mainScreen];
        NSPoint mousePoint = [NSEvent mouseLocation];
        for (NSScreen *s in [NSScreen screens]) {
            if (NSPointInRect(mousePoint, s.frame)) {
                screen = s;
                break;
            }
        }

        NSRect screenFrame = screen.visibleFrame;
        if (w > screenFrame.size.width * 0.85) {
            CGFloat scale = (screenFrame.size.width * 0.85) / w;
            w *= scale;
            h *= scale;
        }
        if (h > screenFrame.size.height * 0.85) {
            CGFloat scale = (screenFrame.size.height * 0.85) / h;
            w *= scale;
            h *= scale;
        }

        CGFloat x = [dict[@"x"] doubleValue];
        CGFloat y = [dict[@"y"] doubleValue];
        if (!dict[@"x"] || !dict[@"y"]) {
            x = screenFrame.origin.x + (screenFrame.size.width - w) / 2.0;
            y = screenFrame.origin.y + (screenFrame.size.height - h) / 2.0;
        } else {
            y = screen.frame.size.height - y - h;
        }

        NSRect winFrame = NSMakeRect(x, y, w, h);
        PinPanel *panel = [[PinPanel alloc] initWithContentRect:winFrame
                                                      styleMask:(NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel | NSWindowStyleMaskResizable)
                                                        backing:NSBackingStoreBuffered
                                                          defer:NO];
        panel.pinId = pinId;
        panel.level = NSFloatingWindowLevel;
        panel.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces |
                                   NSWindowCollectionBehaviorFullScreenAuxiliary |
                                   NSWindowCollectionBehaviorStationary;
        panel.hidesOnDeactivate = NO;
        panel.floatingPanel = YES;
        panel.movableByWindowBackground = NO; // custom handled for edge resize!
        panel.acceptsMouseMovedEvents = YES;
        panel.backgroundColor = [NSColor clearColor];
        panel.opaque = NO;
        panel.hasShadow = YES;
        panel.appearance = AppTheme.currentTheme.isDark ?
            [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua] :
            [NSAppearance appearanceNamed:NSAppearanceNameAqua];

        PinContentView *view = [[PinContentView alloc] initWithFrame:NSMakeRect(0, 0, w, h)
                                                               image:image
                                                                path:imagePath
                                                               pinId:pinId];
        panel.aspectRatio = NSMakeSize(imgSize.width, imgSize.height);
        panel.pinView = view;
        panel.contentView = view;

        gPanels[pinId] = panel;
        [panel makeKeyAndOrderFront:nil];
        [panel makeFirstResponder:view];

        sendEvent(@{ @"event": @"created", @"pinId": pinId });
    });
}

#pragma mark - Native Screen Capture

@interface CaptureOverlayView : NSView <NSTextFieldDelegate>
@property (nonatomic, strong) NSImage *screenshotImage;
@property (nonatomic, assign) NSRect selectionRect;
@property (nonatomic, assign) BOOL hasSelection;

// Dragging / Resizing State
@property (nonatomic, assign) HandleHitType activeDragHandle;
@property (nonatomic, assign) NSPoint dragStartPoint;
@property (nonatomic, assign) NSRect initialSelectionRect;

// Tool & Annotations
@property (nonatomic, assign) AnnotationToolType activeTool;
@property (nonatomic, assign) AnnotationToolType lastSecondaryTool;
@property (nonatomic, assign) AnnotationTextStyle activeTextStyle;
@property (nonatomic, strong) NSMutableArray<AnnotationItem *> *annotations;
@property (nonatomic, strong) AnnotationItem *currentDrawingItem;
@property (nonatomic, strong) NSColor *activeColor;
@property (nonatomic, assign) CGFloat activeLineWidth;
@property (nonatomic, assign) CGFloat activeFontSize;
@property (nonatomic, assign) NSInteger currentStepCount;

// Watermark State (Independent toggleable)
@property (nonatomic, assign) BOOL isWatermarkActive;
@property (nonatomic, strong) NSString *watermarkText;

// UI Elements
@property (nonatomic, strong) NSTextField *sizeLabel;
@property (nonatomic, strong) NSVisualEffectView *primaryToolbarView;
@property (nonatomic, strong) NSVisualEffectView *secondaryOptionsView;
@property (nonatomic, strong) NSMutableArray<NSButton *> *primaryButtons;
@property (nonatomic, strong) NSMutableArray<NSButton *> *colorButtons;
@property (nonatomic, strong) NSMutableArray<NSButton *> *sizeButtons;
@property (nonatomic, strong) NSMutableArray<NSButton *> *styleButtons;
@property (nonatomic, strong) NSMutableArray<HoverButton *> *presetPills;
@property (nonatomic, strong) HoverButton *watermarkCheckBtn;
@property (nonatomic, strong) NSTextField *watermarkInputField;
@property (nonatomic, strong) NSButton *undoButton;
@property (nonatomic, strong) AnnotationInlineEditorView *inlineEditor;

- (instancetype)initWithFrame:(NSRect)frame screenshot:(NSImage *)img;
- (void)updateToolbarPositions;
- (void)rebuildSecondaryToolbar;
- (void)updateWatermarkUIState;
- (NSImage *)compositeAnnotatedImage;
- (void)commitInlineEditor;
@end

@interface CapturePanel : NSPanel
@property (nonatomic, strong) CaptureOverlayView *overlayView;
@end

@implementation CapturePanel
- (BOOL)canBecomeKeyWindow { return YES; }
- (BOOL)canBecomeMainWindow { return YES; }
@end

static CapturePanel *gCapturePanel = nil;

@implementation CaptureOverlayView

- (instancetype)initWithFrame:(NSRect)frame screenshot:(NSImage *)img {
    self = [super initWithFrame:frame];
    if (self) {
        _screenshotImage = img;
        _hasSelection = NO;
        _selectionRect = NSZeroRect;
        _activeDragHandle = HitNone;
        _activeTool = ToolNone;
        _lastSecondaryTool = ToolNone;
        _activeTextStyle = TextStyleNormal;
        _annotations = [NSMutableArray array];
        _primaryButtons = [NSMutableArray array];
        _colorButtons = [NSMutableArray array];
        _sizeButtons = [NSMutableArray array];
        _styleButtons = [NSMutableArray array];
        _presetPills = [NSMutableArray array];
        _activeColor = [NSColor colorWithSRGBRed:0.96 green:0.29 blue:0.27 alpha:1.0]; // Lark Red #f64b45
        _activeLineWidth = 4.0;
        _activeFontSize = 14.0;
        _currentStepCount = 1;
        _isWatermarkActive = NO;
        _watermarkText = [I18N tr:@"wmInternalOnly"];

        self.wantsLayer = YES;

        [self setupUI];
    }
    return self;
}

- (void)setupUI {
    // 1. Dimension Size Badge
    _sizeLabel = [[NSTextField alloc] initWithFrame:NSMakeRect(0, 0, 110, 24)];
    _sizeLabel.bezeled = NO;
    _sizeLabel.drawsBackground = YES;
    _sizeLabel.backgroundColor = [NSColor colorWithSRGBRed:0.12 green:0.14 blue:0.18 alpha:0.92];
    _sizeLabel.textColor = [NSColor whiteColor];
    _sizeLabel.font = [NSFont monospacedDigitSystemFontOfSize:12 weight:NSFontWeightMedium];
    _sizeLabel.alignment = NSTextAlignmentCenter;
    _sizeLabel.editable = NO;
    _sizeLabel.selectable = NO;
    _sizeLabel.wantsLayer = YES;
    _sizeLabel.layer.cornerRadius = 5.0;
    _sizeLabel.layer.masksToBounds = YES;
    _sizeLabel.hidden = YES;
    [self addSubview:_sizeLabel];

    // 2. Primary Toolbar (Lark 48px Height, 36x36px Buttons, 20px Vector SVGs)
    _primaryToolbarView = [[NSVisualEffectView alloc] initWithFrame:NSMakeRect(0, 0, 740, 48)];
    if (@available(macOS 10.14, *)) {
        _primaryToolbarView.material = AppTheme.currentTheme.isDark ? NSVisualEffectMaterialHUDWindow : NSVisualEffectMaterialToolTip;
    }
    _primaryToolbarView.blendingMode = NSVisualEffectBlendingModeWithinWindow;
    _primaryToolbarView.state = NSVisualEffectStateActive;
    _primaryToolbarView.wantsLayer = YES;
    _primaryToolbarView.layer.cornerRadius = 10.0;
    _primaryToolbarView.layer.masksToBounds = YES;
    _primaryToolbarView.layer.borderWidth = 1.0;
    _primaryToolbarView.layer.borderColor = [AppTheme.currentTheme.toolbarBorderColor CGColor];
    _primaryToolbarView.layer.backgroundColor = [AppTheme.currentTheme.toolbarBgColor CGColor];
    _primaryToolbarView.hidden = YES;

    // 18 items in exact Lark / MarkShotHis order:
    // 0: Grip, 1: Rect, 2: Circle, 3: Line, 4: Arrow, 5: Tag, 6: Text, 7: Pencil, 8: Step, 9: StepNote, 10: Mosaic, 11: Highlight, 12: Marker, 13: Watermark, 14: Pin, [sep], 15: Undo, 16: Save, 17: Close, 18: Confirm
    NSArray *iconIds = @[
        @"grip",
        @"rect",
        @"circle",
        @"line",
        @"arrow",
        @"tag",
        @"text",
        @"pencil",
        @"step",
        @"stepNote",
        @"mosaic",
        @"highlight",
        @"marker",
        @"watermark",
        @"pin",
        @"undo",
        @"save",
        @"close",
        @"confirm"
    ];
    NSArray *tipKeys = @[
        @"toolbarDrag",
        @"rect",
        @"circle",
        @"line",
        @"arrow",
        @"tag",
        @"text",
        @"pencil",
        @"step",
        @"stepNote",
        @"mosaic",
        @"highlight",
        @"marker",
        @"watermark",
        @"pin",
        @"undo",
        @"save",
        @"close",
        @"confirm"
    ];

    CGFloat curX = 6.0;
    for (NSInteger i = 0; i < iconIds.count; i++) {
        if (i == 15) {
            NSBox *sep = [[NSBox alloc] initWithFrame:NSMakeRect(curX + 2, 11, 1, 26)];
            sep.boxType = NSBoxSeparator;
            [_primaryToolbarView addSubview:sep];
            curX += 9.0;
        }

        CGFloat btnW = (i == 0) ? 16.0 : 36.0;
        HoverButton *btn = [[HoverButton alloc] initWithFrame:NSMakeRect(curX, 6, btnW, 36)];
        btn.toolTip = [I18N tr:tipKeys[i]];
        btn.tag = i;
        btn.target = self;
        btn.action = @selector(primaryToolbarAction:);
        btn.customHoverColor = AppTheme.currentTheme.buttonHoverColor;
        btn.customActiveBgColor = AppTheme.currentTheme.buttonActiveBgColor;

        NSImage *icon = getSvgIcon(iconIds[i]);
        btn.image = icon;
        btn.imagePosition = NSImageOnly;
        btn.imageScaling = NSImageScaleProportionallyDown;
        if (@available(macOS 10.14, *)) {
            btn.contentTintColor = (i == 18) ? [NSColor colorWithSRGBRed:0.19 green:0.76 blue:0.36 alpha:1.0] :
                                   (i == 17) ? [NSColor colorWithSRGBRed:0.96 green:0.29 blue:0.27 alpha:1.0] :
                                   AppTheme.currentTheme.textColor;
        }

        if (i == 15) {
            _undoButton = btn;
            _undoButton.enabled = NO;
        }

        [_primaryButtons addObject:btn];
        [_primaryToolbarView addSubview:btn];
        curX += btnW + 2.0;
    }

    NSRect tbFrame = _primaryToolbarView.frame;
    tbFrame.size.width = curX + 6.0;
    _primaryToolbarView.frame = tbFrame;
    [self addSubview:_primaryToolbarView];

    // 3. Secondary Options Bar (46px Height)
    _secondaryOptionsView = [[NSVisualEffectView alloc] initWithFrame:NSMakeRect(0, 0, 480, 46)];
    if (@available(macOS 10.14, *)) {
        _secondaryOptionsView.material = AppTheme.currentTheme.isDark ? NSVisualEffectMaterialHUDWindow : NSVisualEffectMaterialToolTip;
    }
    _secondaryOptionsView.blendingMode = NSVisualEffectBlendingModeWithinWindow;
    _secondaryOptionsView.state = NSVisualEffectStateActive;
    _secondaryOptionsView.wantsLayer = YES;
    _secondaryOptionsView.layer.cornerRadius = 10.0;
    _secondaryOptionsView.layer.masksToBounds = YES;
    _secondaryOptionsView.layer.borderWidth = 1.0;
    _secondaryOptionsView.layer.borderColor = [AppTheme.currentTheme.subToolbarBorderColor CGColor];
    _secondaryOptionsView.layer.backgroundColor = [AppTheme.currentTheme.subToolbarBgColor CGColor];
    _secondaryOptionsView.hidden = YES;
    [self addSubview:_secondaryOptionsView];

    [self rebuildSecondaryToolbar];
}

- (void)rebuildSecondaryToolbar {
    // Remove all previous subviews
    for (NSView *v in [_secondaryOptionsView.subviews copy]) {
        [v removeFromSuperview];
    }
    [_colorButtons removeAllObjects];
    [_sizeButtons removeAllObjects];
    [_styleButtons removeAllObjects];
    [_presetPills removeAllObjects];

    AnnotationToolType tool = (_activeTool != ToolNone) ? _activeTool : _lastSecondaryTool;
    if (tool == ToolNone && !_isWatermarkActive) {
        _secondaryOptionsView.hidden = YES;
        return;
    }

    CGFloat optX = 8.0;

    // A. Text & StepNote Tool Settings: 3 Styles (Normal, Filled, Bordered) + Font Size
    if (tool == ToolText || tool == ToolStepNote) {
        NSArray *styleTitles = @[@"T", @"■T", @"□T"];
        NSArray *styleTips = @[[I18N tr:@"textNormal"], [I18N tr:@"textFilled"], [I18N tr:@"textBordered"]];
        for (NSInteger s = 0; s < 3; s++) {
            NSButton *sBtn = [[NSButton alloc] initWithFrame:NSMakeRect(optX, 6, 32, 26)];
            sBtn.bezelStyle = NSBezelStyleInline;
            sBtn.bordered = NO;
            sBtn.title = styleTitles[s];
            sBtn.toolTip = styleTips[s];
            sBtn.font = [NSFont systemFontOfSize:12 weight:NSFontWeightBold];
            sBtn.wantsLayer = YES;
            sBtn.layer.cornerRadius = 4.0;
            sBtn.layer.borderWidth = (_activeTextStyle == s) ? 1.5 : 0.5;
            sBtn.layer.borderColor = (_activeTextStyle == s) ? [[NSColor colorWithSRGBRed:0.20 green:0.43 blue:0.96 alpha:1.0] CGColor] : [[NSColor colorWithWhite:1.0 alpha:0.18] CGColor];
            sBtn.tag = s;
            sBtn.target = self;
            sBtn.action = @selector(textStyleAction:);
            [_styleButtons addObject:sBtn];
            [_secondaryOptionsView addSubview:sBtn];
            optX += 36.0;
        }

        // Font size options: 12pt, 14pt, 18pt
        NSArray *fSizes = @[@"12pt", @"14pt", @"18pt"];
        for (NSInteger f = 0; f < 3; f++) {
            NSButton *fBtn = [[NSButton alloc] initWithFrame:NSMakeRect(optX, 6, 38, 26)];
            fBtn.bezelStyle = NSBezelStyleInline;
            fBtn.bordered = NO;
            fBtn.title = fSizes[f];
            fBtn.font = [NSFont systemFontOfSize:11 weight:NSFontWeightMedium];
            fBtn.tag = f;
            fBtn.target = self;
            fBtn.action = @selector(fontSizeAction:);
            [_secondaryOptionsView addSubview:fBtn];
            optX += 40.0;
        }

        NSBox *sSep = [[NSBox alloc] initWithFrame:NSMakeRect(optX + 2, 8, 1, 22)];
        sSep.boxType = NSBoxSeparator;
        [_secondaryOptionsView addSubview:sSep];
        optX += 10.0;
    }
    // B. Watermark Tool Settings: Compact Native Checkbox + 4 Preset Pills + Custom Input Field
    else if (tool == ToolWatermark || (_isWatermarkActive && _activeTool == ToolNone)) {
        HoverButton *chkBtn = [[HoverButton alloc] initWithFrame:NSMakeRect(optX, 11, 16, 16)];
        BOOL active = _isWatermarkActive;
        chkBtn.title = active ? @"✓" : @"";
        chkBtn.font = [NSFont systemFontOfSize:11 weight:NSFontWeightBold];
        if (@available(macOS 10.14, *)) {
            chkBtn.contentTintColor = [NSColor whiteColor];
        }
        chkBtn.wantsLayer = YES;
        chkBtn.layer.cornerRadius = 3.5;
        chkBtn.layer.borderWidth = active ? 0.0 : 1.2;
        chkBtn.layer.borderColor = [[NSColor colorWithWhite:1.0 alpha:0.35] CGColor];
        chkBtn.customNormalBgColor = active ? [NSColor colorWithSRGBRed:0.20 green:0.43 blue:0.96 alpha:1.0] : [NSColor colorWithWhite:1.0 alpha:0.06];
        chkBtn.customHoverColor = active ? [NSColor colorWithSRGBRed:0.30 green:0.52 blue:0.98 alpha:1.0] : [NSColor colorWithWhite:1.0 alpha:0.18];
        chkBtn.toolTip = [I18N tr:@"enableWatermark"];
        chkBtn.target = self;
        chkBtn.action = @selector(toggleWatermarkCheckboxAction:);
        _watermarkCheckBtn = chkBtn;
        [_secondaryOptionsView addSubview:chkBtn];
        optX += 16.0 + 8.0;

        NSBox *chkSep = [[NSBox alloc] initWithFrame:NSMakeRect(optX, 8, 1, 22)];
        chkSep.boxType = NSBoxSeparator;
        [_secondaryOptionsView addSubview:chkSep];
        optX += 8.0;

        NSArray *presets = @[[I18N tr:@"wmInternalOnly"], [I18N tr:@"wmConfidential"], [I18N tr:@"wmForReview"], [I18N tr:@"wmBrand"]];
        for (NSInteger p = 0; p < presets.count; p++) {
            CGFloat pillW = [presets[p] sizeWithAttributes:@{NSFontAttributeName: [NSFont systemFontOfSize:11 weight:NSFontWeightMedium]}].width + 16.0;
            HoverButton *pBtn = [[HoverButton alloc] initWithFrame:NSMakeRect(optX, 6, pillW, 26)];
            pBtn.title = presets[p];
            pBtn.font = [NSFont systemFontOfSize:11 weight:NSFontWeightMedium];
            pBtn.wantsLayer = YES;
            pBtn.layer.cornerRadius = 4.0;
            BOOL isActivePreset = [_watermarkText isEqualToString:presets[p]];
            pBtn.layer.borderWidth = isActivePreset ? 1.5 : 0.5;
            pBtn.layer.borderColor = isActivePreset ? [[NSColor colorWithSRGBRed:0.20 green:0.43 blue:0.96 alpha:1.0] CGColor] : [[NSColor colorWithWhite:1.0 alpha:0.18] CGColor];
            pBtn.customNormalBgColor = isActivePreset ? [NSColor colorWithSRGBRed:0.20 green:0.43 blue:0.96 alpha:0.25] : [NSColor colorWithWhite:1.0 alpha:0.08];
            pBtn.tag = p;
            pBtn.target = self;
            pBtn.action = @selector(watermarkPresetAction:);
            [_presetPills addObject:pBtn];
            [_secondaryOptionsView addSubview:pBtn];
            optX += pillW + 4.0;
        }

        // Custom watermark text field
        _watermarkInputField = [[NSTextField alloc] initWithFrame:NSMakeRect(optX, 6, 130, 26)];
        VerticallyCenteredTextFieldCell *wmCell = [[VerticallyCenteredTextFieldCell alloc] initTextCell:@""];
        wmCell.scrollable = YES;
        wmCell.editable = YES;
        wmCell.verticalOffset = 0.5;
        _watermarkInputField.cell = wmCell;
        _watermarkInputField.bezeled = NO;
        _watermarkInputField.drawsBackground = YES;
        _watermarkInputField.backgroundColor = AppTheme.currentTheme.inputBgColor;
        _watermarkInputField.textColor = AppTheme.currentTheme.textColor;
        _watermarkInputField.font = [NSFont systemFontOfSize:11];
        NSMutableAttributedString *wmPh = [[NSMutableAttributedString alloc] initWithString:[I18N tr:@"watermarkCustomPlaceholder"]];
        [wmPh addAttributes:@{ NSForegroundColorAttributeName: AppTheme.currentTheme.secondaryTextColor } range:NSMakeRange(0, wmPh.length)];
        _watermarkInputField.placeholderAttributedString = wmPh;
        _watermarkInputField.stringValue = _watermarkText ?: @"";
        _watermarkInputField.wantsLayer = YES;
        _watermarkInputField.layer.cornerRadius = 4.0;
        _watermarkInputField.layer.borderWidth = 1.0;
        _watermarkInputField.layer.borderColor = [AppTheme.currentTheme.inputBorderColor CGColor];
        _watermarkInputField.delegate = self;
        _watermarkInputField.target = self;
        _watermarkInputField.action = @selector(watermarkCustomInputChanged:);
        [_secondaryOptionsView addSubview:_watermarkInputField];
        optX += 136.0;

        NSBox *sSep = [[NSBox alloc] initWithFrame:NSMakeRect(optX + 2, 8, 1, 22)];
        sSep.boxType = NSBoxSeparator;
        [_secondaryOptionsView addSubview:sSep];
        optX += 10.0;
    }
    // C. Shapes / Drawing Settings: 3 Stroke Width Dots (NO "But" text!)
    else if (tool == ToolRect || tool == ToolCircle || tool == ToolLine || tool == ToolArrow || tool == ToolPencil || tool == ToolHighlight || tool == ToolMarker || tool == ToolMosaic) {
        CGFloat dotRadii[] = { 3.0, 5.0, 7.5 };
        for (NSInteger s = 0; s < 3; s++) {
            HoverButton *sBtn = [[HoverButton alloc] initWithFrame:NSMakeRect(optX, 6, 26, 26)];
            sBtn.title = @""; // Explicitly clear title!
            sBtn.wantsLayer = YES;
            sBtn.layer.cornerRadius = 13.0;
            sBtn.layer.borderWidth = (s == 1) ? 1.5 : 0.0;
            sBtn.layer.borderColor = [[NSColor whiteColor] CGColor];
            sBtn.tag = s;
            sBtn.target = self;
            sBtn.action = @selector(strokeSizeAction:);

            CALayer *dotLayer = [CALayer layer];
            CGFloat r = dotRadii[s];
            dotLayer.frame = CGRectMake((26 - r * 2) / 2.0, (26 - r * 2) / 2.0, r * 2, r * 2);
            dotLayer.cornerRadius = r;
            dotLayer.backgroundColor = [[NSColor whiteColor] CGColor];
            [sBtn.layer addSublayer:dotLayer];

            [_sizeButtons addObject:sBtn];
            [_secondaryOptionsView addSubview:sBtn];
            optX += 30.0;
        }

        NSBox *sSep = [[NSBox alloc] initWithFrame:NSMakeRect(optX + 2, 8, 1, 22)];
        sSep.boxType = NSBoxSeparator;
        [_secondaryOptionsView addSubview:sSep];
        optX += 10.0;
    }

    // 7 Lark Color Swatches (NO "But" text & Fixed Background!)
    if (tool != ToolMosaic) {
        NSArray *colors = @[
            [NSColor colorWithSRGBRed:0.96 green:0.29 blue:0.27 alpha:1.0], // #f64b45 Red
            [NSColor colorWithSRGBRed:1.00 green:0.78 blue:0.05 alpha:1.0], // #ffc60c Yellow
            [NSColor colorWithSRGBRed:0.20 green:0.75 blue:0.29 alpha:1.0], // #34be4b Green
            [NSColor colorWithSRGBRed:0.20 green:0.43 blue:0.96 alpha:1.0], // #336df4 Blue
            [NSColor colorWithSRGBRed:0.12 green:0.14 blue:0.16 alpha:1.0], // #1f2329 Black
            [NSColor colorWithSRGBRed:0.56 green:0.58 blue:0.62 alpha:1.0], // #8f959e Gray
            [NSColor whiteColor]                                            // #ffffff White
        ];

        for (NSInteger c = 0; c < colors.count; c++) {
            HoverButton *cBtn = [[HoverButton alloc] initWithFrame:NSMakeRect(optX, 7, 24, 24)];
            cBtn.title = @""; // Explicitly clear title!
            cBtn.fixedBgColor = colors[c]; // Background NEVER disappears on hover!
            cBtn.wantsLayer = YES;
            cBtn.layer.cornerRadius = 6.0;
            cBtn.layer.backgroundColor = [colors[c] CGColor];
            cBtn.layer.borderWidth = (c == 6) ? 1.0 : 0.5;
            cBtn.layer.borderColor = (c == 6) ? [[NSColor colorWithWhite:0.4 alpha:0.6] CGColor] : [[NSColor clearColor] CGColor];
            cBtn.tag = c;
            cBtn.target = self;
            cBtn.action = @selector(colorPickAction:);

            // Active checkmark ✓
            if ([colors[c] isEqual:_activeColor]) {
                cBtn.title = @"✓";
                cBtn.font = [NSFont systemFontOfSize:13 weight:NSFontWeightBold];
                if (@available(macOS 10.14, *)) {
                    cBtn.contentTintColor = (c == 1 || c == 6) ? [NSColor blackColor] : [NSColor whiteColor];
                }
            }

            [_colorButtons addObject:cBtn];
            [_secondaryOptionsView addSubview:cBtn];
            optX += 28.0;
        }
    }

    NSRect soFrame = _secondaryOptionsView.frame;
    soFrame.size.width = optX + 8.0;
    _secondaryOptionsView.frame = soFrame;
    [self updateToolbarPositions];
}

- (void)updateWatermarkUIState {
    NSArray *presets = @[[I18N tr:@"wmInternalOnly"], [I18N tr:@"wmConfidential"], [I18N tr:@"wmForReview"], [I18N tr:@"wmBrand"]];
    NSString *current = _watermarkInputField.stringValue ?: _watermarkText;

    BOOL active = _isWatermarkActive;
    _watermarkCheckBtn.title = active ? @"✓" : @"";
    _watermarkCheckBtn.layer.borderWidth = active ? 0.0 : 1.2;
    _watermarkCheckBtn.layer.borderColor = active ? [AppTheme.currentTheme.accentColor CGColor] : [AppTheme.currentTheme.toolbarBorderColor CGColor];
    _watermarkCheckBtn.customNormalBgColor = active ? AppTheme.currentTheme.accentColor : AppTheme.currentTheme.inputBgColor;
    _watermarkCheckBtn.customHoverColor = active ? [AppTheme.currentTheme.accentColor blendedColorWithFraction:0.2 ofColor:[NSColor whiteColor]] : AppTheme.currentTheme.buttonHoverColor;
    [_watermarkCheckBtn updateAppearance];

    for (NSInteger p = 0; p < _presetPills.count && p < presets.count; p++) {
        HoverButton *pill = _presetPills[p];
        BOOL isMatch = [current isEqualToString:presets[p]];
        pill.isSelected = isMatch;
        pill.layer.borderWidth = isMatch ? 1.5 : 0.5;
        pill.layer.borderColor = isMatch ? [AppTheme.currentTheme.accentColor CGColor] : [AppTheme.currentTheme.toolbarBorderColor CGColor];
        pill.customNormalBgColor = isMatch ? [AppTheme.currentTheme.accentColor colorWithAlphaComponent:0.25] : AppTheme.currentTheme.inputBgColor;
        pill.customHoverColor = AppTheme.currentTheme.buttonHoverColor;
        NSMutableParagraphStyle *style = [[NSMutableParagraphStyle alloc] init];
        style.alignment = NSTextAlignmentCenter;
        pill.attributedTitle = [[NSAttributedString alloc] initWithString:pill.title ?: @"" attributes:@{
            NSForegroundColorAttributeName: isMatch ? AppTheme.currentTheme.accentColor : AppTheme.currentTheme.textColor,
            NSFontAttributeName: [NSFont systemFontOfSize:11 weight:isMatch ? NSFontWeightBold : NSFontWeightMedium],
            NSParagraphStyleAttributeName: style
        }];
        [pill updateAppearance];
    }
}

- (void)updateToolbarPositions {
    if (!_hasSelection) {
        _primaryToolbarView.hidden = YES;
        _secondaryOptionsView.hidden = YES;
        _sizeLabel.hidden = YES;
        return;
    }

    NSRect labelFrame = _sizeLabel.frame;
    labelFrame.origin.x = _selectionRect.origin.x;
    labelFrame.origin.y = _selectionRect.origin.y + _selectionRect.size.height + 6.0;
    if (labelFrame.origin.y + labelFrame.size.height > self.bounds.size.height - 4.0) {
        labelFrame.origin.y = _selectionRect.origin.y + _selectionRect.size.height - 28.0;
    }
    _sizeLabel.frame = labelFrame;
    _sizeLabel.stringValue = [NSString stringWithFormat:@"%.0f × %.0f px", _selectionRect.size.width, _selectionRect.size.height];
    _sizeLabel.hidden = NO;

    CGFloat tbH = _primaryToolbarView.frame.size.height;
    CGFloat soH = _secondaryOptionsView.frame.size.height;
    BOOL hasSecondary = (_activeTool != ToolNone || _isWatermarkActive);
    CGFloat totalNeededH = tbH + (hasSecondary ? (soH + 6.0) : 0.0) + 8.0;

    BOOL placeBelow = YES;
    if (_selectionRect.origin.y - totalNeededH < 8.0) {
        placeBelow = NO;
    }

    NSRect tbFrame = _primaryToolbarView.frame;
    tbFrame.origin.x = _selectionRect.origin.x + (_selectionRect.size.width - tbFrame.size.width) / 2.0;
    if (tbFrame.origin.x < 8.0) tbFrame.origin.x = 8.0;
    if (tbFrame.origin.x + tbFrame.size.width > self.bounds.size.width - 8.0) {
        tbFrame.origin.x = self.bounds.size.width - tbFrame.size.width - 8.0;
    }

    if (placeBelow) {
        // Below selection: Primary bar closest to selection, Secondary bar below it
        tbFrame.origin.y = _selectionRect.origin.y - tbH - 8.0;
        _primaryToolbarView.frame = tbFrame;
        _primaryToolbarView.hidden = NO;

        if (hasSecondary) {
            NSRect soFrame = _secondaryOptionsView.frame;
            soFrame.origin.x = tbFrame.origin.x + (tbFrame.size.width - soFrame.size.width) / 2.0;
            if (soFrame.origin.x < 8.0) soFrame.origin.x = 8.0;
            if (soFrame.origin.x + soFrame.size.width > self.bounds.size.width - 8.0) {
                soFrame.origin.x = self.bounds.size.width - soFrame.size.width - 8.0;
            }
            soFrame.origin.y = tbFrame.origin.y - soH - 6.0;
            _secondaryOptionsView.frame = soFrame;
            _secondaryOptionsView.hidden = NO;
        } else {
            _secondaryOptionsView.hidden = YES;
        }
    } else {
        // Above selection: Primary bar closest to selection, Secondary bar above it
        tbFrame.origin.y = _selectionRect.origin.y + _selectionRect.size.height + 8.0;
        _primaryToolbarView.frame = tbFrame;
        _primaryToolbarView.hidden = NO;

        if (hasSecondary) {
            NSRect soFrame = _secondaryOptionsView.frame;
            soFrame.origin.x = tbFrame.origin.x + (tbFrame.size.width - soFrame.size.width) / 2.0;
            if (soFrame.origin.x < 8.0) soFrame.origin.x = 8.0;
            if (soFrame.origin.x + soFrame.size.width > self.bounds.size.width - 8.0) {
                soFrame.origin.x = self.bounds.size.width - soFrame.size.width - 8.0;
            }
            soFrame.origin.y = tbFrame.origin.y + tbH + 6.0;
            _secondaryOptionsView.frame = soFrame;
            _secondaryOptionsView.hidden = NO;
        } else {
            _secondaryOptionsView.hidden = YES;
        }
    }
}

#pragma mark - Hit Testing for Handles

- (HandleHitType)hitTestPoint:(NSPoint)pt {
    if (!_hasSelection) return HitOutside;

    CGFloat x = _selectionRect.origin.x;
    CGFloat y = _selectionRect.origin.y;
    CGFloat w = _selectionRect.size.width;
    CGFloat h = _selectionRect.size.height;
    CGFloat margin = 12.0;

    // 4 Corners
    if (hypot(pt.x - x, pt.y - (y + h)) <= margin) return HitTopLeft;
    if (hypot(pt.x - (x + w), pt.y - (y + h)) <= margin) return HitTopRight;
    if (hypot(pt.x - (x + w), pt.y - y) <= margin) return HitBottomRight;
    if (hypot(pt.x - x, pt.y - y) <= margin) return HitBottomLeft;

    // 4 Mid-edges
    CGFloat midX = x + w / 2.0;
    CGFloat midY = y + h / 2.0;
    if (fabs(pt.y - (y + h)) <= margin && fabs(pt.x - midX) <= 24.0) return HitTop;
    if (fabs(pt.x - (x + w)) <= margin && fabs(pt.y - midY) <= 24.0) return HitRight;
    if (fabs(pt.y - y) <= margin && fabs(pt.x - midX) <= 24.0) return HitBottom;
    if (fabs(pt.x - x) <= margin && fabs(pt.y - midY) <= 24.0) return HitLeft;

    if (NSPointInRect(pt, _selectionRect)) return HitInside;
    return HitOutside;
}

- (NSView *)hitTest:(NSPoint)point {
    if (!_primaryToolbarView.hidden) {
        NSPoint tbPt = [_primaryToolbarView convertPoint:point fromView:self.superview ?: self];
        NSView *tbHit = [_primaryToolbarView hitTest:tbPt];
        if (tbHit) return tbHit;
    }
    if (!_secondaryOptionsView.hidden) {
        NSPoint soPt = [_secondaryOptionsView convertPoint:point fromView:self.superview ?: self];
        NSView *soHit = [_secondaryOptionsView hitTest:soPt];
        if (soHit) return soHit;
    }
    if (_inlineEditor && !_inlineEditor.hidden) {
        NSPoint iePt = [_inlineEditor convertPoint:point fromView:self.superview ?: self];
        NSView *ieHit = [_inlineEditor hitTest:iePt];
        if (ieHit) return ieHit;
    }
    return [super hitTest:point];
}

- (NSRect)calcSizeLabelFrame:(NSRect)sel {
    NSRect labelFrame = _sizeLabel.frame;
    labelFrame.origin.x = sel.origin.x;
    labelFrame.origin.y = sel.origin.y + sel.size.height + 6.0;
    if (labelFrame.origin.y + labelFrame.size.height > self.bounds.size.height - 4.0) {
        labelFrame.origin.y = sel.origin.y + sel.size.height - 28.0;
    }
    return labelFrame;
}

#pragma mark - Mouse Events & Resizing

- (void)mouseDown:(NSEvent *)event {
    NSPoint loc = [self convertPoint:event.locationInWindow fromView:nil];

    // Toolbars get immediate pass-through
    if (!_primaryToolbarView.hidden && NSPointInRect(loc, _primaryToolbarView.frame)) {
        return;
    }
    if (!_secondaryOptionsView.hidden && NSPointInRect(loc, _secondaryOptionsView.frame)) {
        return;
    }

    if (_inlineEditor) {
        [self commitInlineEditor];
    }

    HandleHitType hit = [self hitTestPoint:loc];

    // Double-click inside selection: immediate confirm & copy
    if (event.clickCount == 2 && hit == HitInside && _hasSelection && _activeTool == ToolNone) {
        [self confirmAction];
        return;
    }

    _dragStartPoint = loc;
    _initialSelectionRect = _selectionRect;

    // Initial selection creation
    if (!_hasSelection) {
        _activeDragHandle = HitOutside;
        _selectionRect = NSMakeRect(loc.x, loc.y, 0, 0);
        _sizeLabel.hidden = YES;
        _primaryToolbarView.hidden = YES;
        _secondaryOptionsView.hidden = YES;
        [self setNeedsDisplay:YES];
        return;
    }

    // Handles resizing
    if (hit >= HitTopLeft && hit <= HitLeft) {
        _activeDragHandle = hit;
        _primaryToolbarView.hidden = YES;
        _secondaryOptionsView.hidden = YES;
        [self setNeedsDisplay:YES];
        return;
    }

    // Clicked inside selection
    if (hit == HitInside) {
        if (_activeTool != ToolNone) {
            _activeDragHandle = HitNone;
            [self startAnnotationAtPoint:loc];
        } else {
            _activeDragHandle = HitInside;
            _primaryToolbarView.hidden = YES;
            _secondaryOptionsView.hidden = YES;
        }
        [self setNeedsDisplay:YES];
        return;
    }

    // Clicked outside selection
    if (hit == HitOutside) {
        _activeDragHandle = HitNone;
        if (_activeTool != ToolNone) {
            [self selectToolByTag:_activeTool]; // toggle off
        }
        return;
    }
}

- (void)mouseDragged:(NSEvent *)event {
    NSPoint loc = [self convertPoint:event.locationInWindow fromView:nil];
    CGFloat dx = loc.x - _dragStartPoint.x;
    CGFloat dy = loc.y - _dragStartPoint.y;

    // Drawing annotation inside selection
    if (_currentDrawingItem) {
        [self updateAnnotationAtPoint:loc];
        [self setNeedsDisplay:YES];
        return;
    }

    // Initial drag
    if (!_hasSelection && _activeDragHandle == HitOutside) {
        CGFloat x = MIN(_dragStartPoint.x, loc.x);
        CGFloat y = MIN(_dragStartPoint.y, loc.y);
        CGFloat w = fabs(_dragStartPoint.x - loc.x);
        CGFloat h = fabs(_dragStartPoint.y - loc.y);
        _selectionRect = NSMakeRect(x, y, w, h);
        _sizeLabel.stringValue = [NSString stringWithFormat:@"%.0f × %.0f px", w, h];
        _sizeLabel.frame = [self calcSizeLabelFrame:_selectionRect];
        _sizeLabel.hidden = NO;
        [self setNeedsDisplay:YES];
        return;
    }

    // Moving selection
    if (_hasSelection && _activeDragHandle == HitInside) {
        NSRect r = _initialSelectionRect;
        r.origin.x += dx;
        r.origin.y += dy;
        r.origin.x = MAX(0, MIN(self.bounds.size.width - r.size.width, r.origin.x));
        r.origin.y = MAX(0, MIN(self.bounds.size.height - r.size.height, r.origin.y));
        _selectionRect = r;
        _sizeLabel.stringValue = [NSString stringWithFormat:@"%.0f × %.0f px", r.size.width, r.size.height];
        _sizeLabel.frame = [self calcSizeLabelFrame:_selectionRect];
        _sizeLabel.hidden = NO;
        [self setNeedsDisplay:YES];
        return;
    }

    // 8-Direction Resizing
    if (_hasSelection && _activeDragHandle >= HitTopLeft && _activeDragHandle <= HitLeft) {
        NSRect r = _initialSelectionRect;
        switch (_activeDragHandle) {
            case HitTopLeft:
                r.origin.x += dx;
                r.size.width -= dx;
                r.size.height += dy;
                break;
            case HitTop:
                r.size.height += dy;
                break;
            case HitTopRight:
                r.size.width += dx;
                r.size.height += dy;
                break;
            case HitRight:
                r.size.width += dx;
                break;
            case HitBottomRight:
                r.size.width += dx;
                r.origin.y += dy;
                r.size.height -= dy;
                break;
            case HitBottom:
                r.origin.y += dy;
                r.size.height -= dy;
                break;
            case HitBottomLeft:
                r.origin.x += dx;
                r.size.width -= dx;
                r.origin.y += dy;
                r.size.height -= dy;
                break;
            case HitLeft:
                r.origin.x += dx;
                r.size.width -= dx;
                break;
            default: break;
        }

        if (r.size.width < 0) {
            r.origin.x += r.size.width;
            r.size.width = fabs(r.size.width);
        }
        if (r.size.height < 0) {
            r.origin.y += r.size.height;
            r.size.height = fabs(r.size.height);
        }
        _selectionRect = r;
        _sizeLabel.stringValue = [NSString stringWithFormat:@"%.0f × %.0f px", r.size.width, r.size.height];
        _sizeLabel.frame = [self calcSizeLabelFrame:_selectionRect];
        _sizeLabel.hidden = NO;
        [self setNeedsDisplay:YES];
        return;
    }
}

- (void)mouseUp:(NSEvent *)event {
    if (_currentDrawingItem) {
        [self finishAnnotation];
        [self setNeedsDisplay:YES];
        return;
    }

    if (!_hasSelection) {
        if (_selectionRect.size.width >= 10 && _selectionRect.size.height >= 10) {
            _hasSelection = YES;
            _activeDragHandle = HitNone;
            [self updateToolbarPositions];
        } else {
            _hasSelection = NO;
            _selectionRect = NSZeroRect;
            _sizeLabel.hidden = YES;
            _primaryToolbarView.hidden = YES;
            _secondaryOptionsView.hidden = YES;
        }
    } else {
        _activeDragHandle = HitNone;
        [self updateToolbarPositions];
    }

    [self.window invalidateCursorRectsForView:self];
    [self setNeedsDisplay:YES];
}

- (void)resetCursorRects {
    [super resetCursorRects];

    if (!_hasSelection) {
        [self addCursorRect:self.bounds cursor:[NSCursor crosshairCursor]];
        return;
    }

    if (!_primaryToolbarView.hidden) {
        [self addCursorRect:_primaryToolbarView.frame cursor:[NSCursor arrowCursor]];
    }
    if (!_secondaryOptionsView.hidden) {
        [self addCursorRect:_secondaryOptionsView.frame cursor:[NSCursor arrowCursor]];
    }

    CGFloat x = _selectionRect.origin.x;
    CGFloat y = _selectionRect.origin.y;
    CGFloat w = _selectionRect.size.width;
    CGFloat h = _selectionRect.size.height;
    CGFloat midX = x + w / 2.0;
    CGFloat midY = y + h / 2.0;

    [self addCursorRect:NSMakeRect(x - 8, y + h - 8, 16, 16) cursor:[NSCursor crosshairCursor]];
    [self addCursorRect:NSMakeRect(x + w - 8, y + h - 8, 16, 16) cursor:[NSCursor crosshairCursor]];
    [self addCursorRect:NSMakeRect(x + w - 8, y - 8, 16, 16) cursor:[NSCursor crosshairCursor]];
    [self addCursorRect:NSMakeRect(x - 8, y - 8, 16, 16) cursor:[NSCursor crosshairCursor]];

    [self addCursorRect:NSMakeRect(midX - 16, y + h - 6, 32, 12) cursor:[NSCursor resizeUpDownCursor]];
    [self addCursorRect:NSMakeRect(x + w - 6, midY - 16, 12, 32) cursor:[NSCursor resizeLeftRightCursor]];
    [self addCursorRect:NSMakeRect(midX - 16, y - 6, 32, 12) cursor:[NSCursor resizeUpDownCursor]];
    [self addCursorRect:NSMakeRect(x - 6, midY - 16, 12, 32) cursor:[NSCursor resizeLeftRightCursor]];

    if (_activeTool != ToolNone) {
        [self addCursorRect:_selectionRect cursor:[NSCursor crosshairCursor]];
    } else {
        [self addCursorRect:_selectionRect cursor:[NSCursor openHandCursor]];
    }

    [self addCursorRect:self.bounds cursor:[NSCursor arrowCursor]];
}

#pragma mark - Annotation Drawing Logic

- (void)startAnnotationAtPoint:(NSPoint)pt {
    // 1. Text, Tag, StepNote tools: launch symmetrical multi-line editor!
    if (_activeTool == ToolText || _activeTool == ToolTag || _activeTool == ToolStepNote) {
        [self commitInlineEditor];

        NSInteger step = _currentStepCount;
        _inlineEditor = [[AnnotationInlineEditorView alloc] initWithCenter:pt
                                                                 toolType:_activeTool
                                                                textStyle:_activeTextStyle
                                                                     step:step
                                                                    color:_activeColor
                                                                 fontSize:_activeFontSize];
        _inlineEditor.maxAllowedWidth = _selectionRect.size.width - 24.0;

        __weak typeof(self) weakSelf = self;
        _inlineEditor.onCommit = ^(NSString *text, AnnotationToolType type, AnnotationTextStyle style, NSPoint center, NSInteger sNum, CGFloat fSize) {
            [weakSelf handleCommitText:text type:type style:style center:center step:sNum fontSize:fSize];
        };
        _inlineEditor.onCancel = ^{
            [weakSelf cancelInlineEditor];
        };

        [self addSubview:_inlineEditor];
        [self.window makeFirstResponder:_inlineEditor.textView];
        return;
    }

    // 2. Pure Step badge tool
    if (_activeTool == ToolStep) {
        AnnotationItem *item = [[AnnotationItem alloc] init];
        item.toolType = ToolStep;
        item.startPoint = pt;
        item.endPoint = pt;
        item.color = _activeColor;
        item.stepNumber = _currentStepCount++;
        [_annotations addObject:item];
        _undoButton.enabled = YES;
        [self setNeedsDisplay:YES];
        return;
    }

    // 3. Continuous shape / brush drawing (Rect, Circle, Line, Arrow, Pencil, Highlight, Marker, Mosaic)
    AnnotationItem *item = [[AnnotationItem alloc] init];
    item.toolType = _activeTool;
    item.startPoint = pt;
    item.endPoint = pt;
    item.color = _activeColor;
    item.lineWidth = (_activeTool == ToolMarker) ? 18.0 : ((_activeTool == ToolMosaic) ? 26.0 : _activeLineWidth);
    [item.points addObject:[NSValue valueWithPoint:pt]];

    _currentDrawingItem = item;
}

- (void)updateAnnotationAtPoint:(NSPoint)pt {
    if (!_currentDrawingItem) return;
    _currentDrawingItem.endPoint = pt;
    [_currentDrawingItem.points addObject:[NSValue valueWithPoint:pt]];
}

- (void)finishAnnotation {
    if (_currentDrawingItem) {
        [_annotations addObject:_currentDrawingItem];
        _currentDrawingItem = nil;
        _undoButton.enabled = YES;
    }
}

- (void)handleCommitText:(NSString *)text type:(AnnotationToolType)type style:(AnnotationTextStyle)style center:(NSPoint)center step:(NSInteger)step fontSize:(CGFloat)fSize {
    if (text.length == 0) return;

    AnnotationItem *item = [[AnnotationItem alloc] init];
    item.toolType = type;
    item.textStyle = style;
    item.startPoint = center;
    item.endPoint = center;
    item.text = text;
    item.color = _activeColor;
    item.lineWidth = _activeLineWidth;
    item.fontSize = fSize;
    item.stepNumber = step;

    if (type == ToolStepNote) {
        _currentStepCount++;
    }

    [_annotations addObject:item];
    _undoButton.enabled = YES;
    [self cancelInlineEditor];
    [self setNeedsDisplay:YES];
}

- (void)commitInlineEditor {
    if (_inlineEditor) {
        [_inlineEditor commit];
        [self cancelInlineEditor];
    }
}

- (void)cancelInlineEditor {
    if (_inlineEditor) {
        [_inlineEditor removeFromSuperview];
        _inlineEditor = nil;
        [self.window makeFirstResponder:self];
    }
}

#pragma mark - Drawing / Rendering

- (void)drawRect:(NSRect)dirtyRect {
    [super drawRect:dirtyRect];

    // 1. Draw base screenshot
    if (_screenshotImage) {
        [_screenshotImage drawInRect:self.bounds fromRect:NSZeroRect operation:NSCompositingOperationCopy fraction:1.0];
    }

    // 2. Dim backdrop outside selection
    [[NSColor colorWithWhite:0.0 alpha:0.45] setFill];
    NSRectFillUsingOperation(self.bounds, NSCompositingOperationSourceOver);

    // 3. Clear window inside selection
    BOOL shouldDrawCutout = (_selectionRect.size.width > 2 && _selectionRect.size.height > 2);
    if (shouldDrawCutout) {
        if (_screenshotImage) {
            [_screenshotImage drawInRect:_selectionRect fromRect:_selectionRect operation:NSCompositingOperationCopy fraction:1.0];
        }

        [NSGraphicsContext saveGraphicsState];
        NSRectClip(_selectionRect);

        // Draw Watermark if active (Independent toggleable, tiled 45-degree)
        if (_isWatermarkActive) {
            [self renderWatermarkInRect:_selectionRect];
        }

        // Draw Annotations inside selection
        for (AnnotationItem *item in _annotations) {
            [self renderAnnotation:item];
        }
        if (_currentDrawingItem) {
            [self renderAnnotation:_currentDrawingItem];
        }

        // If Tag tool is actively editing, render the anchor dot and notch to the bubble editor!
        if (_inlineEditor && _inlineEditor.toolType == ToolTag) {
            [self renderTagNotchForEditor:_inlineEditor];
        }

        [NSGraphicsContext restoreGraphicsState];

        // 4. Blue selection border (Lark #336df4)
        NSColor *blueColor = [NSColor colorWithSRGBRed:0.20 green:0.43 blue:0.96 alpha:1.0];
        [blueColor setStroke];
        NSBezierPath *borderPath = [NSBezierPath bezierPathWithRect:_selectionRect];
        borderPath.lineWidth = 2.0;
        [borderPath stroke];

        // 5. 8 Handles
        CGFloat w = _selectionRect.size.width;
        CGFloat h = _selectionRect.size.height;
        CGFloat x = _selectionRect.origin.x;
        CGFloat y = _selectionRect.origin.y;

        [[NSColor whiteColor] setFill];
        [blueColor setStroke];

        NSPoint corners[4] = {
            NSMakePoint(x, y),
            NSMakePoint(x + w, y),
            NSMakePoint(x + w, y + h),
            NSMakePoint(x, y + h)
        };
        for (int i = 0; i < 4; i++) {
            NSRect dotRect = NSMakeRect(corners[i].x - 3.5, corners[i].y - 3.5, 7, 7);
            NSBezierPath *dot = [NSBezierPath bezierPathWithOvalInRect:dotRect];
            [dot fill];
            dot.lineWidth = 1.5;
            [dot stroke];
        }

        NSRect edgePills[4] = {
            NSMakeRect(x + (w - 18) / 2.0, y - 2.5, 18, 5),          // Bottom
            NSMakeRect(x + w - 2.5, y + (h - 18) / 2.0, 5, 18),      // Right
            NSMakeRect(x + (w - 18) / 2.0, y + h - 2.5, 18, 5),      // Top
            NSMakeRect(x - 2.5, y + (h - 18) / 2.0, 5, 18)           // Left
        };
        for (int i = 0; i < 4; i++) {
            NSBezierPath *pill = [NSBezierPath bezierPathWithRoundedRect:edgePills[i] xRadius:2.5 yRadius:2.5];
            [pill fill];
            pill.lineWidth = 1.0;
            [pill stroke];
        }
    }
}

- (void)renderTagNotchForEditor:(AnnotationInlineEditorView *)editor {
    NSPoint anchor = editor.centerPoint;
    NSRect bubble = editor.frame;

    // Anchor dot with white ring
    NSBezierPath *anchorDot = [NSBezierPath bezierPathWithOvalInRect:NSMakeRect(anchor.x - 4.5, anchor.y - 4.5, 9.0, 9.0)];
    [editor.activeColor setFill];
    [anchorDot fill];
    [[NSColor whiteColor] setStroke];
    anchorDot.lineWidth = 1.5;
    [anchorDot stroke];

    // Seamless triangular notch to bubble
    NSBezierPath *notch = [NSBezierPath bezierPath];
    [notch moveToPoint:NSMakePoint(anchor.x + 5.0, anchor.y)];
    [notch lineToPoint:NSMakePoint(bubble.origin.x, anchor.y + 6.0)];
    [notch lineToPoint:NSMakePoint(bubble.origin.x, anchor.y - 6.0)];
    [notch closePath];
    [[NSColor colorWithSRGBRed:0.17 green:0.18 blue:0.23 alpha:0.96] setFill];
    [notch fill];
}

- (void)renderWatermarkInRect:(NSRect)bounds {
    NSString *wm = (_watermarkText.length > 0) ? _watermarkText : [I18N tr:@"wmInternalOnly"];
    NSDictionary *attrs = @{
        NSFontAttributeName: [NSFont systemFontOfSize:15 weight:NSFontWeightBold],
        NSForegroundColorAttributeName: [NSColor colorWithWhite:1.0 alpha:0.22]
    };
    NSSize strSize = [wm sizeWithAttributes:attrs];

    NSGraphicsContext *gc = [NSGraphicsContext currentContext];
    CGContextRef ctx = gc.CGContext;
    CGContextSaveGState(ctx);

    for (CGFloat wy = bounds.origin.y - 100; wy < bounds.origin.y + bounds.size.height + 100; wy += 120.0) {
        for (CGFloat wx = bounds.origin.x - 100; wx < bounds.origin.x + bounds.size.width + 100; wx += 200.0) {
            CGContextSaveGState(ctx);
            CGContextTranslateCTM(ctx, wx, wy);
            CGContextRotateCTM(ctx, M_PI / 4.0);
            [wm drawAtPoint:NSMakePoint(-strSize.width / 2.0, -strSize.height / 2.0) withAttributes:attrs];
            CGContextRestoreGState(ctx);
        }
    }
    CGContextRestoreGState(ctx);
}

- (void)renderAnnotation:(AnnotationItem *)item {
    [item.color setStroke];
    [item.color setFill];

    CGFloat x = MIN(item.startPoint.x, item.endPoint.x);
    CGFloat y = MIN(item.startPoint.y, item.endPoint.y);
    CGFloat w = fabs(item.startPoint.x - item.endPoint.x);
    CGFloat h = fabs(item.startPoint.y - item.endPoint.y);
    NSRect r = NSMakeRect(x, y, w, h);

    switch (item.toolType) {
        case ToolRect: {
            NSBezierPath *path = [NSBezierPath bezierPathWithRoundedRect:r xRadius:4.0 yRadius:4.0];
            path.lineWidth = item.lineWidth;
            [path stroke];
            break;
        }
        case ToolCircle: {
            NSBezierPath *path = [NSBezierPath bezierPathWithOvalInRect:r];
            path.lineWidth = item.lineWidth;
            [path stroke];
            break;
        }
        case ToolLine: {
            NSBezierPath *path = [NSBezierPath bezierPath];
            [path moveToPoint:item.startPoint];
            [path lineToPoint:item.endPoint];
            path.lineWidth = item.lineWidth;
            path.lineCapStyle = NSLineCapStyleRound;
            [path stroke];
            break;
        }
        case ToolArrow: {
            NSBezierPath *path = [NSBezierPath bezierPath];
            [path moveToPoint:item.startPoint];
            [path lineToPoint:item.endPoint];
            path.lineWidth = item.lineWidth;
            path.lineCapStyle = NSLineCapStyleRound;
            [path stroke];

            CGFloat angle = atan2(item.endPoint.y - item.startPoint.y, item.endPoint.x - item.startPoint.x);
            CGFloat arrowLen = 14.0 + item.lineWidth;
            CGFloat arrowAngle = M_PI / 6.0;

            NSPoint p1 = NSMakePoint(item.endPoint.x - arrowLen * cos(angle - arrowAngle),
                                     item.endPoint.y - arrowLen * sin(angle - arrowAngle));
            NSPoint p2 = NSMakePoint(item.endPoint.x - arrowLen * cos(angle + arrowAngle),
                                     item.endPoint.y - arrowLen * sin(angle + arrowAngle));

            NSBezierPath *head = [NSBezierPath bezierPath];
            [head moveToPoint:item.endPoint];
            [head lineToPoint:p1];
            [head lineToPoint:p2];
            [head closePath];
            [head fill];
            break;
        }
        case ToolPencil: {
            if (item.points.count < 2) break;
            NSBezierPath *path = [NSBezierPath bezierPath];
            path.lineWidth = item.lineWidth;
            path.lineCapStyle = NSLineCapStyleRound;
            path.lineJoinStyle = NSLineJoinStyleRound;
            [path moveToPoint:[item.points[0] pointValue]];
            for (NSUInteger i = 1; i < item.points.count; i++) {
                [path lineToPoint:[item.points[i] pointValue]];
            }
            [path stroke];
            break;
        }
        case ToolHighlight: {
            NSColor *tintColor = [item.color colorWithAlphaComponent:0.25];
            [tintColor setFill];
            NSBezierPath *box = [NSBezierPath bezierPathWithRoundedRect:r xRadius:4.0 yRadius:4.0];
            [box fill];
            [[item.color colorWithAlphaComponent:0.85] setStroke];
            box.lineWidth = 2.0;
            [box stroke];
            break;
        }
        case ToolMarker: {
            if (item.points.count < 2) break;
            [NSGraphicsContext saveGraphicsState];
            [[item.color colorWithAlphaComponent:0.38] setStroke];
            NSBezierPath *path = [NSBezierPath bezierPath];
            path.lineWidth = 18.0;
            path.lineCapStyle = NSLineCapStyleRound;
            path.lineJoinStyle = NSLineJoinStyleRound;
            [path moveToPoint:[item.points[0] pointValue]];
            for (NSUInteger i = 1; i < item.points.count; i++) {
                [path lineToPoint:[item.points[i] pointValue]];
            }
            [path stroke];
            [NSGraphicsContext restoreGraphicsState];
            break;
        }
        case ToolMosaic: {
            // Freehand mosaic brush along winding path:
            // "马赛克的用法应该类似马克笔的操作，不是选择区域进行马赛克，而是可以蜿蜒曲折的划，想让哪有马赛克都行。"
            if (!_screenshotImage || item.points.count == 0) break;

            NSGraphicsContext *gc = [NSGraphicsContext currentContext];
            CGContextRef ctx = gc.CGContext;
            CGContextSaveGState(ctx);

            // Construct stroked path
            NSBezierPath *bPath = [NSBezierPath bezierPath];
            bPath.lineWidth = 26.0;
            CGMutablePathRef cgPath = CGPathCreateMutable();
            NSPoint pt0 = [item.points[0] pointValue];
            CGPathMoveToPoint(cgPath, NULL, pt0.x, pt0.y);
            for (NSUInteger i = 1; i < item.points.count; i++) {
                NSPoint pt = [item.points[i] pointValue];
                CGPathAddLineToPoint(cgPath, NULL, pt.x, pt.y);
            }

            // Clip context to the stroked brush path
            CGContextAddPath(ctx, cgPath);
            CGPathRelease(cgPath);
                CGContextSetLineWidth(ctx, 26.0);
                CGContextSetLineCap(ctx, kCGLineCapRound);
                CGContextSetLineJoin(ctx, kCGLineJoinRound);
                CGContextReplacePathWithStrokedPath(ctx);
                CGContextClip(ctx);

                // Draw downsampled pixelated screenshot inside clipped region
                CGFloat scale = self.window.backingScaleFactor ?: 2.0;
                CGImageRef fullCG = [_screenshotImage CGImageForProposedRect:NULL context:nil hints:nil];
                if (fullCG) {
                    CGRect boundsCG = NSRectToCGRect(self.bounds);
                    int blockW = MAX(4, (int)(boundsCG.size.width / 10.0));
                    int blockH = MAX(4, (int)(boundsCG.size.height / 10.0));

                    CGColorSpaceRef cs = CGColorSpaceCreateDeviceRGB();
                    CGContextRef smallCtx = CGBitmapContextCreate(NULL, blockW, blockH, 8, blockW * 4,
                                                                  cs, (CGBitmapInfo)kCGImageAlphaPremultipliedLast);
                    if (smallCtx) {
                        CGContextSetInterpolationQuality(smallCtx, kCGInterpolationNone);
                        CGContextDrawImage(smallCtx, CGRectMake(0, 0, blockW, blockH), fullCG);
                        CGImageRef pixelated = CGBitmapContextCreateImage(smallCtx);
                        if (pixelated) {
                            CGContextSetInterpolationQuality(ctx, kCGInterpolationNone);
                            CGContextDrawImage(ctx, boundsCG, pixelated);
                            CGImageRelease(pixelated);
                        }
                        CGContextRelease(smallCtx);
                    }
                    CGColorSpaceRelease(cs);
                }

            CGContextRestoreGState(ctx);
            break;
        }
        case ToolTag: {
            // Lark Tag Bubble: Anchor dot with ring + notch + rounded box + centered text
            // "第一张截图是lark的标签"
            if (!item.text || item.text.length == 0) break;

            NSPoint anchor = item.startPoint;
            CGFloat centerY = item.startPoint.y;

            NSArray *lines = [item.text componentsSeparatedByString:@"\n"];
            CGFloat fSize = item.fontSize ?: 14.0;
            NSDictionary *attrs = @{
                NSFontAttributeName: [NSFont systemFontOfSize:fSize weight:NSFontWeightMedium],
                NSForegroundColorAttributeName: [NSColor whiteColor]
            };

            CGFloat maxTextW = 0;
            for (NSString *l in lines) {
                NSSize s = [l sizeWithAttributes:attrs];
                if (s.width > maxTextW) maxTextW = s.width;
            }

            CGFloat lineHeight = fSize * 1.35;
            CGFloat totalTextH = lines.count * lineHeight;
            CGFloat bW = MAX(42.0, maxTextW + 20.0);
            CGFloat bH = MAX(28.0, totalTextH + 10.0);

            // Centered symmetrically around centerY!
            CGFloat bubbleX = anchor.x + 14.0;
            CGFloat bubbleY = centerY - bH / 2.0;
            NSRect bubbleRect = NSMakeRect(bubbleX, bubbleY, bW, bH);

            // 1. Anchor dot (radius 4.5px, colored fill with 1.5px white ring)
            NSBezierPath *anchorDot = [NSBezierPath bezierPathWithOvalInRect:NSMakeRect(anchor.x - 4.5, centerY - 4.5, 9.0, 9.0)];
            [item.color setFill];
            [anchorDot fill];
            [[NSColor whiteColor] setStroke];
            anchorDot.lineWidth = 1.5;
            [anchorDot stroke];

            // 2. Triangular notch seamlessly meeting the bubble
            NSBezierPath *notch = [NSBezierPath bezierPath];
            [notch moveToPoint:NSMakePoint(anchor.x + 5.0, centerY)];
            [notch lineToPoint:NSMakePoint(bubbleX, centerY + 6.0)];
            [notch lineToPoint:NSMakePoint(bubbleX, centerY - 6.0)];
            [notch closePath];
            [[NSColor colorWithSRGBRed:0.17 green:0.18 blue:0.23 alpha:0.96] setFill];
            [notch fill];

            // 3. Charcoal rounded callout bubble #2b2f3a
            NSBezierPath *bubble = [NSBezierPath bezierPathWithRoundedRect:bubbleRect xRadius:6.0 yRadius:6.0];
            [[NSColor colorWithSRGBRed:0.17 green:0.18 blue:0.23 alpha:0.96] setFill];
            [bubble fill];

            // 4. Centered text
            NSFont *tagFont = [NSFont systemFontOfSize:fSize weight:NSFontWeightMedium];
            CGFloat firstLineY = (centerY + (lines.count - 1) * lineHeight / 2.0) - fabs(tagFont.descender) - (tagFont.capHeight / 2.0);
            for (NSInteger i = 0; i < lines.count; i++) {
                NSString *l = lines[i];
                NSSize lSize = [l sizeWithAttributes:attrs];
                NSPoint p = NSMakePoint(bubbleX + (bW - lSize.width) / 2.0, firstLineY - i * lineHeight);
                [l drawAtPoint:p withAttributes:attrs];
            }
            break;
        }
        case ToolStep: {
            // Pure Step Badge: filled circle with number in center
            CGFloat radius = 11.0;
            NSRect circleRect = NSMakeRect(item.startPoint.x - radius, item.startPoint.y - radius, radius * 2, radius * 2);
            NSBezierPath *circle = [NSBezierPath bezierPathWithOvalInRect:circleRect];
            [item.color setFill];
            [circle fill];

            NSString *numStr = [NSString stringWithFormat:@"%ld", (long)item.stepNumber];
            NSFont *font = [NSFont systemFontOfSize:11 weight:NSFontWeightBold];
            NSDictionary *attrs = @{
                NSFontAttributeName: font,
                NSForegroundColorAttributeName: [NSColor whiteColor]
            };
            NSSize strSize = [numStr sizeWithAttributes:attrs];
            CGFloat glyphDrawY = item.startPoint.y - fabs(font.descender) - (font.capHeight / 2.0);
            NSPoint strPt = NSMakePoint(item.startPoint.x - strSize.width / 2.0, glyphDrawY);
            [numStr drawAtPoint:strPt withAttributes:attrs];
            break;
        }
        case ToolStepNote:
        case ToolText: {
            if (!item.text || item.text.length == 0) break;

            BOOL isStep = (item.toolType == ToolStepNote);
            CGFloat centerY = item.startPoint.y;
            CGFloat fSize = item.fontSize ?: 14.0;
            NSArray *lines = [item.text componentsSeparatedByString:@"\n"];

            NSDictionary *textAttrs = @{
                NSFontAttributeName: [NSFont systemFontOfSize:fSize weight:NSFontWeightMedium],
                NSForegroundColorAttributeName: (item.textStyle == TextStyleFilled) ? [NSColor whiteColor] : item.color
            };

            CGFloat maxTextW = 0;
            for (NSString *l in lines) {
                NSSize s = [l sizeWithAttributes:textAttrs];
                if (s.width > maxTextW) maxTextW = s.width;
            }

            CGFloat lineHeight = fSize * 1.35;
            CGFloat totalTextH = lines.count * lineHeight;
            CGFloat badgeDiameter = 22.0;
            CGFloat contentH = isStep ? MAX(badgeDiameter, totalTextH) : totalTextH;
            CGFloat padX = 6.0;
            CGFloat padY = 4.0;
            CGFloat badgeW = isStep ? (badgeDiameter + 6.0) : 0.0;
            CGFloat totalW = maxTextW + padX * 2 + badgeW;
            CGFloat totalH = contentH + padY * 2;

            // Expand UP and DOWN symmetrically around centerY!
            CGFloat boxX = item.startPoint.x;
            CGFloat boxY = centerY - totalH / 2.0;
            NSRect boxRect = NSMakeRect(boxX, boxY, totalW, totalH);

            // Unified Background Card
            if (item.textStyle == TextStyleFilled) {
                // Style 1: Filled solid color card
                NSBezierPath *card = [NSBezierPath bezierPathWithRoundedRect:boxRect xRadius:5.0 yRadius:5.0];
                [item.color setFill];
                [card fill];
            } else if (item.textStyle == TextStyleBordered) {
                // Style 2: Bordered card
                NSBezierPath *card = [NSBezierPath bezierPathWithRoundedRect:boxRect xRadius:5.0 yRadius:5.0];
                [[NSColor colorWithWhite:0.0 alpha:0.45] setFill];
                [card fill];
                [item.color setStroke];
                card.lineWidth = 1.5;
                [card stroke];
            }

            // Step Badge: ALWAYS centered vertically at centerY!
            if (isStep) {
                CGFloat badgeX = boxX + padX;
                CGFloat badgeY = centerY - 11.0;
                NSRect bRect = NSMakeRect(badgeX, badgeY, badgeDiameter, badgeDiameter);
                NSBezierPath *badgeCircle = [NSBezierPath bezierPathWithOvalInRect:bRect];

                if (item.textStyle == TextStyleFilled) {
                    [[NSColor whiteColor] setFill];
                    [badgeCircle fill];
                } else {
                    [item.color setFill];
                    [badgeCircle fill];
                }

                NSString *numStr = [NSString stringWithFormat:@"%ld", (long)item.stepNumber];
                NSFont *numFont = [NSFont systemFontOfSize:11 weight:NSFontWeightBold];
                NSDictionary *numAttrs = @{
                    NSFontAttributeName: numFont,
                    NSForegroundColorAttributeName: (item.textStyle == TextStyleFilled) ? [NSColor colorWithSRGBRed:0.1 green:0.1 blue:0.15 alpha:1.0] : [NSColor whiteColor]
                };
                NSSize numSize = [numStr sizeWithAttributes:numAttrs];
                CGFloat numGlyphY = centerY - fabs(numFont.descender) - (numFont.capHeight / 2.0);
                [numStr drawAtPoint:NSMakePoint(badgeX + (badgeDiameter - numSize.width) / 2.0, numGlyphY) withAttributes:numAttrs];
            }

            // Text lines centered vertically around centerY
            NSFont *textFont = [NSFont systemFontOfSize:fSize weight:NSFontWeightMedium];
            CGFloat firstLineY = (centerY + (lines.count - 1) * lineHeight / 2.0) - fabs(textFont.descender) - (textFont.capHeight / 2.0);
            CGFloat textStartX = boxX + padX + badgeW;

            for (NSInteger i = 0; i < lines.count; i++) {
                NSString *l = lines[i];
                NSPoint p = NSMakePoint(textStartX, firstLineY - i * lineHeight);
                [l drawAtPoint:p withAttributes:textAttrs];
            }
            break;
        }
        default: break;
    }
}

- (NSImage *)compositeAnnotatedImage {
    if (!_hasSelection || _selectionRect.size.width <= 0 || _selectionRect.size.height <= 0 || !_screenshotImage) {
        return nil;
    }

    [self commitInlineEditor];

    NSSize selSize = _selectionRect.size;
    NSImage *composite = [[NSImage alloc] initWithSize:selSize];
    [composite lockFocus];

    [_screenshotImage drawInRect:NSMakeRect(0, 0, selSize.width, selSize.height)
                        fromRect:_selectionRect
                       operation:NSCompositingOperationCopy
                        fraction:1.0];

    NSAffineTransform *trans = [NSAffineTransform transform];
    [trans translateXBy:-_selectionRect.origin.x yBy:-_selectionRect.origin.y];
    [trans concat];

    if (_isWatermarkActive) {
        [self renderWatermarkInRect:_selectionRect];
    }

    for (AnnotationItem *item in _annotations) {
        [self renderAnnotation:item];
    }

    [composite unlockFocus];
    return composite;
}

#pragma mark - Actions

- (void)primaryToolbarAction:(NSButton *)sender {
    NSInteger tag = sender.tag;
    switch (tag) {
        case 0: break; // Grip
        case 1: [self selectTool:ToolRect button:sender]; break;
        case 2: [self selectTool:ToolCircle button:sender]; break;
        case 3: [self selectTool:ToolLine button:sender]; break;
        case 4: [self selectTool:ToolArrow button:sender]; break;
        case 5: [self selectTool:ToolTag button:sender]; break;
        case 6: [self selectTool:ToolText button:sender]; break;
        case 7: [self selectTool:ToolPencil button:sender]; break;
        case 8: [self selectTool:ToolStep button:sender]; break;
        case 9: [self selectTool:ToolStepNote button:sender]; break;
        case 10: [self selectTool:ToolMosaic button:sender]; break;
        case 11: [self selectTool:ToolHighlight button:sender]; break;
        case 12: [self selectTool:ToolMarker button:sender]; break;
        case 13: [self selectTool:ToolWatermark button:sender]; break;
        case 14: [self pinAction]; break;
        case 15: [self undoAction]; break;
        case 16: [self saveAction]; break;
        case 17: [self cancelAction]; break;
        case 18: [self confirmAction]; break;
        default: break;
    }
}

- (void)selectTool:(AnnotationToolType)tool button:(NSButton *)sender {
    if (_activeTool == tool) {
        _activeTool = ToolNone;
        sender.state = NSControlStateValueOff;
        if (@available(macOS 10.14, *)) {
            sender.contentTintColor = [NSColor whiteColor];
        }
    } else {
        _activeTool = tool;
        _lastSecondaryTool = tool;
        for (NSButton *btn in _primaryButtons) {
            if (btn.tag >= 1 && btn.tag <= 13) {
                btn.state = (btn == sender) ? NSControlStateValueOn : NSControlStateValueOff;
                if (@available(macOS 10.14, *)) {
                    btn.contentTintColor = (btn == sender) ? [NSColor colorWithSRGBRed:0.20 green:0.43 blue:0.96 alpha:1.0] : [NSColor whiteColor];
                }
            }
        }
    }

    [self rebuildSecondaryToolbar];
    [self updateToolbarPositions];
    [self setNeedsDisplay:YES];
}

- (void)toggleWatermarkCheckboxAction:(NSButton *)sender {
    _isWatermarkActive = !_isWatermarkActive;
    [self updateWatermarkUIState];
    [self setNeedsDisplay:YES];
}

- (void)textStyleAction:(NSButton *)sender {
    _activeTextStyle = (AnnotationTextStyle)sender.tag;
    for (NSButton *btn in _styleButtons) {
        btn.layer.borderWidth = (btn == sender) ? 1.5 : 0.5;
        btn.layer.borderColor = (btn == sender) ? [[NSColor colorWithSRGBRed:0.20 green:0.43 blue:0.96 alpha:1.0] CGColor] : [[NSColor colorWithWhite:1.0 alpha:0.18] CGColor];
    }
}

- (void)fontSizeAction:(NSButton *)sender {
    CGFloat sizes[] = { 12.0, 14.0, 18.0 };
    _activeFontSize = sizes[sender.tag];
}

- (void)watermarkPresetAction:(NSButton *)sender {
    NSArray *presets = @[[I18N tr:@"wmInternalOnly"], [I18N tr:@"wmConfidential"], [I18N tr:@"wmForReview"], [I18N tr:@"wmBrand"]];
    if (sender.tag < presets.count) {
        _watermarkText = presets[sender.tag];
        _isWatermarkActive = YES;
        if (_watermarkInputField) {
            _watermarkInputField.stringValue = _watermarkText;
        }
        [self updateWatermarkUIState];
        [self setNeedsDisplay:YES];
    }
}

- (void)controlTextDidChange:(NSNotification *)notification {
    if (notification.object == _watermarkInputField) {
        _watermarkText = _watermarkInputField.stringValue;
        _isWatermarkActive = YES;
        [self updateWatermarkUIState];
        [self setNeedsDisplay:YES];
    }
}

- (void)watermarkCustomInputChanged:(NSTextField *)sender {
    _watermarkText = [sender.stringValue stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
    _isWatermarkActive = YES;
    [self updateWatermarkUIState];
    [self setNeedsDisplay:YES];
}

- (void)strokeSizeAction:(NSButton *)sender {
    CGFloat strokeMap[] = { 2.0, 4.0, 8.0 };
    _activeLineWidth = strokeMap[sender.tag];

    for (NSButton *btn in _sizeButtons) {
        btn.layer.borderWidth = (btn == sender) ? 1.5 : 0.0;
    }
}

- (void)colorPickAction:(NSButton *)sender {
    NSArray *colors = @[
        [NSColor colorWithSRGBRed:0.96 green:0.29 blue:0.27 alpha:1.0],
        [NSColor colorWithSRGBRed:1.00 green:0.78 blue:0.05 alpha:1.0],
        [NSColor colorWithSRGBRed:0.20 green:0.75 blue:0.29 alpha:1.0],
        [NSColor colorWithSRGBRed:0.20 green:0.43 blue:0.96 alpha:1.0],
        [NSColor colorWithSRGBRed:0.12 green:0.14 blue:0.16 alpha:1.0],
        [NSColor colorWithSRGBRed:0.56 green:0.58 blue:0.62 alpha:1.0],
        [NSColor whiteColor]
    ];
    _activeColor = colors[sender.tag];

    for (NSButton *btn in _colorButtons) {
        if (btn == sender) {
            btn.title = @"✓";
            btn.font = [NSFont systemFontOfSize:13 weight:NSFontWeightBold];
            if (@available(macOS 10.14, *)) {
                btn.contentTintColor = (btn.tag == 1 || btn.tag == 6) ? [NSColor blackColor] : [NSColor whiteColor];
            }
        } else {
            btn.title = @"";
        }
    }
}

- (void)undoAction {
    [self commitInlineEditor];
    if (_annotations.count > 0) {
        [_annotations removeLastObject];
        _undoButton.enabled = (_annotations.count > 0);
        [self setNeedsDisplay:YES];
    }
}

- (void)pinAction {
    [self commitInlineEditor];
    NSImage *img = [self compositeAnnotatedImage];
    if (!img) return;

    NSString *pinId = [NSString stringWithFormat:@"pin_%ld", (long)[[NSDate date] timeIntervalSince1970]];
    NSString *tmpPath = [NSTemporaryDirectory() stringByAppendingPathComponent:[NSString stringWithFormat:@"%@.png", pinId]];

    NSBitmapImageRep *rep = [NSBitmapImageRep imageRepWithData:[img TIFFRepresentation]];
    NSData *pngData = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
    [pngData writeToFile:tmpPath atomically:YES];

    NSRect r = _selectionRect;
    [self cancelAction];

    createPin(@{
        @"pinId": pinId,
        @"imagePath": tmpPath,
        @"x": @(r.origin.x),
        @"y": @(self.bounds.size.height - r.origin.y - r.size.height),
        @"width": @(r.size.width),
        @"height": @(r.size.height)
    });
}

- (void)confirmAction {
    [self commitInlineEditor];
    NSImage *img = [self compositeAnnotatedImage];
    if (img) {
        NSPasteboard *pb = [NSPasteboard generalPasteboard];
        [pb clearContents];
        [pb writeObjects:@[img]];

        dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_BACKGROUND, 0), ^{
            NSString *home = NSHomeDirectory();
            NSString *imgDir = [home stringByAppendingPathComponent:@".mark-suite/clipboard/images"];
            [[NSFileManager defaultManager] createDirectoryAtPath:imgDir withIntermediateDirectories:YES attributes:nil error:nil];
            NSString *fileId = [NSString stringWithFormat:@"capture_%ld.png", (long)[[NSDate date] timeIntervalSince1970]];
            NSString *fullPath = [imgDir stringByAppendingPathComponent:fileId];

            NSBitmapImageRep *rep = [NSBitmapImageRep imageRepWithData:[img TIFFRepresentation]];
            NSData *pngData = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
            [pngData writeToFile:fullPath atomically:YES];
        });

        sendEvent(@{ @"event": @"captured-and-copied" });
    }
    [self cancelAction];
}

- (void)saveAction {
    [self commitInlineEditor];
    NSImage *img = [self compositeAnnotatedImage];
    if (!img) return;

    [self cancelAction];

    NSSavePanel *savePanel = [NSSavePanel savePanel];
    if (@available(macOS 11.0, *)) {
        savePanel.allowedContentTypes = @[[UTType typeWithIdentifier:@"public.png"]];
    }
    savePanel.canCreateDirectories = YES;
    savePanel.nameFieldStringValue = [NSString stringWithFormat:@"Screenshot_%ld.png", (long)[[NSDate date] timeIntervalSince1970]];
    [savePanel beginWithCompletionHandler:^(NSModalResponse result) {
        if (result == NSModalResponseOK && savePanel.URL) {
            NSURL *destURL = savePanel.URL;
            if (![destURL.path.lowercaseString hasSuffix:@".png"]) {
                destURL = [destURL URLByAppendingPathExtension:@"png"];
            }
            NSBitmapImageRep *rep = [NSBitmapImageRep imageRepWithData:[img TIFFRepresentation]];
            NSData *pngData = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
            [pngData writeToURL:destURL atomically:YES];
            sendEvent(@{ @"event": @"captured-and-saved", @"path": destURL.path ?: @"" });
        }
    }];
}

- (void)cancelAction {
    if (gCapturePanel) {
        [gCapturePanel close];
        gCapturePanel = nil;
    }
    sendEvent(@{ @"event": @"capture-cancelled" });
}

- (void)selectToolByTag:(NSInteger)tag {
    for (NSButton *btn in _primaryButtons) {
        if (btn.tag == tag) {
            [self primaryToolbarAction:btn];
            break;
        }
    }
}

- (void)keyDown:(NSEvent *)event {
    NSString *chars = event.charactersIgnoringModifiers;
    if (event.keyCode == 53) {
        [self cancelAction];
    } else if (event.keyCode == 36) {
        [self confirmAction];
    } else if ([chars isEqualToString:@"p"] || [chars isEqualToString:@"P"]) {
        [self pinAction];
    } else if ((event.modifierFlags & NSEventModifierFlagCommand) && [chars isEqualToString:@"z"]) {
        [self undoAction];
    } else if ((event.modifierFlags & NSEventModifierFlagCommand) && [chars isEqualToString:@"s"]) {
        [self saveAction];
    } else if ([chars isEqualToString:@"1"] || [chars isEqualToString:@"r"] || [chars isEqualToString:@"R"]) {
        [self selectToolByTag:1];
    } else if ([chars isEqualToString:@"2"] || [chars isEqualToString:@"c"] || [chars isEqualToString:@"C"]) {
        [self selectToolByTag:2];
    } else if ([chars isEqualToString:@"3"] || [chars isEqualToString:@"l"] || [chars isEqualToString:@"L"]) {
        [self selectToolByTag:3];
    } else if ([chars isEqualToString:@"4"] || [chars isEqualToString:@"a"] || [chars isEqualToString:@"A"]) {
        [self selectToolByTag:4];
    } else if ([chars isEqualToString:@"5"] || [chars isEqualToString:@"g"] || [chars isEqualToString:@"G"]) {
        [self selectToolByTag:5];
    } else if ([chars isEqualToString:@"6"] || [chars isEqualToString:@"t"] || [chars isEqualToString:@"T"]) {
        [self selectToolByTag:6];
    } else if ([chars isEqualToString:@"7"]) {
        [self selectToolByTag:7];
    } else if ([chars isEqualToString:@"8"] || [chars isEqualToString:@"s"] || [chars isEqualToString:@"S"]) {
        [self selectToolByTag:8];
    } else if ([chars isEqualToString:@"9"]) {
        [self selectToolByTag:9];
    } else if ([chars isEqualToString:@"m"] || [chars isEqualToString:@"M"]) {
        [self selectToolByTag:10];
    } else if ([chars isEqualToString:@"h"] || [chars isEqualToString:@"H"]) {
        [self selectToolByTag:11];
    } else if ([chars isEqualToString:@"w"] || [chars isEqualToString:@"W"]) {
        [self selectToolByTag:13];
    }
}

- (BOOL)acceptsFirstResponder { return YES; }

@end

static void showCaptureOverlay(NSScreen *screen, NSImage *screenshot) {
    NSRect screenRect = screen.frame;
    gCapturePanel = [[CapturePanel alloc] initWithContentRect:screenRect
                                                    styleMask:NSWindowStyleMaskBorderless
                                                      backing:NSBackingStoreBuffered
                                                        defer:NO];
    gCapturePanel.level = NSStatusWindowLevel;
    gCapturePanel.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces |
                                       NSWindowCollectionBehaviorFullScreenAuxiliary;
    gCapturePanel.backgroundColor = [NSColor clearColor];
    gCapturePanel.opaque = NO;
    gCapturePanel.hasShadow = NO;
    gCapturePanel.appearance = AppTheme.currentTheme.isDark ?
        [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua] :
        [NSAppearance appearanceNamed:NSAppearanceNameAqua];

    CaptureOverlayView *overlay = [[CaptureOverlayView alloc] initWithFrame:NSMakeRect(0, 0, screenRect.size.width, screenRect.size.height)
                                                                screenshot:screenshot];
    gCapturePanel.overlayView = overlay;
    gCapturePanel.contentView = overlay;

    [NSApp activateIgnoringOtherApps:YES];
    [gCapturePanel makeKeyAndOrderFront:nil];
    [gCapturePanel makeFirstResponder:overlay];
    sendEvent(@{ @"event": @"capture-started" });
}

static void startNativeCapture(NSString *passedImagePath) {
    dispatch_async(dispatch_get_main_queue(), ^{
        [AppTheme loadUserPreferences];
        if (gClipboardPanel) {
            [gClipboardPanel close];
            gClipboardPanel = nil;
        }
        if (gCapturePanel) {
            [gCapturePanel close];
            gCapturePanel = nil;
        }

        NSScreen *targetScreen = [NSScreen mainScreen];
        NSPoint mousePoint = [NSEvent mouseLocation];
        for (NSScreen *s in [NSScreen screens]) {
            if (NSPointInRect(mousePoint, s.frame)) {
                targetScreen = s;
                break;
            }
        }

        if (passedImagePath && [[NSFileManager defaultManager] fileExistsAtPath:passedImagePath]) {
            NSImage *img = [[NSImage alloc] initWithContentsOfFile:passedImagePath];
            if (img) {
                showCaptureOverlay(targetScreen, img);
                return;
            }
        }

        NSString *tmpPath = [NSTemporaryDirectory() stringByAppendingPathComponent:[NSString stringWithFormat:@"marknote_cap_%ld.png", (long)[[NSDate date] timeIntervalSince1970]]];
        NSTask *task = [[NSTask alloc] init];
        task.launchPath = @"/usr/sbin/screencapture";
        task.arguments = @[@"-x", tmpPath];
        [task launch];
        [task waitUntilExit];

        if ([[NSFileManager defaultManager] fileExistsAtPath:tmpPath]) {
            NSImage *nsImg = [[NSImage alloc] initWithContentsOfFile:tmpPath];
            [[NSFileManager defaultManager] removeItemAtPath:tmpPath error:nil];
            if (nsImg) {
                showCaptureOverlay(targetScreen, nsImg);
                return;
            }
        }

        if (@available(macOS 14.0, *)) {
            [SCShareableContent getShareableContentWithCompletionHandler:^(SCShareableContent *content, NSError *error) {
                if (content && content.displays.count > 0) {
                    SCDisplay *disp = content.displays[0];
                    SCContentFilter *filter = [[SCContentFilter alloc] initWithDisplay:disp excludingWindows:@[]];
                    SCStreamConfiguration *config = [[SCStreamConfiguration alloc] init];
                    config.width = disp.width;
                    config.height = disp.height;
                    [SCScreenshotManager captureImageWithFilter:filter configuration:config completionHandler:^(CGImageRef imgRef, NSError *err) {
                        if (imgRef) {
                            dispatch_async(dispatch_get_main_queue(), ^{
                                NSImage *nsImg = [[NSImage alloc] initWithCGImage:imgRef size:targetScreen.frame.size];
                                showCaptureOverlay(targetScreen, nsImg);
                            });
                        }
                    }];
                }
            }];
        }
    });
}

#pragma mark - Native Clipboard History Panel

typedef NS_ENUM(NSInteger, ClipboardCategory) {
    CatAll = 0,
    CatImage = 1,
    CatText = 2
};

@interface ClipboardRowCellView : NSTableCellView
@property (nonatomic, strong) NSImageView *thumbImageView;
@property (nonatomic, strong) NSTextField *titleLabel;
@property (nonatomic, strong) NSTextField *subLabel;
@property (nonatomic, strong) NSView *actionsContainer;
@property (nonatomic, strong) HoverButton *pinBtn;
@property (nonatomic, strong) HoverButton *rowCopyBtn;
@property (nonatomic, strong) HoverButton *deleteBtn;
@property (nonatomic, assign) BOOL isRowHovered;
@property (nonatomic, assign) BOOL isRowSelected;
@property (nonatomic, assign) BOOL isTextItem;
@property (nonatomic, strong) NSTrackingArea *trackingArea;
- (void)updateActionsVisibility;
- (void)updateThumbTintColor;
@end

@implementation ClipboardRowCellView

- (instancetype)initWithFrame:(NSRect)frameRect {
    self = [super initWithFrame:frameRect];
    if (self) {
        self.wantsLayer = YES;

        _thumbImageView = [[NSImageView alloc] initWithFrame:NSMakeRect(10, 10, 44, 44)];
        _thumbImageView.wantsLayer = YES;
        _thumbImageView.layer.cornerRadius = 6.0;
        _thumbImageView.layer.masksToBounds = YES;
        _thumbImageView.imageScaling = NSImageScaleProportionallyUpOrDown;
        [self addSubview:_thumbImageView];

        _titleLabel = [[NSTextField alloc] initWithFrame:NSMakeRect(62, 32, frameRect.size.width - 160, 20)];
        _titleLabel.bezeled = NO;
        _titleLabel.drawsBackground = NO;
        _titleLabel.textColor = AppTheme.currentTheme.textColor;
        _titleLabel.font = [NSFont systemFontOfSize:13 weight:NSFontWeightMedium];
        _titleLabel.editable = NO;
        [self addSubview:_titleLabel];

        _subLabel = [[NSTextField alloc] initWithFrame:NSMakeRect(62, 12, frameRect.size.width - 160, 16)];
        _subLabel.bezeled = NO;
        _subLabel.drawsBackground = NO;
        _subLabel.textColor = AppTheme.currentTheme.secondaryTextColor;
        _subLabel.font = [NSFont systemFontOfSize:11];
        _subLabel.editable = NO;
        [self addSubview:_subLabel];

        CGFloat actW = 82.0;
        _actionsContainer = [[NSView alloc] initWithFrame:NSMakeRect(frameRect.size.width - actW - 18.0, (frameRect.size.height - 28.0) / 2.0, actW, 28)];
        _actionsContainer.wantsLayer = YES;
        _actionsContainer.hidden = YES;

        _pinBtn = [[HoverButton alloc] initWithFrame:NSMakeRect(0, 1, 26, 26)];
        _pinBtn.title = @"📌";
        _pinBtn.image = nil;
        _pinBtn.font = [NSFont systemFontOfSize:13];
        _pinBtn.toolTip = [I18N tr:@"pinDesktop"];
        _pinBtn.customHoverColor = [NSColor colorWithWhite:1.0 alpha:0.18];
        [_actionsContainer addSubview:_pinBtn];

        _rowCopyBtn = [[HoverButton alloc] initWithFrame:NSMakeRect(28, 1, 26, 26)];
        _rowCopyBtn.title = @"📋";
        _rowCopyBtn.image = nil;
        _rowCopyBtn.font = [NSFont systemFontOfSize:13];
        _rowCopyBtn.toolTip = [I18N tr:@"copyToClipboard"];
        _rowCopyBtn.customHoverColor = [NSColor colorWithWhite:1.0 alpha:0.18];
        [_actionsContainer addSubview:_rowCopyBtn];

        _deleteBtn = [[HoverButton alloc] initWithFrame:NSMakeRect(56, 1, 26, 26)];
        _deleteBtn.title = @"🗑";
        _deleteBtn.image = nil;
        _deleteBtn.font = [NSFont systemFontOfSize:13];
        _deleteBtn.toolTip = [I18N tr:@"delete"];
        _deleteBtn.customHoverColor = [NSColor colorWithSRGBRed:0.95 green:0.25 blue:0.25 alpha:0.22];
        [_actionsContainer addSubview:_deleteBtn];

        [self addSubview:_actionsContainer];
        [self updateTrackingAreas];
    }
    return self;
}

- (void)viewDidMoveToSuperview {
    [super viewDidMoveToSuperview];
    [self setNeedsLayout:YES];
}

- (void)layout {
    [super layout];
    NSRect b = self.bounds;

    // Find selection card's right edge in self's coordinate space:
    CGFloat cardRightInSelf = b.size.width - 8.0;
    NSView *rowView = self.superview;
    if ([rowView isKindOfClass:[NSTableRowView class]] && rowView.bounds.size.width > 20.0) {
        // Selection card in ClipboardTableRowView is NSInsetRect(rowView.bounds, 8.0, 3.0) -> right edge is rowView.bounds.size.width - 8.0
        CGFloat cardRightInRow = rowView.bounds.size.width - 8.0;
        NSPoint pInSelf = [self convertPoint:NSMakePoint(cardRightInRow, 0) fromView:rowView];
        cardRightInSelf = pInSelf.x;
    }

    BOOL hasPin = !_pinBtn.hidden;
    CGFloat actW = hasPin ? 82.0 : 54.0;
    if (hasPin) {
        _pinBtn.frame = NSMakeRect(0, 1, 26, 26);
        _rowCopyBtn.frame = NSMakeRect(28, 1, 26, 26);
        _deleteBtn.frame = NSMakeRect(56, 1, 26, 26);
    } else {
        _rowCopyBtn.frame = NSMakeRect(0, 1, 26, 26);
        _deleteBtn.frame = NSMakeRect(28, 1, 26, 26);
    }

    // Both delete button icon AND its 26x26 selection/hover background box must end strictly 3.0px inside the selection card's right border:
    CGFloat targetRight = cardRightInSelf - 3.0;
    CGFloat actX = targetRight - actW;
    _actionsContainer.frame = NSMakeRect(actX, (b.size.height - 28.0) / 2.0, actW, 28.0);
    _titleLabel.frame = NSMakeRect(62, 32, actX - 66.0, 20);
    _subLabel.frame = NSMakeRect(62, 12, actX - 66.0, 16);
}

- (void)prepareForReuse {
    [super prepareForReuse];
    _isRowHovered = NO;
    _isRowSelected = NO;
    _isTextItem = NO;
    _actionsContainer.hidden = YES;
}

- (BOOL)isMouseCurrentlyInsideCell {
    NSWindow *win = self.window;
    if (!win || !win.isVisible) return NO;
    NSPoint mouseInWin = [win mouseLocationOutsideOfEventStream];
    if (!NSPointInRect(mouseInWin, [win.contentView bounds])) return NO;

    NSPoint mouseInSelf = [self convertPoint:mouseInWin fromView:nil];
    if (!NSPointInRect(mouseInSelf, self.bounds)) return NO;
    if (!NSPointInRect(mouseInSelf, self.visibleRect)) return NO;
    return YES;
}

- (void)updateTrackingAreas {
    [super updateTrackingAreas];
    if (_trackingArea) [self removeTrackingArea:_trackingArea];
    _trackingArea = [[NSTrackingArea alloc] initWithRect:self.bounds
                                                 options:(NSTrackingMouseEnteredAndExited | NSTrackingActiveAlways | NSTrackingInVisibleRect)
                                                   owner:self
                                                userInfo:nil];
    [self addTrackingArea:_trackingArea];
}

- (void)mouseEntered:(NSEvent *)event {
    _isRowHovered = YES;
    _actionsContainer.hidden = NO;
}

- (void)mouseExited:(NSEvent *)event {
    _isRowHovered = NO;
    _actionsContainer.hidden = !_isRowSelected;
}

- (void)setIsRowSelected:(BOOL)sel {
    _isRowSelected = sel;
    if (sel) {
        _titleLabel.textColor = [NSColor whiteColor];
        _subLabel.textColor = [NSColor colorWithWhite:1.0 alpha:0.85];
        _pinBtn.customHoverColor = [NSColor colorWithWhite:1.0 alpha:0.25];
        _rowCopyBtn.customHoverColor = [NSColor colorWithWhite:1.0 alpha:0.25];
    } else {
        _titleLabel.textColor = AppTheme.currentTheme.textColor;
        _subLabel.textColor = AppTheme.currentTheme.secondaryTextColor;
        if (AppTheme.currentTheme.isDark) {
            _pinBtn.customHoverColor = [NSColor colorWithWhite:1.0 alpha:0.18];
            _rowCopyBtn.customHoverColor = [NSColor colorWithWhite:1.0 alpha:0.18];
        } else {
            _pinBtn.customHoverColor = [NSColor colorWithWhite:0.0 alpha:0.08];
            _rowCopyBtn.customHoverColor = [NSColor colorWithWhite:0.0 alpha:0.08];
        }
    }
    [self updateThumbTintColor];
    [self updateActionsVisibility];
}

- (void)updateThumbTintColor {
    if (!_isTextItem) return;
    if (_isRowSelected) {
        _thumbImageView.layer.backgroundColor = [[NSColor colorWithWhite:1.0 alpha:0.20] CGColor];
        if (@available(macOS 10.14, *)) {
            _thumbImageView.contentTintColor = [NSColor whiteColor];
        }
    } else {
        if (AppTheme.currentTheme.isDark) {
            _thumbImageView.layer.backgroundColor = [[NSColor colorWithWhite:1.0 alpha:0.06] CGColor];
            if (@available(macOS 10.14, *)) {
                _thumbImageView.contentTintColor = [NSColor colorWithWhite:0.85 alpha:1.0];
            }
        } else {
            _thumbImageView.layer.backgroundColor = [[NSColor colorWithWhite:0.0 alpha:0.06] CGColor];
            if (@available(macOS 10.14, *)) {
                _thumbImageView.contentTintColor = [NSColor colorWithWhite:0.25 alpha:1.0];
            }
        }
    }
}

- (void)updateActionsVisibility {
    BOOL isMouseInside = [self isMouseCurrentlyInsideCell];
    _isRowHovered = isMouseInside;
    _actionsContainer.hidden = !(_isRowSelected || isMouseInside);
}
@end

#pragma mark - Rounded Card Table Row View

@interface ClipboardTableRowView : NSTableRowView
@end

@implementation ClipboardTableRowView
- (void)layout {
    [super layout];
    for (NSView *v in self.subviews) {
        if ([v isKindOfClass:[ClipboardRowCellView class]]) {
            [v setNeedsLayout:YES];
        }
    }
}

- (void)setSelected:(BOOL)selected {
    [super setSelected:selected];
    for (NSView *v in self.subviews) {
        if ([v isKindOfClass:[ClipboardRowCellView class]]) {
            ClipboardRowCellView *cell = (ClipboardRowCellView *)v;
            cell.isRowSelected = selected;
        }
    }
}

- (void)drawSelectionInRect:(NSRect)dirtyRect {
    if (self.selectionHighlightStyle != NSTableViewSelectionHighlightStyleNone) {
        NSRect selectionRect = NSInsetRect(self.bounds, 8.0, 3.0);
        NSBezierPath *selectionPath = [NSBezierPath bezierPathWithRoundedRect:selectionRect xRadius:8.0 yRadius:8.0];
        [AppTheme.currentTheme.accentColor setFill];
        [selectionPath fill];
    }
}

- (void)drawBackgroundInRect:(NSRect)dirtyRect {
    [super drawBackgroundInRect:dirtyRect];
    if (!self.isSelected) {
        NSRect cardRect = NSInsetRect(self.bounds, 8.0, 3.0);
        NSBezierPath *cardPath = [NSBezierPath bezierPathWithRoundedRect:cardRect xRadius:8.0 yRadius:8.0];
        if (AppTheme.currentTheme.isDark) {
            [[NSColor colorWithWhite:1.0 alpha:0.04] setFill];
            [cardPath fill];
            [[NSColor colorWithWhite:1.0 alpha:0.08] setStroke];
        } else {
            [[NSColor colorWithWhite:0.0 alpha:0.03] setFill];
            [cardPath fill];
            [[NSColor colorWithWhite:0.0 alpha:0.10] setStroke];
        }
        cardPath.lineWidth = 1.0;
        [cardPath stroke];
    }
}
@end

#pragma mark - Custom Themed Category Tabs View

@interface CategoryTabsView : NSView
@property (nonatomic, assign) NSInteger selectedIndex;
@property (nonatomic, copy) void (^onSelectionChanged)(NSInteger index);
- (void)setLabel:(NSString *)label forIndex:(NSInteger)index;
@end

@implementation CategoryTabsView {
    NSMutableArray<HoverButton *> *_tabButtons;
}

- (instancetype)initWithFrame:(NSRect)frameRect {
    self = [super initWithFrame:frameRect];
    if (self) {
        self.wantsLayer = YES;
        self.layer.cornerRadius = 7.0;
        self.layer.masksToBounds = YES;
        if (AppTheme.currentTheme.isDark) {
            self.layer.backgroundColor = [AppTheme.currentTheme.inputBgColor CGColor];
            self.layer.borderWidth = 1.0;
            self.layer.borderColor = [AppTheme.currentTheme.inputBorderColor CGColor];
        } else {
            self.layer.backgroundColor = [[NSColor colorWithWhite:0.0 alpha:0.05] CGColor];
            self.layer.borderWidth = 1.0;
            self.layer.borderColor = [[NSColor colorWithWhite:0.0 alpha:0.10] CGColor];
        }

        _tabButtons = [NSMutableArray array];
        _selectedIndex = 0;

        CGFloat tabW = (frameRect.size.width - 6.0) / 3.0;
        CGFloat tabH = frameRect.size.height - 6.0;

        for (NSInteger i = 0; i < 3; i++) {
            HoverButton *btn = [[HoverButton alloc] initWithFrame:NSMakeRect(3.0 + i * tabW, 3.0, tabW, tabH)];
            btn.wantsLayer = YES;
            btn.layer.cornerRadius = 5.0;
            btn.tag = i;
            btn.target = self;
            btn.action = @selector(tabClicked:);
            [_tabButtons addObject:btn];
            [self addSubview:btn];
        }
        [self updateTabStyles];
    }
    return self;
}

- (void)setLabel:(NSString *)label forIndex:(NSInteger)index {
    if (index >= 0 && index < _tabButtons.count) {
        _tabButtons[index].title = label;
        [self updateTabStyles];
    }
}

- (void)setSelectedIndex:(NSInteger)selectedIndex {
    _selectedIndex = selectedIndex;
    [self updateTabStyles];
}

- (void)tabClicked:(HoverButton *)sender {
    _selectedIndex = sender.tag;
    [self updateTabStyles];
    if (_onSelectionChanged) {
        _onSelectionChanged(_selectedIndex);
    }
}

- (void)updateTabStyles {
    for (NSInteger i = 0; i < _tabButtons.count; i++) {
        HoverButton *btn = _tabButtons[i];
        BOOL isSel = (i == _selectedIndex);
        NSMutableParagraphStyle *style = [[NSMutableParagraphStyle alloc] init];
        style.alignment = NSTextAlignmentCenter;

        if (isSel) {
            btn.customNormalBgColor = AppTheme.currentTheme.accentColor;
            btn.customHoverColor = AppTheme.currentTheme.accentColor;
            btn.attributedTitle = [[NSAttributedString alloc] initWithString:btn.title ?: @"" attributes:@{
                NSForegroundColorAttributeName: [NSColor whiteColor],
                NSFontAttributeName: [NSFont systemFontOfSize:12 weight:NSFontWeightSemibold],
                NSParagraphStyleAttributeName: style
            }];
        } else {
            btn.customNormalBgColor = [NSColor clearColor];
            btn.customHoverColor = AppTheme.currentTheme.buttonHoverColor;
            NSColor *unselectedColor = AppTheme.currentTheme.isDark ?
                [NSColor colorWithWhite:1.0 alpha:0.75] :
                [NSColor colorWithSRGBRed:0.25 green:0.28 blue:0.32 alpha:1.0];
            btn.attributedTitle = [[NSAttributedString alloc] initWithString:btn.title ?: @"" attributes:@{
                NSForegroundColorAttributeName: unselectedColor,
                NSFontAttributeName: [NSFont systemFontOfSize:12 weight:NSFontWeightMedium],
                NSParagraphStyleAttributeName: style
            }];
        }
        [btn updateAppearance];
    }
}
@end

@interface ClipboardContentView : NSView <NSTableViewDataSource, NSTableViewDelegate, NSTextFieldDelegate>
@property (nonatomic, strong) NSMutableArray<NSDictionary *> *historyItems;
@property (nonatomic, strong) NSMutableArray<NSDictionary *> *filteredItems;
@property (nonatomic, assign) ClipboardCategory currentCategory;

@property (nonatomic, strong) NSTextField *searchField;
@property (nonatomic, strong) CategoryTabsView *categoryTabs;
@property (nonatomic, strong) NSTableView *tableView;
@property (nonatomic, strong) NSScrollView *scrollView;
@property (nonatomic, strong) NSView *previewContainer;
@property (nonatomic, strong) NSImageView *previewImageView;
@property (nonatomic, strong) NSScrollView *previewTextScroll;
@property (nonatomic, strong) NSTextView *previewTextView;
@property (nonatomic, strong) NSTextField *previewMetaLabel;
@property (nonatomic, strong) NSTextField *previewDimLabel;
@property (nonatomic, strong) HoverButton *pinBtn;
@property (nonatomic, strong) HoverButton *clipboardCopyBtn;
@property (nonatomic, strong) HoverButton *closeButton;
@property (nonatomic, strong) HoverButton *clearAllButton;
@property (nonatomic, strong) NSView *confirmOverlayView;
@property (nonatomic, assign) NSInteger selectedIndex;

- (void)loadHistoryData;
- (void)applyFilter;
- (void)closeAction;
- (void)clearAllHistoryAction;
- (void)showClearConfirmOverlay;
- (void)dismissClearConfirmOverlay;
- (void)confirmClearAllHistoryAction;
- (void)performClearAllHistory;
@end

@implementation ClipboardPanel
- (BOOL)canBecomeKeyWindow { return YES; }
- (BOOL)canBecomeMainWindow { return YES; }

- (void)resignKeyWindow {
    [super resignKeyWindow];
    dispatch_async(dispatch_get_main_queue(), ^{
        if (self.contentV) {
            [self.contentV closeAction];
        } else {
            [self close];
            if (gClipboardPanel == self) gClipboardPanel = nil;
        }
    });
}
@end

@implementation ClipboardContentView

- (instancetype)initWithFrame:(NSRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        _historyItems = [NSMutableArray array];
        _filteredItems = [NSMutableArray array];
        _currentCategory = CatAll;
        _selectedIndex = -1;

        self.wantsLayer = YES;
        self.layer.masksToBounds = YES;
        self.layer.cornerRadius = 14.0;
        self.layer.borderWidth = 1.0;
        self.layer.borderColor = [AppTheme.currentTheme.toolbarBorderColor CGColor];
        self.layer.backgroundColor = [AppTheme.currentTheme.bgColor CGColor];

        [[NSNotificationCenter defaultCenter] addObserver:self
                                                 selector:@selector(closeAction)
                                                     name:NSApplicationDidResignActiveNotification
                                                   object:nil];
        [[[NSWorkspace sharedWorkspace] notificationCenter] addObserver:self
                                                               selector:@selector(closeAction)
                                                                   name:NSWorkspaceActiveSpaceDidChangeNotification
                                                                 object:nil];

        [self setupUI];
        [self loadHistoryData];
    }
    return self;
}

- (void)drawRect:(NSRect)dirtyRect {
    [super drawRect:dirtyRect];

    NSColor *bgColor = AppTheme.currentTheme.bgColor;
    [bgColor setFill];
    NSBezierPath *bgPath = [NSBezierPath bezierPathWithRoundedRect:self.bounds xRadius:14.0 yRadius:14.0];
    [bgPath fill];

    [AppTheme.currentTheme.toolbarBorderColor setStroke];
    bgPath.lineWidth = 1.0;
    [bgPath stroke];
}

- (void)setupUI {
    NSRect bounds = self.bounds;
    CGFloat pad = 16.0;

    // 1. Top Header: Custom Modern Search Field + Category Tabs + Close Button
    NSView *headerView = [[NSView alloc] initWithFrame:NSMakeRect(0, bounds.size.height - 56, bounds.size.width, 56)];
    headerView.wantsLayer = YES;

    CGFloat searchW = bounds.size.width - pad * 2 - 250.0;

    // Custom Styled Search Box: Height 36px, Single Icon + Vertically Centered Text
    NSView *searchContainer = [[NSView alloc] initWithFrame:NSMakeRect(pad, 10, searchW, 36)];
    searchContainer.wantsLayer = YES;
    searchContainer.layer.cornerRadius = 8.0;
    searchContainer.layer.masksToBounds = YES;
    if (AppTheme.currentTheme.isDark) {
        searchContainer.layer.backgroundColor = [AppTheme.currentTheme.inputBgColor CGColor];
        searchContainer.layer.borderWidth = 1.0;
        searchContainer.layer.borderColor = [AppTheme.currentTheme.inputBorderColor CGColor];
    } else {
        searchContainer.layer.backgroundColor = [[NSColor colorWithWhite:0.0 alpha:0.04] CGColor];
        searchContainer.layer.borderWidth = 1.0;
        searchContainer.layer.borderColor = [[NSColor colorWithWhite:0.0 alpha:0.10] CGColor];
    }

    NSImageView *searchIconView = [[NSImageView alloc] initWithFrame:NSMakeRect(10, 10, 16, 16)];
    searchIconView.image = getSvgIcon(@"search");
    searchIconView.imageScaling = NSImageScaleProportionallyDown;
    if (@available(macOS 10.14, *)) {
        searchIconView.contentTintColor = AppTheme.currentTheme.isDark ? AppTheme.currentTheme.secondaryTextColor : [NSColor colorWithWhite:0.0 alpha:0.45];
    }
    [searchContainer addSubview:searchIconView];

    _searchField = [[NSTextField alloc] initWithFrame:NSMakeRect(34, 0, searchW - 42, 36)];
    VerticallyCenteredTextFieldCell *searchCell = [[VerticallyCenteredTextFieldCell alloc] initTextCell:@""];
    searchCell.scrollable = YES;
    searchCell.editable = YES;
    searchCell.verticalOffset = 0.5;
    _searchField.cell = searchCell;
    _searchField.bezeled = NO;
    _searchField.drawsBackground = NO;
    _searchField.focusRingType = NSFocusRingTypeNone;
    _searchField.font = [NSFont systemFontOfSize:13];
    _searchField.textColor = AppTheme.currentTheme.textColor;
    NSMutableAttributedString *phStr = [[NSMutableAttributedString alloc] initWithString:[I18N tr:@"searchPlaceholder"]];
    NSColor *phColor = AppTheme.currentTheme.isDark ? AppTheme.currentTheme.secondaryTextColor : [NSColor colorWithWhite:0.0 alpha:0.42];
    [phStr addAttributes:@{
        NSForegroundColorAttributeName: phColor,
        NSFontAttributeName: [NSFont systemFontOfSize:13]
    } range:NSMakeRange(0, phStr.length)];
    _searchField.placeholderAttributedString = phStr;
    _searchField.delegate = self;
    [searchContainer addSubview:_searchField];
    [headerView addSubview:searchContainer];

    // Category Tabs: 全部 / 图片 / 文本 (Custom styled tab bar - immune to AppKit segmented control bugs!)
    _categoryTabs = [[CategoryTabsView alloc] initWithFrame:NSMakeRect(pad + searchW + 12, 12, 192, 32)];
    [_categoryTabs setLabel:[I18N tr:@"all"] forIndex:0];
    [_categoryTabs setLabel:[I18N tr:@"image"] forIndex:1];
    [_categoryTabs setLabel:[I18N tr:@"textType"] forIndex:2];
    _categoryTabs.selectedIndex = 0;
    __weak typeof(self) weakSelf = self;
    _categoryTabs.onSelectionChanged = ^(NSInteger idx) {
        weakSelf.currentCategory = (ClipboardCategory)idx;
        [weakSelf applyFilter];
    };
    [headerView addSubview:_categoryTabs];

    // Close button
    HoverButton *closeBtn = [[HoverButton alloc] initWithFrame:NSMakeRect(bounds.size.width - pad - 28, 14, 28, 28)];
    closeBtn.image = getSvgIcon(@"close");
    closeBtn.toolTip = [I18N tr:@"closePin"];
    closeBtn.customHoverColor = AppTheme.currentTheme.buttonHoverColor;
    if (@available(macOS 10.14, *)) {
        closeBtn.contentTintColor = AppTheme.currentTheme.secondaryTextColor;
    }
    closeBtn.target = self;
    closeBtn.action = @selector(closeAction);
    _closeButton = closeBtn;
    [headerView addSubview:_closeButton];

    [self addSubview:headerView];

    NSBox *sep = [[NSBox alloc] initWithFrame:NSMakeRect(0, bounds.size.height - 57, bounds.size.width, 1)];
    sep.boxType = NSBoxSeparator;
    [self addSubview:sep];

    // 2. Left List Table (Width: 330px)
    CGFloat listW = 330.0;
    CGFloat bodyH = bounds.size.height - 57 - 40;
    _scrollView = [[NSScrollView alloc] initWithFrame:NSMakeRect(0, 40, listW, bodyH)];
    _scrollView.hasVerticalScroller = YES;
    _scrollView.drawsBackground = NO;

    _tableView = [[NSTableView alloc] initWithFrame:_scrollView.bounds];
    NSTableColumn *col = [[NSTableColumn alloc] initWithIdentifier:@"col"];
    col.width = listW;
    [_tableView addTableColumn:col];
    _tableView.columnAutoresizingStyle = NSTableViewUniformColumnAutoresizingStyle;
    _tableView.headerView = nil;
    _tableView.dataSource = self;
    _tableView.delegate = self;
    _tableView.target = self;
    _tableView.doubleAction = @selector(copySelectedAction);
    _tableView.rowHeight = 64.0;
    _tableView.backgroundColor = [NSColor clearColor];
    _tableView.selectionHighlightStyle = NSTableViewSelectionHighlightStyleRegular;
    _tableView.intercellSpacing = NSMakeSize(0, 4.0);
    _scrollView.documentView = _tableView;
    [[_scrollView contentView] setPostsBoundsChangedNotifications:YES];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(tableScrollViewDidScroll:)
                                                 name:NSViewBoundsDidChangeNotification
                                               object:[_scrollView contentView]];
    [self addSubview:_scrollView];

    NSBox *vSep = [[NSBox alloc] initWithFrame:NSMakeRect(listW, 40, 1, bodyH)];
    vSep.boxType = NSBoxSeparator;
    [self addSubview:vSep];

    // 3. Right Preview Pane
    CGFloat prevX = listW + 1;
    CGFloat prevW = bounds.size.width - prevX;
    _previewContainer = [[NSView alloc] initWithFrame:NSMakeRect(prevX, 40, prevW, bodyH)];
    _previewContainer.wantsLayer = YES;

    NSView *actionHeader = [[NSView alloc] initWithFrame:NSMakeRect(0, bodyH - 46, prevW, 46)];
    _previewMetaLabel = [[NSTextField alloc] initWithFrame:NSMakeRect(14, 12, prevW - 180, 22)];
    _previewMetaLabel.bezeled = NO;
    _previewMetaLabel.drawsBackground = NO;
    _previewMetaLabel.textColor = AppTheme.currentTheme.textColor;
    _previewMetaLabel.font = [NSFont systemFontOfSize:12 weight:NSFontWeightMedium];
    _previewMetaLabel.editable = NO;
    [actionHeader addSubview:_previewMetaLabel];

    HoverButton *pinBtn = [[HoverButton alloc] initWithFrame:NSMakeRect(prevW - 162, 9, 74, 28)];
    pinBtn.wantsLayer = YES;
    pinBtn.layer.cornerRadius = 6.0;
    pinBtn.layer.borderWidth = 1.0;
    pinBtn.layer.borderColor = AppTheme.currentTheme.isDark ? [AppTheme.currentTheme.toolbarBorderColor CGColor] : [[NSColor colorWithWhite:0.0 alpha:0.12] CGColor];
    pinBtn.customNormalBgColor = AppTheme.currentTheme.isDark ? AppTheme.currentTheme.inputBgColor : [NSColor colorWithWhite:1.0 alpha:1.0];
    pinBtn.customHoverColor = AppTheme.currentTheme.buttonHoverColor;
    NSMutableParagraphStyle *pinStyle = [[NSMutableParagraphStyle alloc] init];
    pinStyle.alignment = NSTextAlignmentCenter;
    NSColor *actionBtnColor = AppTheme.currentTheme.isDark ? [NSColor colorWithWhite:1.0 alpha:0.95] : [NSColor colorWithSRGBRed:0.18 green:0.21 blue:0.26 alpha:1.0];
    pinBtn.attributedTitle = [[NSAttributedString alloc] initWithString:[NSString stringWithFormat:@"📌 %@", [I18N tr:@"pinBtn"]] attributes:@{
        NSForegroundColorAttributeName: actionBtnColor,
        NSFontAttributeName: [NSFont systemFontOfSize:12 weight:NSFontWeightMedium],
        NSParagraphStyleAttributeName: pinStyle
    }];
    pinBtn.target = self;
    pinBtn.action = @selector(pinSelectedAction);
    _pinBtn = pinBtn;
    [actionHeader addSubview:_pinBtn];

    HoverButton *copyBtn = [[HoverButton alloc] initWithFrame:NSMakeRect(prevW - 82, 9, 74, 28)];
    copyBtn.wantsLayer = YES;
    copyBtn.layer.cornerRadius = 6.0;
    copyBtn.layer.borderWidth = 1.0;
    copyBtn.layer.borderColor = AppTheme.currentTheme.isDark ? [AppTheme.currentTheme.toolbarBorderColor CGColor] : [[NSColor colorWithWhite:0.0 alpha:0.12] CGColor];
    copyBtn.customNormalBgColor = AppTheme.currentTheme.isDark ? AppTheme.currentTheme.inputBgColor : [NSColor colorWithWhite:1.0 alpha:1.0];
    copyBtn.customHoverColor = AppTheme.currentTheme.buttonHoverColor;
    NSMutableParagraphStyle *copyStyle = [[NSMutableParagraphStyle alloc] init];
    copyStyle.alignment = NSTextAlignmentCenter;
    copyBtn.attributedTitle = [[NSAttributedString alloc] initWithString:[NSString stringWithFormat:@"📋 %@", [I18N tr:@"copy"]] attributes:@{
        NSForegroundColorAttributeName: actionBtnColor,
        NSFontAttributeName: [NSFont systemFontOfSize:12 weight:NSFontWeightMedium],
        NSParagraphStyleAttributeName: copyStyle
    }];
    copyBtn.target = self;
    copyBtn.action = @selector(copySelectedAction);
    _clipboardCopyBtn = copyBtn;
    [actionHeader addSubview:_clipboardCopyBtn];

    [_previewContainer addSubview:actionHeader];

    _previewImageView = [[NSImageView alloc] initWithFrame:NSMakeRect(14, 36, prevW - 28, bodyH - 86)];
    _previewImageView.imageScaling = NSImageScaleProportionallyUpOrDown;
    _previewImageView.wantsLayer = YES;
    _previewImageView.layer.cornerRadius = 6.0;
    _previewImageView.layer.masksToBounds = YES;
    _previewImageView.layer.backgroundColor = [AppTheme.currentTheme.inputBgColor CGColor];
    _previewImageView.layer.borderWidth = 1.0;
    _previewImageView.layer.borderColor = [AppTheme.currentTheme.inputBorderColor CGColor];
    [_previewContainer addSubview:_previewImageView];

    _previewTextScroll = [[NSScrollView alloc] initWithFrame:NSMakeRect(14, 36, prevW - 28, bodyH - 86)];
    _previewTextScroll.hasVerticalScroller = YES;
    _previewTextScroll.drawsBackground = NO;
    _previewTextView = [[NSTextView alloc] initWithFrame:_previewTextScroll.bounds];
    _previewTextView.editable = NO;
    _previewTextView.textColor = AppTheme.currentTheme.textColor;
    _previewTextView.backgroundColor = AppTheme.currentTheme.inputBgColor;
    _previewTextView.font = [NSFont monospacedSystemFontOfSize:13 weight:NSFontWeightRegular];
    _previewTextScroll.documentView = _previewTextView;
    _previewTextScroll.hidden = YES;
    [_previewContainer addSubview:_previewTextScroll];

    _previewDimLabel = [[NSTextField alloc] initWithFrame:NSMakeRect(14, 8, prevW - 28, 20)];
    _previewDimLabel.bezeled = NO;
    _previewDimLabel.drawsBackground = NO;
    _previewDimLabel.alignment = NSTextAlignmentCenter;
    _previewDimLabel.textColor = AppTheme.currentTheme.secondaryTextColor;
    _previewDimLabel.font = [NSFont systemFontOfSize:11];
    _previewDimLabel.editable = NO;
    [_previewContainer addSubview:_previewDimLabel];

    [self addSubview:_previewContainer];

    // 4. Bottom Footer (Shortcut Tips + Clear All History Button)
    NSView *footer = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, bounds.size.width, 40)];
    footer.wantsLayer = YES;

    NSTextField *tips = [[NSTextField alloc] initWithFrame:NSMakeRect(16, 10, bounds.size.width - 160, 20)];
    tips.bezeled = NO;
    tips.drawsBackground = NO;
    tips.textColor = AppTheme.currentTheme.secondaryTextColor;
    tips.font = [NSFont systemFontOfSize:11];
    tips.stringValue = [I18N tr:@"navTip"];
    tips.editable = NO;
    [footer addSubview:tips];

    _clearAllButton = [[HoverButton alloc] initWithFrame:NSMakeRect(bounds.size.width - 130, 8, 116, 24)];
    _clearAllButton.wantsLayer = YES;
    _clearAllButton.layer.cornerRadius = 4.0;
    NSMutableParagraphStyle *clearStyle = [[NSMutableParagraphStyle alloc] init];
    clearStyle.alignment = NSTextAlignmentRight;
    _clearAllButton.attributedTitle = [[NSAttributedString alloc] initWithString:[NSString stringWithFormat:@"🗑️ %@", [I18N tr:@"clearAll"]] attributes:@{
        NSForegroundColorAttributeName: [NSColor colorWithSRGBRed:0.92 green:0.3 blue:0.3 alpha:1.0],
        NSFontAttributeName: [NSFont systemFontOfSize:11 weight:NSFontWeightMedium],
        NSParagraphStyleAttributeName: clearStyle
    }];
    _clearAllButton.customHoverColor = [NSColor colorWithSRGBRed:0.95 green:0.25 blue:0.25 alpha:0.12];
    _clearAllButton.target = self;
    _clearAllButton.action = @selector(clearAllHistoryAction);
    [footer addSubview:_clearAllButton];

    [self addSubview:footer];
}

- (void)loadHistoryData {
    NSString *home = NSHomeDirectory();
    NSString *jsonPath = [home stringByAppendingPathComponent:@".mark-suite/clipboard/history.json"];
    if (![[NSFileManager defaultManager] fileExistsAtPath:jsonPath]) return;

    NSData *data = [NSData dataWithContentsOfFile:jsonPath];
    if (!data) return;

    NSError *err = nil;
    NSArray *arr = [NSJSONSerialization JSONObjectWithData:data options:0 error:&err];
    if (arr && !err) {
        [_historyItems removeAllObjects];
        [_historyItems addObjectsFromArray:arr];
        [self updateCategoryLabels];
        [self applyFilter];
    }
}

- (void)updateCategoryLabels {
    NSInteger imgCount = 0;
    NSInteger txtCount = 0;
    for (NSDictionary *item in _historyItems) {
        NSString *type = [item[@"type"] lowercaseString] ?: @"";
        if ([type isEqualToString:@"image"] || item[@"imagePath"]) {
            imgCount++;
        } else {
            txtCount++;
        }
    }
    [_categoryTabs setLabel:[NSString stringWithFormat:@"%@ %lu", [I18N tr:@"all"], (unsigned long)_historyItems.count] forIndex:0];
    [_categoryTabs setLabel:[NSString stringWithFormat:@"%@ %ld", [I18N tr:@"image"], (long)imgCount] forIndex:1];
    [_categoryTabs setLabel:[NSString stringWithFormat:@"%@ %ld", [I18N tr:@"textType"], (long)txtCount] forIndex:2];
}

- (void)controlTextDidChange:(NSNotification *)obj {
    [self applyFilter];
}

- (void)applyFilter {
    NSString *q = [_searchField.stringValue stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
    [_filteredItems removeAllObjects];

    for (NSDictionary *item in _historyItems) {
        NSString *type = [item[@"type"] lowercaseString] ?: @"";
        BOOL isImage = ([type isEqualToString:@"image"] || item[@"imagePath"] != nil);

        if (_currentCategory == CatImage && !isImage) continue;
        if (_currentCategory == CatText && isImage) continue;

        if (q.length > 0) {
            NSString *prev = item[@"previewText"] ?: item[@"content"] ?: @"";
            if (![prev localizedCaseInsensitiveContainsString:q]) {
                continue;
            }
        }
        [_filteredItems addObject:item];
    }

    [_tableView reloadData];
    if (_filteredItems.count > 0) {
        [_tableView selectRowIndexes:[NSIndexSet indexSetWithIndex:0] byExtendingSelection:NO];
        [self updatePreviewForIndex:0];
    } else {
        [self updatePreviewForIndex:-1];
    }
}

- (NSInteger)numberOfRowsInTableView:(NSTableView *)tableView {
    return _filteredItems.count;
}

- (NSTableRowView *)tableView:(NSTableView *)tableView rowViewForRow:(NSInteger)row {
    ClipboardTableRowView *rowView = [tableView makeViewWithIdentifier:@"ClipboardTableRowView" owner:self];
    if (!rowView) {
        rowView = [[ClipboardTableRowView alloc] initWithFrame:NSMakeRect(0, 0, tableView.bounds.size.width, 64)];
        rowView.identifier = @"ClipboardTableRowView";
    }
    return rowView;
}

- (NSView *)tableView:(NSTableView *)tableView viewForTableColumn:(NSTableColumn *)tableColumn row:(NSInteger)row {
    if (row >= _filteredItems.count) return nil;
    NSDictionary *item = _filteredItems[row];

    ClipboardRowCellView *cell = [tableView makeViewWithIdentifier:@"ClipboardRowCellView" owner:self];
    if (!cell) {
        cell = [[ClipboardRowCellView alloc] initWithFrame:NSMakeRect(0, 0, tableView.bounds.size.width, 64)];
        cell.identifier = @"ClipboardRowCellView";
    }

    NSString *imgPath = item[@"imagePath"];
    BOOL isImg = (imgPath && [[NSFileManager defaultManager] fileExistsAtPath:imgPath]);
    cell.isTextItem = !isImg;
    if (isImg) {
        cell.thumbImageView.image = [[NSImage alloc] initWithContentsOfFile:imgPath];
        cell.thumbImageView.layer.backgroundColor = [NSColor clearColor].CGColor;
        if (@available(macOS 10.14, *)) {
            cell.thumbImageView.contentTintColor = nil;
        }
    } else {
        cell.thumbImageView.image = getSvgIcon(@"text");
        [cell updateThumbTintColor];
    }

    cell.titleLabel.stringValue = item[@"previewText"] ?: item[@"content"] ?: [I18N tr:@"screenshotFallback"];

    NSString *meta = @"";
    if (item[@"timestamp"]) {
        NSTimeInterval ts = [item[@"timestamp"] doubleValue] / 1000.0;
        NSTimeInterval diff = [[NSDate date] timeIntervalSince1970] - ts;
        if (diff < 60) {
            meta = [I18N tr:@"justNow"];
        } else if (diff < 3600) {
            meta = [I18N formatMinutesAgo:(NSInteger)(diff / 60)];
        } else if (diff < 86400) {
            meta = [I18N formatHoursAgo:(NSInteger)(diff / 3600)];
        } else {
            meta = [I18N formatDaysAgo:(NSInteger)(diff / 86400)];
        }
    }

    if (item[@"width"] && item[@"height"]) {
        meta = [meta stringByAppendingFormat:@"  •  %@×%@", item[@"width"], item[@"height"]];
    } else if (item[@"charCount"]) {
        meta = [meta stringByAppendingFormat:@"  •  %@ %@", item[@"charCount"], [I18N tr:@"chars"]];
    }
    cell.subLabel.stringValue = meta;

    cell.pinBtn.hidden = !isImg;
    cell.pinBtn.tag = row;
    cell.pinBtn.target = self;
    cell.pinBtn.action = @selector(rowPinAction:);

    cell.rowCopyBtn.tag = row;
    cell.rowCopyBtn.target = self;
    cell.rowCopyBtn.action = @selector(rowCopyAction:);
    cell.rowCopyBtn.title = @"📋";
    cell.rowCopyBtn.image = nil;
    if (@available(macOS 10.14, *)) {
        cell.rowCopyBtn.contentTintColor = AppTheme.currentTheme.textColor;
    }

    cell.deleteBtn.tag = row;
    cell.deleteBtn.target = self;
    cell.deleteBtn.action = @selector(rowDeleteAction:);

    [cell layout];
    cell.isRowSelected = (row == _tableView.selectedRow);
    [cell updateActionsVisibility];

    return cell;
}

- (void)rowPinAction:(NSButton *)sender {
    NSInteger row = sender.tag;
    if (row >= 0 && row < _filteredItems.count) {
        _selectedIndex = row;
        [self pinSelectedAction];
    }
}

- (void)rowCopyAction:(HoverButton *)sender {
    NSInteger row = sender.tag;
    if (row >= 0 && row < _filteredItems.count) {
        _selectedIndex = row;
        NSDictionary *item = _filteredItems[row];
        NSString *imgPath = item[@"imagePath"];
        NSString *text = item[@"content"] ?: item[@"text"] ?: item[@"previewText"];

        NSPasteboard *pb = [NSPasteboard generalPasteboard];
        [pb clearContents];

        if (imgPath && [[NSFileManager defaultManager] fileExistsAtPath:imgPath]) {
            NSImage *img = [[NSImage alloc] initWithContentsOfFile:imgPath];
            if (img) {
                [pb writeObjects:@[img]];
            }
        } else if (text && text.length > 0) {
            [pb setString:text forType:NSPasteboardTypeString];
        }

        sendEvent(@{ @"event": @"clipboard_copied", @"item": item });

        sender.image = nil;
        sender.title = @"✓";
        if (@available(macOS 10.14, *)) {
            sender.contentTintColor = [NSColor colorWithSRGBRed:0.20 green:0.75 blue:0.29 alpha:1.0];
        }

        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(350 * NSEC_PER_MSEC)), dispatch_get_main_queue(), ^{
            [self closeAction];
        });
    }
}

- (void)rowDeleteAction:(NSButton *)sender {
    NSInteger row = sender.tag;
    if (row >= 0 && row < _filteredItems.count) {
        NSDictionary *item = _filteredItems[row];

        NSString *imgPath = item[@"imagePath"];
        if (imgPath && [[NSFileManager defaultManager] fileExistsAtPath:imgPath]) {
            [[NSFileManager defaultManager] removeItemAtPath:imgPath error:nil];
        }

        [_historyItems removeObject:item];
        [_filteredItems removeObjectAtIndex:row];

        NSString *home = NSHomeDirectory();
        NSString *jsonPath = [home stringByAppendingPathComponent:@".mark-suite/clipboard/history.json"];
        NSData *data = [NSJSONSerialization dataWithJSONObject:_historyItems options:NSJSONWritingPrettyPrinted error:nil];
        [data writeToFile:jsonPath atomically:YES];

        [self updateCategoryLabels];
        [_tableView reloadData];
        if (_filteredItems.count > 0) {
            NSInteger nextSel = MIN(row, (NSInteger)_filteredItems.count - 1);
            [_tableView selectRowIndexes:[NSIndexSet indexSetWithIndex:nextSel] byExtendingSelection:NO];
            [self updatePreviewForIndex:nextSel];
        } else {
            [self updatePreviewForIndex:-1];
        }
    }
}

- (void)clearAllHistoryAction {
    [self showClearConfirmOverlay];
}

- (void)showClearConfirmOverlay {
    if (_confirmOverlayView) {
        [_confirmOverlayView removeFromSuperview];
        _confirmOverlayView = nil;
    }

    NSRect bounds = self.bounds;
    _confirmOverlayView = [[NSView alloc] initWithFrame:bounds];
    _confirmOverlayView.wantsLayer = YES;
    _confirmOverlayView.layer.cornerRadius = 14.0;
    _confirmOverlayView.layer.masksToBounds = YES;
    _confirmOverlayView.layer.backgroundColor = [[NSColor colorWithWhite:0.0 alpha:0.65] CGColor];

    // Centered modal card: 380 x 190
    CGFloat cardW = 380.0;
    CGFloat cardH = 190.0;
    NSView *card = [[NSView alloc] initWithFrame:NSMakeRect((bounds.size.width - cardW) / 2.0, (bounds.size.height - cardH) / 2.0, cardW, cardH)];
    card.wantsLayer = YES;
    card.layer.cornerRadius = 12.0;
    card.layer.masksToBounds = YES;
    if (AppTheme.currentTheme.isDark) {
        card.layer.backgroundColor = [[NSColor colorWithSRGBRed:0.13 green:0.15 blue:0.19 alpha:0.98] CGColor];
        card.layer.borderColor = [[NSColor colorWithWhite:1.0 alpha:0.18] CGColor];
    } else {
        card.layer.backgroundColor = [[NSColor colorWithSRGBRed:0.98 green:0.98 blue:0.99 alpha:0.98] CGColor];
        card.layer.borderColor = [[NSColor colorWithWhite:0.0 alpha:0.15] CGColor];
    }
    card.layer.borderWidth = 1.0;

    // Icon (Trash icon)
    NSImageView *iconView = [[NSImageView alloc] initWithFrame:NSMakeRect((cardW - 36) / 2.0, cardH - 52, 36, 36)];
    iconView.image = getSvgIcon(@"delete");
    if (@available(macOS 10.14, *)) {
        iconView.contentTintColor = [NSColor colorWithSRGBRed:0.95 green:0.35 blue:0.35 alpha:1.0];
    }
    [card addSubview:iconView];

    // Title: 清空全部剪贴板历史
    NSTextField *titleLabel = [[NSTextField alloc] initWithFrame:NSMakeRect(20, cardH - 84, cardW - 40, 24)];
    titleLabel.bezeled = NO;
    titleLabel.drawsBackground = NO;
    titleLabel.editable = NO;
    titleLabel.selectable = NO;
    titleLabel.alignment = NSTextAlignmentCenter;
    titleLabel.font = [NSFont systemFontOfSize:15 weight:NSFontWeightBold];
    titleLabel.textColor = AppTheme.currentTheme.textColor;
    titleLabel.stringValue = [I18N tr:@"clearHistoryConfirmTitle"];
    [card addSubview:titleLabel];

    // Description: 确定要清空全部剪贴板记录吗？这将删除所有的历史记录以及本地截图文件，此操作不可恢复。
    NSTextField *descLabel = [[NSTextField alloc] initWithFrame:NSMakeRect(24, cardH - 132, cardW - 48, 40)];
    descLabel.bezeled = NO;
    descLabel.drawsBackground = NO;
    descLabel.editable = NO;
    descLabel.selectable = NO;
    descLabel.alignment = NSTextAlignmentCenter;
    descLabel.font = [NSFont systemFontOfSize:12];
    descLabel.textColor = AppTheme.currentTheme.secondaryTextColor;
    descLabel.stringValue = [I18N tr:@"clearHistoryConfirmDesc"];
    [card addSubview:descLabel];

    // Buttons Container: [ 取消 ]   [ 🗑️ 清空全部 ]
    CGFloat btnW = 110.0;
    CGFloat btnH = 32.0;
    CGFloat btnSpacing = 20.0;
    CGFloat btnsStartX = (cardW - (btnW * 2 + btnSpacing)) / 2.0;

    HoverButton *cancelBtn = [[HoverButton alloc] initWithFrame:NSMakeRect(btnsStartX, 18, btnW, btnH)];
    NSMutableParagraphStyle *cancelStyle = [[NSMutableParagraphStyle alloc] init];
    cancelStyle.alignment = NSTextAlignmentCenter;
    cancelBtn.attributedTitle = [[NSAttributedString alloc] initWithString:[I18N tr:@"cancel"] attributes:@{
        NSForegroundColorAttributeName: AppTheme.currentTheme.textColor,
        NSFontAttributeName: [NSFont systemFontOfSize:13 weight:NSFontWeightMedium],
        NSParagraphStyleAttributeName: cancelStyle
    }];
    cancelBtn.wantsLayer = YES;
    cancelBtn.layer.cornerRadius = 6.0;
    cancelBtn.layer.borderWidth = 1.0;
    cancelBtn.layer.borderColor = [AppTheme.currentTheme.toolbarBorderColor CGColor];
    cancelBtn.customNormalBgColor = AppTheme.currentTheme.inputBgColor;
    cancelBtn.customHoverColor = AppTheme.currentTheme.buttonHoverColor;
    cancelBtn.target = self;
    cancelBtn.action = @selector(dismissClearConfirmOverlay);
    [card addSubview:cancelBtn];

    HoverButton *confirmBtn = [[HoverButton alloc] initWithFrame:NSMakeRect(btnsStartX + btnW + btnSpacing, 18, btnW, btnH)];
    NSMutableParagraphStyle *confirmStyle = [[NSMutableParagraphStyle alloc] init];
    confirmStyle.alignment = NSTextAlignmentCenter;
    confirmBtn.attributedTitle = [[NSAttributedString alloc] initWithString:[I18N tr:@"clearAll"] attributes:@{
        NSForegroundColorAttributeName: [NSColor whiteColor],
        NSFontAttributeName: [NSFont systemFontOfSize:13 weight:NSFontWeightSemibold],
        NSParagraphStyleAttributeName: confirmStyle
    }];
    confirmBtn.wantsLayer = YES;
    confirmBtn.layer.cornerRadius = 6.0;
    confirmBtn.customNormalBgColor = [NSColor colorWithSRGBRed:0.85 green:0.25 blue:0.25 alpha:0.9];
    confirmBtn.customHoverColor = [NSColor colorWithSRGBRed:0.95 green:0.3 blue:0.3 alpha:1.0];
    confirmBtn.target = self;
    confirmBtn.action = @selector(confirmClearAllHistoryAction);
    [card addSubview:confirmBtn];

    [_confirmOverlayView addSubview:card];
    [self addSubview:_confirmOverlayView positioned:NSWindowAbove relativeTo:nil];
}

- (void)dismissClearConfirmOverlay {
    if (_confirmOverlayView) {
        [_confirmOverlayView removeFromSuperview];
        _confirmOverlayView = nil;
    }
}

- (void)confirmClearAllHistoryAction {
    [self dismissClearConfirmOverlay];
    [self performClearAllHistory];
}

- (void)performClearAllHistory {
    [_historyItems removeAllObjects];
    [_filteredItems removeAllObjects];

    NSString *home = NSHomeDirectory();
    NSString *jsonPath = [home stringByAppendingPathComponent:@".mark-suite/clipboard/history.json"];
    NSData *emptyData = [@"[]" dataUsingEncoding:NSUTF8StringEncoding];
    [emptyData writeToFile:jsonPath atomically:YES];

    NSString *imgDir = [home stringByAppendingPathComponent:@".mark-suite/clipboard/images"];
    NSArray *files = [[NSFileManager defaultManager] contentsOfDirectoryAtPath:imgDir error:nil];
    for (NSString *f in files) {
        NSString *fp = [imgDir stringByAppendingPathComponent:f];
        [[NSFileManager defaultManager] removeItemAtPath:fp error:nil];
    }

    [self updateCategoryLabels];
    [_tableView reloadData];
    [self updatePreviewForIndex:-1];
}

- (void)dealloc {
    [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (void)tableScrollViewDidScroll:(NSNotification *)note {
    [self updateAllRowActionsVisibility];
}

- (void)updateAllRowActionsVisibility {
    NSInteger selRow = _tableView.selectedRow;
    [_tableView enumerateAvailableRowViewsUsingBlock:^(NSTableRowView *rowView, NSInteger r) {
        ClipboardRowCellView *cell = (ClipboardRowCellView *)[self->_tableView viewAtColumn:0 row:r makeIfNecessary:NO];
        if (![cell isKindOfClass:[ClipboardRowCellView class]]) {
            cell = [rowView viewAtColumn:0];
        }
        if (![cell isKindOfClass:[ClipboardRowCellView class]]) {
            for (NSView *sub in rowView.subviews) {
                if ([sub isKindOfClass:[ClipboardRowCellView class]]) {
                    cell = (ClipboardRowCellView *)sub;
                    break;
                }
            }
        }
        if ([cell isKindOfClass:[ClipboardRowCellView class]]) {
            cell.isRowSelected = (r == selRow);
            [cell updateActionsVisibility];
        }
    }];
}

- (void)tableViewSelectionDidChange:(NSNotification *)notification {
    NSInteger row = _tableView.selectedRow;
    [self updatePreviewForIndex:row];
    [self updateAllRowActionsVisibility];
}

- (void)updatePreviewForIndex:(NSInteger)index {
    if (index < 0 || index >= _filteredItems.count) {
        _previewImageView.image = nil;
        _previewImageView.hidden = YES;
        _previewTextScroll.hidden = YES;
        _previewMetaLabel.stringValue = @"";
        _previewDimLabel.stringValue = @"";
        _pinBtn.hidden = YES;
        _clipboardCopyBtn.hidden = YES;
        return;
    }
    _selectedIndex = index;
    NSDictionary *item = _filteredItems[index];

    NSString *type = [item[@"type"] uppercaseString] ?: @"IMAGE";
    _previewMetaLabel.stringValue = [NSString stringWithFormat:@"%@  ·  %@", type, item[@"previewText"] ?: @""];
    _clipboardCopyBtn.hidden = NO;
    NSMutableParagraphStyle *copyResetStyle = [[NSMutableParagraphStyle alloc] init];
    copyResetStyle.alignment = NSTextAlignmentCenter;
    NSColor *actionBtnColor = AppTheme.currentTheme.isDark ? [NSColor colorWithWhite:1.0 alpha:0.95] : [NSColor colorWithSRGBRed:0.18 green:0.21 blue:0.26 alpha:1.0];
    _clipboardCopyBtn.attributedTitle = [[NSAttributedString alloc] initWithString:[NSString stringWithFormat:@"📋 %@", [I18N tr:@"copy"]] attributes:@{
        NSForegroundColorAttributeName: actionBtnColor,
        NSFontAttributeName: [NSFont systemFontOfSize:12 weight:NSFontWeightMedium],
        NSParagraphStyleAttributeName: copyResetStyle
    }];

    NSString *imgPath = item[@"imagePath"];
    NSString *text = item[@"content"] ?: item[@"text"] ?: item[@"previewText"];

    if (imgPath && [[NSFileManager defaultManager] fileExistsAtPath:imgPath]) {
        NSImage *img = [[NSImage alloc] initWithContentsOfFile:imgPath];
        _previewImageView.image = img;
        _previewImageView.hidden = NO;
        _previewTextScroll.hidden = YES;
        _pinBtn.hidden = NO;
        _previewDimLabel.stringValue = [NSString stringWithFormat:[I18N tr:@"resolutionFormat"], item[@"width"] ?: @(img.size.width), item[@"height"] ?: @(img.size.height)];
    } else {
        _previewImageView.image = nil;
        _previewImageView.hidden = YES;
        _previewTextScroll.hidden = NO;
        _previewTextView.string = text ?: @"";
        _pinBtn.hidden = YES;
        NSUInteger len = [text length];
        _previewDimLabel.stringValue = [NSString stringWithFormat:[I18N tr:@"textLengthFormat"], (unsigned long)len];
    }
}

- (void)pinSelectedAction {
    if (_selectedIndex < 0 || _selectedIndex >= _filteredItems.count) return;
    NSDictionary *item = _filteredItems[_selectedIndex];
    NSString *imgPath = item[@"imagePath"];
    if (!imgPath) return;

    NSString *pinId = [NSString stringWithFormat:@"pin_%ld", (long)[[NSDate date] timeIntervalSince1970]];
    [self closeAction];

    createPin(@{
        @"pinId": pinId,
        @"imagePath": imgPath,
        @"width": item[@"width"] ?: @(400),
        @"height": item[@"height"] ?: @(300)
    });
}

- (void)copySelectedAction {
    if (_selectedIndex < 0 || _selectedIndex >= _filteredItems.count) return;
    NSDictionary *item = _filteredItems[_selectedIndex];
    NSString *imgPath = item[@"imagePath"];
    NSString *text = item[@"content"] ?: item[@"text"] ?: item[@"previewText"];

    NSPasteboard *pb = [NSPasteboard generalPasteboard];
    [pb clearContents];

    if (imgPath && [[NSFileManager defaultManager] fileExistsAtPath:imgPath]) {
        NSImage *img = [[NSImage alloc] initWithContentsOfFile:imgPath];
        if (img) {
            [pb writeObjects:@[img]];
        }
    } else if (text && text.length > 0) {
        [pb setString:text forType:NSPasteboardTypeString];
    }

    // Visual feedback
    NSMutableParagraphStyle *copiedStyle = [[NSMutableParagraphStyle alloc] init];
    copiedStyle.alignment = NSTextAlignmentCenter;
    _clipboardCopyBtn.attributedTitle = [[NSAttributedString alloc] initWithString:[NSString stringWithFormat:@"✓ %@", [I18N tr:@"copied"]] attributes:@{
        NSForegroundColorAttributeName: [NSColor colorWithSRGBRed:0.20 green:0.75 blue:0.29 alpha:1.0],
        NSFontAttributeName: [NSFont systemFontOfSize:12 weight:NSFontWeightMedium],
        NSParagraphStyleAttributeName: copiedStyle
    }];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(350 * NSEC_PER_MSEC)), dispatch_get_main_queue(), ^{
        [self closeAction];
    });
}

- (BOOL)control:(NSControl *)control textView:(NSTextView *)textView doCommandBySelector:(SEL)commandSelector {
    if (commandSelector == @selector(moveUp:)) {
        NSInteger row = _tableView.selectedRow;
        if (row > 0) {
            [_tableView selectRowIndexes:[NSIndexSet indexSetWithIndex:row - 1] byExtendingSelection:NO];
            [_tableView scrollRowToVisible:row - 1];
            [self updatePreviewForIndex:row - 1];
            [self updateAllRowActionsVisibility];
        }
        return YES;
    }
    if (commandSelector == @selector(moveDown:)) {
        NSInteger row = _tableView.selectedRow;
        if (row + 1 < _filteredItems.count) {
            [_tableView selectRowIndexes:[NSIndexSet indexSetWithIndex:row + 1] byExtendingSelection:NO];
            [_tableView scrollRowToVisible:row + 1];
            [self updatePreviewForIndex:row + 1];
            [self updateAllRowActionsVisibility];
        }
        return YES;
    }
    if (commandSelector == @selector(insertNewline:)) {
        if (_confirmOverlayView) {
            [self confirmClearAllHistoryAction];
            return YES;
        }
        [self copySelectedAction];
        return YES;
    }
    if (commandSelector == @selector(cancelOperation:)) {
        if (_confirmOverlayView) {
            [self dismissClearConfirmOverlay];
            return YES;
        }
        [self closeAction];
        return YES;
    }
    return NO;
}

- (void)closeAction {
    if (gClipboardPanel) {
        [gClipboardPanel close];
        gClipboardPanel = nil;
    }
}

- (void)keyDown:(NSEvent *)event {
    if (event.keyCode == 126) { // Up Arrow
        NSInteger row = _tableView.selectedRow;
        if (row > 0) {
            [_tableView selectRowIndexes:[NSIndexSet indexSetWithIndex:row - 1] byExtendingSelection:NO];
            [_tableView scrollRowToVisible:row - 1];
            [self updatePreviewForIndex:row - 1];
            [self updateAllRowActionsVisibility];
        }
        return;
    } else if (event.keyCode == 125) { // Down Arrow
        NSInteger row = _tableView.selectedRow;
        if (row + 1 < _filteredItems.count) {
            [_tableView selectRowIndexes:[NSIndexSet indexSetWithIndex:row + 1] byExtendingSelection:NO];
            [_tableView scrollRowToVisible:row + 1];
            [self updatePreviewForIndex:row + 1];
            [self updateAllRowActionsVisibility];
        }
        return;
    } else if (event.keyCode == 53) {
        if (_confirmOverlayView) {
            [self dismissClearConfirmOverlay];
            return;
        }
        [self closeAction];
    } else if (event.keyCode == 36) {
        if (_confirmOverlayView) {
            [self confirmClearAllHistoryAction];
            return;
        }
        [self copySelectedAction];
    } else if ([event.charactersIgnoringModifiers isEqualToString:@"p"] || [event.charactersIgnoringModifiers isEqualToString:@"P"]) {
        if (_confirmOverlayView) return;
        [self pinSelectedAction];
    } else {
        [super keyDown:event];
    }
}

- (BOOL)acceptsFirstResponder { return YES; }

@end

static void toggleClipboardPanel(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (gClipboardPanel && gClipboardPanel.isVisible) {
            [gClipboardPanel close];
            gClipboardPanel = nil;
            return;
        }

        [AppTheme loadUserPreferences];

        NSScreen *screen = [NSScreen mainScreen];
        NSPoint mousePoint = [NSEvent mouseLocation];
        for (NSScreen *s in [NSScreen screens]) {
            if (NSPointInRect(mousePoint, s.frame)) {
                screen = s;
                break;
            }
        }

        CGFloat winW = 760.0;
        CGFloat winH = 510.0;
        NSRect screenFrame = screen.visibleFrame;
        CGFloat x = screenFrame.origin.x + (screenFrame.size.width - winW) / 2.0;
        CGFloat y = screenFrame.origin.y + (screenFrame.size.height - winH) / 2.0;

        NSRect winFrame = NSMakeRect(x, y, winW, winH);
        gClipboardPanel = [[ClipboardPanel alloc] initWithContentRect:winFrame
                                                            styleMask:NSWindowStyleMaskBorderless
                                                              backing:NSBackingStoreBuffered
                                                                defer:NO];
        gClipboardPanel.level = NSPopUpMenuWindowLevel;
        gClipboardPanel.collectionBehavior = NSWindowCollectionBehaviorMoveToActiveSpace |
                                             NSWindowCollectionBehaviorFullScreenAuxiliary;
        gClipboardPanel.backgroundColor = [NSColor clearColor];
        gClipboardPanel.opaque = NO;
        gClipboardPanel.hasShadow = YES;
        gClipboardPanel.appearance = AppTheme.currentTheme.isDark ?
            [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua] :
            [NSAppearance appearanceNamed:NSAppearanceNameAqua];

        ClipboardContentView *content = [[ClipboardContentView alloc] initWithFrame:NSMakeRect(0, 0, winW, winH)];
        gClipboardPanel.contentV = content;
        gClipboardPanel.contentView = content;

        [content loadHistoryData];
        [NSApp activateIgnoringOtherApps:YES];
        [gClipboardPanel orderFrontRegardless];
        [gClipboardPanel makeKeyAndOrderFront:nil];
        [gClipboardPanel makeFirstResponder:content.searchField];
        sendEvent(@{ @"event": @"clipboard-opened" });
    });
}

#pragma mark - Command Dispatcher

static void closePin(NSString *pinId) {
    dispatch_async(dispatch_get_main_queue(), ^{
        PinPanel *panel = gPanels[pinId];
        if (panel) {
            [panel close];
            [gPanels removeObjectForKey:pinId];
            sendEvent(@{ @"event": @"closed", @"pinId": pinId });
        }
    });
}

static void closeAllPins(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        for (NSString *pid in [gPanels allKeys]) {
            [gPanels[pid] close];
        }
        [gPanels removeAllObjects];
        sendEvent(@{ @"event": @"all-closed" });
    });
}

static void processLine(NSString *line) {
    if (!line || line.length == 0) return;
    NSData *data = [line dataUsingEncoding:NSUTF8StringEncoding];
    if (!data) return;

    NSError *err = nil;
    NSDictionary *dict = [NSJSONSerialization JSONObjectWithData:data options:0 error:&err];
    if (!dict || err) return;

    if (dict[@"theme"]) {
        [AppTheme setCurrentThemeWithName:dict[@"theme"]];
    }
    if (dict[@"lang"]) {
        [I18N setCurrentLanguage:dict[@"lang"]];
    }

    NSString *action = dict[@"action"];
    if ([action isEqualToString:@"pin"]) {
        createPin(dict);
    } else if ([action isEqualToString:@"capture"]) {
        startNativeCapture(dict[@"imagePath"]);
    } else if ([action isEqualToString:@"clipboard"]) {
        toggleClipboardPanel();
    } else if ([action isEqualToString:@"theme"]) {
        sendEvent(@{ @"event": @"theme-applied", @"theme": AppTheme.currentTheme.name, @"lang": I18N.currentLanguage });
    } else if ([action isEqualToString:@"close"]) {
        NSString *pinId = dict[@"pinId"];
        if (pinId) closePin(pinId);
    } else if ([action isEqualToString:@"close-all"]) {
        closeAllPins();
    } else if ([action isEqualToString:@"ping"]) {
        sendEvent(@{ @"event": @"pong" });
    }
}

static void startStdinReader(void) {
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        NSFileHandle *input = [NSFileHandle fileHandleWithStandardInput];
        NSMutableData *buffer = [NSMutableData data];
        while (YES) {
            NSData *chunk = [input availableData];
            if (!chunk || chunk.length == 0) {
                exit(0);
            }
            [buffer appendData:chunk];
            const char *bytes = (const char *)[buffer bytes];
            NSUInteger len = [buffer length];
            NSUInteger start = 0;
            for (NSUInteger i = 0; i < len; i++) {
                if (bytes[i] == '\n') {
                    NSData *lineData = [buffer subdataWithRange:NSMakeRange(start, i - start)];
                    NSString *line = [[NSString alloc] initWithData:lineData encoding:NSUTF8StringEncoding];
                    if (line) {
                        processLine([line stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]]);
                    }
                    start = i + 1;
                }
            }
            if (start > 0) {
                [buffer replaceBytesInRange:NSMakeRange(0, start) withBytes:NULL length:0];
            }
        }
    });
}

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];

        [AppTheme loadUserPreferences];

        gPanels = [NSMutableDictionary dictionary];

        startStdinReader();

        sendEvent(@{ @"event": @"ready" });

        [NSApp run];
    }
    return 0;
}
