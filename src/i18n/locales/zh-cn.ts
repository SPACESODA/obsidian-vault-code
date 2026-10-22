import { TranslationSchema } from "./en";

export const zhCn: TranslationSchema = {
	// Ribbon & Toolbars
	ribbonNewFileTooltip: "新建文件（任何类型）",
	viewToggleCode: "源码",
	viewToggleRendered: "预览",
	viewToggleTooltip: "切换源码与预览视图",
	editorLineWrapToggle: "切换自动换行",
	saveChanges: "保存",
	saveChangesTooltip: "保存更改",
	saved: "已保存",

	// Search & Replace Panel
	searchFindPlaceholder: "查找...",
	searchFindAriaLabel: "查找",
	searchToggleReplaceTooltip: "切换替换栏",
	searchMatchCase: "区分大小写 (Aa)",
	searchWholeWord: "全字匹配 (\\b)",
	searchRegex: "使用正则表达式 (.*)",
	searchPreviousMatch: "上一个匹配项",
	searchNextMatch: "下一个匹配项",
	searchSelectAll: "选择所有匹配项",
	searchReplacePlaceholder: "替换为...",
	searchReplaceAriaLabel: "替换为",
	searchReplace: "替换",
	searchReplaceAll: "全部替换",
	searchCountMatches: "第 {0} 项，共 {1} 项",
	searchNoResults: "无结果",
	searchInvalidRegex: "表达式无效",

	// Context Menu
	contextNewNoteHere: "在此新建笔记",
	contextNewFileHere: "在此新建文件（任何类型）",
	contextNewFolderHere: "在此新建文件夹",
	contextNewFile: "新建文件（任何类型）",
	contextEditInCodeEditor: "在代码编辑器中编辑",

	// Modals - Create File
	modalCreateFileTitle: "新建文件",
	modalCreateFilePlaceholder: "例如 script.py、.gitignore 或 src/app.js",
	modalCreateFileEmptyError: "文件名不能为空。",
	modalCreateFileExistsError: "已存在名为“{0}”的文件或文件夹。",
	modalCreateFilePathInvalidError: "路径不能包含无效字符（\\ : * ? \" < > |）。",
	modalButtonCreate: "创建",
	modalButtonCancel: "取消",

	// Modals - Rename
	modalRenameFileTitle: "重命名文件",
	modalRenameFolderTitle: "重命名文件夹",
	modalRenamePlaceholder: "新名称",
	modalButtonRename: "重命名",

	// Modals - Confirm Close Unsaved
	modalUnsavedTitle: "“{0}”有未保存的更改",
	modalUnsavedMessage: "是否要在关闭前保存所做的更改？",
	modalButtonSave: "保存更改",
	modalButtonDiscard: "放弃更改",

	// Modals - Confirm Replace All
	modalReplaceAllTitle: "替换所有匹配项",
	modalReplaceAllMessage: "确定要将全部 {0} 个“{1}”替换为“{2}”吗？",
	modalButtonReplaceAll: "全部替换",

	// Modals - Go to Line
	modalButtonGo: "跳转",

	// Callouts
	calloutBinaryTitle: "不支持的二进制格式",
	calloutBinaryDesc: "无法在代码编辑器中打开此文件（{0}），以防止二进制数据损坏。",

	// Settings - Language
	settingsLanguageName: "语言",
	settingsLanguageDesc: "选择此插件界面的显示语言。",
	settingsLanguageAuto: "自动（跟随 Obsidian）",

	// Settings - File Explorer
	settingsGroupFileExplorer: "文件列表",
	settingsShowHiddenDotfilesName: "显示隐藏文件与文件夹",
	settingsShowHiddenDotfilesDesc: "显示名称以点开头的文件和目录（例如 .gitignore、.env、.github/）。系统内部目录（如 .trash）仍将安全隐藏。",
	settingsShowAllFileTypesName: "显示所有文件类型",
	settingsShowAllFileTypesDesc: "在文件列表中显示仓库中的所有文件（例如代码、JSON、数据文件以及无扩展名文件），而不仅是 Markdown 笔记。",
	settingsPreventAutoOpenName: "阻止自动打开不支持的文件",
	settingsPreventAutoOpenDesc: "在文件列表中单击不支持的二进制或文档文件（例如 .zip、.exe、.docx、.dmg）时仅选中该文件，防止意外解压或启动外部应用程序。",
	settingsOpenOnDoubleClickName: "双击打开不支持的文件",
	settingsOpenOnDoubleClickDesc: "允许双击使用系统默认应用程序打开不支持的文件。若禁用，则只能通过右键菜单手动打开。",
	settingsObsidianIgnoreName: "忽略文件和文件夹：{0}",
	settingsObsidianIgnoreDesc: "遵循仓库根目录 .obsidianignore 中的规则，采用标准 .gitignore 语法（支持通配符、文件夹斜杠与反向排除 !）。",
	settingsButtonCreateDefault: "创建默认文件",
	settingsButtonCopyDefault: "复制默认值",
	settingsTooltipCreateDefault: "在仓库根目录创建包含默认规则的 .obsidianignore 文件",
	settingsTooltipCopyDefault: "将默认忽略规则复制到剪贴板",
	settingsNoticeCreatedObsidianIgnore: "已在仓库根目录创建 .obsidianignore 文件。",
	settingsNoticeCopiedDefaultIgnore: "默认忽略规则已复制到剪贴板。",
	settingsGitIgnoreName: "忽略文件和文件夹：{0}",
	settingsGitIgnoreDesc: "同时遵循存放于仓库根目录的 .gitignore 文件中定义的规则。",
	settingsButtonResetDefault: "重置为默认值",

	// Settings - Code Editor
	settingsGroupCodeEditor: "代码编辑器",
	settingsSecurityWarning: "显示隐藏文件允许查看和编辑敏感配置文件（例如 .env、token、凭据）。修改或删除文件时请务必谨慎。",
	settingsAllowEditDotfilesName: "允许编辑隐藏文件与无扩展名文件",
	settingsAllowEditDotfilesDesc: "直接在内置编辑器中打开并编辑点文件（如 .gitignore 或 .env）以及无扩展名的文件（如 license 或 makefile）。",
	settingsAllowEditCodeFilesName: "允许编辑代码与数据文件",
	settingsAllowEditCodeFilesDesc: "在内置代码编辑器中打开符合下方可编辑扩展名列表的文件。",
	settingsCustomExtensionsName: "可编辑扩展名",
	settingsCustomExtensionsDesc: "在代码编辑器中打开的扩展名，以逗号、空格或换行分隔。",
	settingsCustomExtensionsPlaceholder: "输入扩展名",
	settingsTooltipResetExtensions: "将扩展名重置为默认列表",
	settingsTabSizeName: "缩进宽度 (Tab 宽度)",
	settingsTabSizeDesc: "一个 Tab 等同的空格数量。设为「继承 Obsidian 设置」将跟随您的 Obsidian 核心编辑器设置。",
	settingsTabSizeAuto: "继承 Obsidian 设置",
	settingsIndentWithName: "使用 Tab 缩进",
	settingsIndentWithDesc: "按下 Tab 键或自动缩进时插入 Tab 字符或空格。",
	settingsIndentWithAuto: "继承 Obsidian 设置",
	settingsIndentWithTabs: "Tab (制表符)",
	settingsIndentWithSpaces: "空格 (Spaces)",
	settingsLineWrappingName: "自动换行",
	settingsLineWrappingDesc: "长行自动折行以适应编辑器窗口。",
	settingsDisableAutoSaveName: "禁用自动保存",
	settingsDisableAutoSaveDesc: "在将更改保存到磁盘之前，必须先按下保存快捷键或点击保存按钮。限制：如果退出 Obsidian 应用程序，未保存的编辑将自动保存。",
	settingsAutoSaveWarning: "警告：允许自动保存会立即将更改写入磁盘，这可能会增加意外损坏敏感代码文件的风险。",
	settingsResetAllName: "重置所有设置",
	settingsResetAllDesc: "将所有插件设置与文件扩展名恢复为默认值。",
	settingsButtonResetAll: "全部重置",
	settingsTooltipResetAll: "将所有设置重置为默认值",

	// Notices
	noticeCreated: "已创建 {0}",
	noticeSaved: "已保存",
	noticeHiddenFilesVisible: "隐藏文件与文件夹现已显示。",
	noticeHiddenFilesHidden: "隐藏文件与文件夹现已隐藏。",
	noticeAllFilesVisible: "所有文件类型现已显示。",
	noticeAllFilesHidden: "所有文件类型现已隐藏。",
	noticeDotfileEditingEnabled: "隐藏文件与无扩展名文件编辑现已启用。",
	noticeDotfileEditingDisabled: "隐藏文件与无扩展名文件编辑现已禁用。",
	noticeCodeEditingEnabled: "代码与数据文件编辑现已启用。",
	noticeCodeEditingDisabled: "代码与数据文件编辑现已禁用。",
	noticeAutoSaveDisabled: "代码文件自动保存现已禁用。",
	noticeAutoSaveEnabled: "代码文件自动保存现已启用。",
	noticeExtensionsReset: "文件扩展名已重置为默认值。",
	noticeAllSettingsReset: "所有设置已重置为默认值。",
	noticeNoActiveToRename: "没有可重命名的活动文件或文件夹。",
	noticeReplaceAllSuccess: "已替换 {0} 个匹配项。",

	// Commands
	commandCreateFile: "新建文件（任何类型）",
	commandCreateFolder: "新建文件夹（包含点文件夹）",
	commandRenameActive: "重命名当前文件或文件夹",
	commandToggleHidden: "切换隐藏文件与文件夹显示状态",
	commandToggleAllTypes: "切换所有文件类型显示状态",
	commandToggleAllowEditDotfiles: "切换隐藏文件与无扩展名文件编辑状态",
	commandToggleAllowEditCodeFiles: "切换代码与数据文件编辑状态",
	commandToggleLineWrapping: "在代码编辑器中切换自动换行",
	commandGotoLine: "在代码编辑器中跳转到指定行",
};
