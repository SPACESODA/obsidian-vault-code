import { TranslationSchema } from "./en";

export const ja: TranslationSchema = {
	// Ribbon & Toolbars
	ribbonNewFileTooltip: "新規ファイル（任意の形式）",
	viewToggleCode: "コード",
	viewToggleRendered: "プレビュー",
	viewToggleTooltip: "コードとプレビューの切り替え",
	editorLineWrapToggle: "行の折り返しを切り替え",
	saveChanges: "保存",
	saveChangesTooltip: "変更を保存",
	saved: "保存済み",

	// Search & Replace Panel
	searchFindPlaceholder: "検索...",
	searchFindAriaLabel: "検索",
	searchToggleReplaceTooltip: "置換バーを切り替え",
	searchMatchCase: "大文字・小文字を区別 (Aa)",
	searchWholeWord: "単語単位で一致 (\\b)",
	searchRegex: "正規表現を使用 (.*)",
	searchPreviousMatch: "前の候補",
	searchNextMatch: "次の候補",
	searchSelectAll: "すべて選択",
	searchReplacePlaceholder: "置換...",
	searchReplaceAriaLabel: "置換",
	searchReplace: "置換",
	searchReplaceAll: "すべて置換",
	searchCountMatches: "{0} / {1} 件",
	searchNoResults: "該当なし",
	searchInvalidRegex: "正規表現が無効です",

	// Context Menu
	contextNewNoteHere: "ここに新規ノートを作成",
	contextNewFileHere: "ここに新規ファイルを作成（任意の形式）",
	contextNewFolderHere: "ここに新規フォルダを作成",
	contextNewFile: "新規ファイル（任意の形式）",
	contextEditInCodeEditor: "コードエディタで編集",

	// Modals - Create File
	modalCreateFileTitle: "新規ファイルを作成",
	modalCreateFilePlaceholder: "例: script.py, .gitignore, src/app.js",
	modalCreateFileEmptyError: "ファイル名を入力してください。",
	modalCreateFileExistsError: "「{0}」という名前のファイルまたはフォルダが既に存在します。",
	modalCreateFilePathInvalidError: "パスに無効な文字（\\ : * ? \" < > |）を含めることはできません。",
	modalButtonCreate: "作成",
	modalButtonCancel: "キャンセル",

	// Modals - Rename
	modalRenameFileTitle: "ファイル名を変更",
	modalRenameFolderTitle: "フォルダ名を変更",
	modalRenamePlaceholder: "新しい名前",
	modalButtonRename: "変更",

	// Modals - Confirm Close Unsaved
	modalUnsavedTitle: "「{0}」の未保存の変更",
	modalUnsavedMessage: "閉じる前に変更を保存しますか？",
	modalButtonSave: "保存する",
	modalButtonDiscard: "破棄する",

	// Modals - Confirm Replace All
	modalReplaceAllTitle: "すべて置換の確認",
	modalReplaceAllMessage: "{0} 件の一致する「{1}」を「{2}」にすべて置換しますか？",
	modalButtonReplaceAll: "すべて置換",

	// Modals - Go to Line
	modalButtonGo: "移動",

	// Callouts
	calloutBinaryTitle: "サポートされていないバイナリ形式",
	calloutBinaryDesc: "バイナリ破損を防ぐため、このファイル（{0}）をコードエディタで開くことはできません。",

	// Settings - Language
	settingsLanguageName: "言語",
	settingsLanguageDesc: "このプラグインの表示言語を選択します。",
	settingsLanguageAuto: "自動 (Obsidian に従う)",

	// Settings - File Explorer
	settingsGroupFileExplorer: "ファイルエクスプローラー",
	settingsShowHiddenDotfilesName: "隠しファイル・フォルダを表示",
	settingsShowHiddenDotfilesDesc: "名前がドットで始まるファイルやディレクトリ（例: .gitignore, .env, .github/）を表示します。.trash などのシステム内部ディレクトリは非表示のまま保護されます。",
	settingsShowAllFileTypesName: "すべてのファイル形式を表示",
	settingsShowAllFileTypesDesc: "Markdown ノートだけでなく、保管庫内のすべてのファイル（コード、JSON、データファイル、拡張子のないファイルなど）をファイルエクスプローラーに表示します。",
	settingsPreventAutoOpenName: "未サポートファイルの自動起動を防止",
	settingsPreventAutoOpenDesc: "ファイルエクスプローラーで未サポートのバイナリやドキュメントファイル（.zip、.exe、.docx、.dmg など）をシングルクリックした際に選択のみ行い、誤った解凍や外部アプリの起動を防ぎます。",
	settingsOpenOnDoubleClickName: "ダブルクリックで未サポートファイルを開く",
	settingsOpenOnDoubleClickDesc: "ダブルクリック時にシステムの標準アプリケーションでファイルを開くことを許可します。無効の場合、右クリックメニューからのみ外部起動できます。",
	settingsIgnoredPathsName: "除外するファイルとフォルダ",
	settingsIgnoredPathsDesc: ".gitignore 形式のパターンを使用して特定のファイルやフォルダを非表示にします（1行に1ルール）。ワイルドカード（*、**）、フォルダ末尾スラッシュ（/）、否定（!）に対応しています。",
	settingsIgnoredPathsPlaceholder: "1行に1つのパターンを入力",
	settingsButtonResetDefault: "デフォルトに戻す",
	settingsTooltipResetIgnored: "除外パスをデフォルトリストにリセット",

	// Settings - Code Editor
	settingsGroupCodeEditor: "コードエディタ",
	settingsSecurityWarning: "隠しファイルを表示すると、機密性の高い設定ファイル（.env、APIキー、認証情報など）の閲覧・編集が可能になります。変更や削除には十分ご注意ください。",
	settingsAllowEditDotfilesName: "ドットファイルおよび拡張子なしファイルの編集を許可",
	settingsAllowEditDotfilesDesc: "ドットファイル（.gitignore や .env など）および拡張子のないファイル（license や makefile など）を内蔵エディタで直接開いて編集できるようにします。",
	settingsAllowEditCodeFilesName: "コードおよびデータファイルの編集を許可",
	settingsAllowEditCodeFilesDesc: "下記の設定リストに該当する拡張子のファイルを内蔵コードエディタで開くようにします。",
	settingsCustomExtensionsName: "編集対象の拡張子",
	settingsCustomExtensionsDesc: "コードエディタで開くファイルの拡張子を指定します（カンマ、スペース、改行で区切ります）。",
	settingsCustomExtensionsPlaceholder: "拡張子を入力",
	settingsTooltipResetExtensions: "拡張子をデフォルトリストにリセット",
	settingsTabSizeName: "タブインデント幅",
	settingsTabSizeDesc: "タブ1文字に相当するスペースの数。「Obsidianの設定に従う」に設定すると、コア設定に従います。",
	settingsTabSizeAuto: "Obsidianの設定に従う",
	settingsIndentWithName: "タブ文字でインデント",
	settingsIndentWithDesc: "Tabキー押下または自動インデント時にタブ文字またはスペースを挿入します。",
	settingsIndentWithAuto: "Obsidianの設定に従う",
	settingsIndentWithTabs: "タブ (Tabs)",
	settingsIndentWithSpaces: "スペース (Spaces)",
	settingsLineWrappingName: "行の折り返し",
	settingsLineWrappingDesc: "エディタの幅に合わせて長い行を折り返します。",
	settingsDisableAutoSaveName: "自動保存を無効化",
	settingsDisableAutoSaveDesc: "変更をディスクに保存する前に、保存ショートカットキーを押すか保存ボタンをタップすることを必須にします。注意: Obsidian アプリを終了すると、未保存の編集は自動的に保存されます。",
	settingsAutoSaveWarning: "警告: 自動保存を有効にすると変更が即座に書き込まれるため、機密コードファイルを誤って破損するリスクが高まる可能性があります。",
	settingsResetAllName: "すべての設定を初期化",
	settingsResetAllDesc: "すべてのプラグイン設定と拡張子リストをデフォルト値に戻します。",
	settingsButtonResetAll: "すべてリセット",
	settingsTooltipResetAll: "すべての設定をデフォルトに戻す",

	// Notices
	noticeCreated: "{0} を作成しました",
	noticeSaved: "保存しました",
	noticeHiddenFilesVisible: "隠しファイルとフォルダが表示されるようになりました。",
	noticeHiddenFilesHidden: "隠しファイルとフォルダが非表示になりました。",
	noticeAllFilesVisible: "すべてのファイル形式が表示されるようになりました。",
	noticeAllFilesHidden: "すべてのファイル形式が非表示になりました。",
	noticeDotfileEditingEnabled: "ドットファイルおよび拡張子なしファイルの編集が有効になりました。",
	noticeDotfileEditingDisabled: "ドットファイルおよび拡張子なしファイルの編集が無効になりました。",
	noticeCodeEditingEnabled: "コードおよびデータファイルの編集が有効になりました。",
	noticeCodeEditingDisabled: "コードおよびデータファイルの編集が無効になりました。",
	noticeAutoSaveDisabled: "コードファイルの自動保存が無効になりました。",
	noticeAutoSaveEnabled: "コードファイルの自動保存が有効になりました。",
	noticeExtensionsReset: "拡張子リストをデフォルトにリセットしました。",
	noticeIgnoredPathsReset: "除外パスをデフォルトにリセットしました。",
	noticeAllSettingsReset: "すべての設定をデフォルトにリセットしました。",
	noticeNoActiveToRename: "名前を変更するアクティブなファイルまたはフォルダがありません。",
	noticeReplaceAllSuccess: "{0} 件の一致項目を置換しました。",

	// Commands
	commandCreateFile: "新規ファイルを作成（任意の形式）",
	commandCreateFolder: "新規フォルダを作成（ドットフォルダ含む）",
	commandRenameActive: "アクティブなファイルまたはフォルダの名前を変更",
	commandToggleHidden: "隠しファイルとフォルダの表示・非表示を切り替え",
	commandToggleAllTypes: "すべてのファイル形式の表示・非表示を切り替え",
	commandToggleAllowEditDotfiles: "ドットファイルおよび拡張子なしファイル編集の切り替え",
	commandToggleAllowEditCodeFiles: "コードおよびデータファイル編集の切り替え",
	commandToggleLineWrapping: "コードエディタで行の折り返しを切り替え",
	commandGotoLine: "コードエディタで指定行へジャンプ",
};
