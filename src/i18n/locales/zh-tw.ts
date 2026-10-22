import { TranslationSchema } from "./en";

export const zhTw: TranslationSchema = {
	// Ribbon & Toolbars
	ribbonNewFileTooltip: "新增檔案（任何類型）",
	viewToggleCode: "原始碼",
	viewToggleRendered: "預覽",
	viewToggleTooltip: "切換原始碼與預覽檢視",
	saveChanges: "儲存",
	saveChangesTooltip: "儲存變更",
	saved: "已儲存",

	// Search & Replace Panel
	searchFindPlaceholder: "尋找...",
	searchFindAriaLabel: "尋找",
	searchToggleReplaceTooltip: "切換取代列",
	searchMatchCase: "大小寫須相符 (Aa)",
	searchWholeWord: "全字拼寫須相符 (\\b)",
	searchRegex: "使用規則運算式 (.*)",
	searchPreviousMatch: "上一個相符項",
	searchNextMatch: "下一個相符項",
	searchSelectAll: "選取所有相符項",
	searchClose: "關閉搜尋 (Esc)",
	searchReplacePlaceholder: "取代為...",
	searchReplaceAriaLabel: "取代為",
	searchReplace: "取代",
	searchReplaceAll: "全部取代",
	searchCountMatches: "第 {0} 個，共 {1} 個",
	searchNoResults: "查無結果",
	searchInvalidRegex: "運算式無效",

	// Context Menu
	contextNewNoteHere: "在此新增筆記",
	contextNewFileHere: "在此新增檔案（任何類型）",
	contextNewFile: "新增檔案（任何類型）",
	contextEditInCodeEditor: "在程式碼編輯器中編輯",

	// Modals - Create File
	modalCreateFileTitle: "新增檔案",
	modalCreateFilePlaceholder: "例如 script.py、.gitignore 或 src/app.js",
	modalCreateFileEmptyError: "檔案名稱不能為空。",
	modalCreateFileExistsError: "已存在名為「{0}」的檔案或資料夾。",
	modalCreateFilePathInvalidError: "路徑不能包含無效字元（\\ : * ? \" < > |）。",
	modalButtonCreate: "建立",
	modalButtonCancel: "取消",

	// Modals - Create Folder
	modalCreateFolderTitle: "新增資料夾",
	modalCreateFolderPlaceholder: "例如 .github、assets 或 src/components",
	modalCreateFolderEmptyError: "資料夾名稱不能為空。",
	modalCreateFolderExistsError: "已存在名為「{0}」的檔案或資料夾。",

	// Modals - Rename
	modalRenameFileTitle: "重新命名檔案",
	modalRenameFolderTitle: "重新命名資料夾",
	modalRenamePlaceholder: "新名稱",
	modalButtonRename: "重新命名",

	// Modals - Confirm Close Unsaved
	modalUnsavedTitle: "「{0}」有未儲存的變更",
	modalUnsavedMessage: "是否要在關閉前儲存所做的變更？",
	modalButtonSave: "儲存變更",
	modalButtonDiscard: "捨棄變更",

	// Modals - Confirm Replace All
	modalReplaceAllTitle: "取代所有相符項目",
	modalReplaceAllMessage: "確定要將全部 {0} 個「{1}」取代為「{2}」嗎？",
	modalButtonReplaceAll: "全部取代",

	// Callouts
	calloutBinaryTitle: "不支援的二進位格式",
	calloutBinaryDesc: "無法在程式碼編輯器中開啟此檔案（{0}），以防止二進位資料損壞。",

	// Settings - Language
	settingsLanguageName: "語言",
	settingsLanguageDesc: "選擇此外掛程式界面的顯示語言。",
	settingsLanguageAuto: "自動（跟隨 Obsidian）",

	// Settings - File Explorer
	settingsGroupFileExplorer: "檔案總管",
	settingsShowHiddenDotfilesName: "顯示隱藏檔案與資料夾",
	settingsShowHiddenDotfilesDesc: "顯示名稱以點開頭的檔案和目錄（例如 .gitignore、.env、.github/）。系統內部目錄（如 .trash）仍會安全隱藏。",
	settingsShowAllFileTypesName: "顯示所有檔案類型",
	settingsShowAllFileTypesDesc: "在檔案總管中顯示保存庫中的所有檔案（例如程式碼、JSON、資料檔以及無副檔名檔案），而不僅是 Markdown 筆記。",
	settingsPreventAutoOpenName: "防止自動開啟不支援的檔案",
	settingsPreventAutoOpenDesc: "在檔案總管中單擊不支援的二進位或文件檔案（例如 .zip、.exe、.docx、.dmg）時僅選取檔案，防止意外解壓縮或啟動外部應用程式。",
	settingsOpenOnDoubleClickName: "按兩下開啟不支援的檔案",
	settingsOpenOnDoubleClickDesc: "允許按兩下使用系統預設應用程式開啟不支援的檔案。若停用，則只能透過右鍵選單手動開啟。",
	settingsIgnoredPathsName: "忽略的檔案與資料夾",
	settingsIgnoredPathsDesc: "使用 .gitignore 規則格式強制隱藏特定檔案和資料夾（每行一條規則）。支援萬用字元（*、**）、資料夾結尾斜線（/）以及反向排除（!）。",
	settingsIgnoredPathsPlaceholder: "每行輸入一條規則",
	settingsButtonResetDefault: "重設為預設值",
	settingsTooltipResetIgnored: "將忽略路徑重設為預設清單",

	// Settings - Code Editor
	settingsGroupCodeEditor: "程式碼編輯器",
	settingsSecurityWarning: "顯示隱藏檔案會允許檢視與編輯機密設定檔（例如 .env、token、憑證）。在檔案總管中修改或刪除檔案時請務必謹慎。",
	settingsAllowEditDotfilesName: "允許編輯隱藏檔案與無副檔名檔案",
	settingsAllowEditDotfilesDesc: "直接在內建編輯器中開啟並編輯點檔案（如 .gitignore 或 .env）以及無副檔名的檔案（如 license 或 makefile）。",
	settingsAllowEditCodeFilesName: "允許編輯程式碼與資料檔案",
	settingsAllowEditCodeFilesDesc: "在內建程式碼編輯器中開啟符合下方可編輯副檔名清單的檔案。",
	settingsCustomExtensionsName: "可編輯副檔名",
	settingsCustomExtensionsDesc: "在程式碼編輯器中開啟的副檔名，以逗號、空格或換行分隔。",
	settingsCustomExtensionsPlaceholder: "輸入副檔名",
	settingsTooltipResetExtensions: "將副檔名重設為預設清單",
	settingsTabSizeName: "縮排寬度 (Tab 寬度)",
	settingsTabSizeDesc: "一個 Tab 等同的空格數量。設為「繼承 Obsidian 設定」將跟隨您的 Obsidian 核心編輯器設定。",
	settingsTabSizeAuto: "繼承 Obsidian 設定",
	settingsIndentWithName: "使用 Tab 縮排",
	settingsIndentWithDesc: "按下 Tab 鍵或自動縮排時插入 Tab 字元或空格。",
	settingsIndentWithAuto: "繼承 Obsidian 設定",
	settingsIndentWithTabs: "Tab (製表符)",
	settingsIndentWithSpaces: "空格 (Spaces)",
	settingsDisableAutoSaveName: "停用自動儲存",
	settingsDisableAutoSaveDesc: "在將變更儲存到磁碟之前，必須先按下儲存快捷鍵或點選儲存按鈕。限制：若退出 Obsidian 應用程式，未儲存的編輯將會自動儲存。",
	settingsAutoSaveWarning: "警告：允許自動儲存會立即將變更寫入磁碟，這可能會增加意外損壞機密程式碼檔案的風險。",
	settingsResetAllName: "重設所有設定",
	settingsResetAllDesc: "將所有外掛程式設定與副檔名還原為預設值。",
	settingsButtonResetAll: "全部重設",
	settingsTooltipResetAll: "將所有設定重設為預設值",

	// Notices
	noticeCreated: "已建立 {0}",
	noticeSaved: "已儲存 {0}",
	noticeHiddenFilesVisible: "隱藏檔案與資料夾現已顯示。",
	noticeHiddenFilesHidden: "隱藏檔案與資料夾現已隱藏。",
	noticeAllFilesVisible: "所有檔案類型現已顯示。",
	noticeAllFilesHidden: "所有檔案類型現已隱藏。",
	noticeDotfileEditingEnabled: "隱藏檔案與無副檔名檔案編輯現已啟用。",
	noticeDotfileEditingDisabled: "隱藏檔案與無副檔名檔案編輯現已停用。",
	noticeCodeEditingEnabled: "程式碼與資料檔案編輯現已啟用。",
	noticeCodeEditingDisabled: "程式碼與資料檔案編輯現已停用。",
	noticeAutoSaveDisabled: "程式碼檔案自動儲存現已停用。",
	noticeAutoSaveEnabled: "程式碼檔案自動儲存現已啟用。",
	noticeExtensionsReset: "副檔名已重設為預設值。",
	noticeIgnoredPathsReset: "忽略路徑已重設為預設值。",
	noticeAllSettingsReset: "所有設定已重設為預設值。",
	noticeNoActiveToRename: "沒有可重新命名的使用中檔案或資料夾。",
	noticeReplaceAllSuccess: "已取代 {0} 個相符項目。",

	// Commands
	commandCreateFile: "新增檔案（任何類型）",
	commandCreateFolder: "新增資料夾（包含點資料夾）",
	commandRenameActive: "重新命名目前檔案或資料夾",
	commandToggleHidden: "切換隱藏檔案與資料夾顯示狀態",
	commandToggleAllTypes: "切換所有檔案類型顯示狀態",
	commandToggleAllowEditDotfiles: "切換隱藏檔案與無副檔名檔案編輯狀態",
	commandToggleAllowEditCodeFiles: "切換程式碼與資料檔案編輯狀態",
};
