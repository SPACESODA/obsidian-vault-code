export const en = {
	// Ribbon & Toolbars
	ribbonNewFileTooltip: "New file (any type)",
	viewToggleCode: "Code",
	viewToggleRendered: "Preview",
	viewToggleTooltip: "Switch between code and preview",
	editorLineWrapToggle: "Toggle line wrapping (Alt+Z)",
	saveChanges: "Save",
	saveChangesTooltip: "Save changes",
	saved: "Saved",

	// Search & Replace Panel
	searchFindPlaceholder: "Find...",
	searchFindAriaLabel: "Find",
	searchToggleReplaceTooltip: "Toggle replace",
	searchMatchCase: "Match case (Aa)",
	searchWholeWord: "Match whole word (\\b)",
	searchRegex: "Use regular expression (.*)",
	searchPreviousMatch: "Previous match",
	searchNextMatch: "Next match",
	searchSelectAll: "Select all matches",
	searchReplacePlaceholder: "Replace with...",
	searchReplaceAriaLabel: "Replace with",
	searchReplace: "Replace",
	searchReplaceAll: "Replace all",
	searchCountMatches: "{0} of {1}",
	searchNoResults: "No results",
	searchInvalidRegex: "Invalid regex",

	// Context Menu
	contextNewNoteHere: "New note here",
	contextNewFileHere: "New file here (any type)",
	contextNewFolderHere: "New folder here",
	contextNewFile: "New file (any type)",
	contextEditInCodeEditor: "Edit in code editor",

	// Modals - Create File
	modalCreateFileTitle: "Create new file",
	modalCreateFilePlaceholder: "e.g. script.py, .gitignore, src/app.js",
	modalCreateFileEmptyError: "File name cannot be empty.",
	modalCreateFileExistsError: "A file or folder named '{0}' already exists.",
	modalCreateFilePathInvalidError: "Path cannot contain invalid characters (\\ : * ? \" < > |).",
	modalButtonCreate: "Create",
	modalButtonCancel: "Cancel",

	// Modals - Create Folder
	modalCreateFolderTitle: "Create new folder",
	modalCreateFolderPlaceholder: "e.g. .github, assets, src/components",
	modalCreateFolderEmptyError: "Folder name cannot be empty.",
	modalCreateFolderExistsError: "A file or folder named '{0}' already exists.",

	// Modals - Rename
	modalRenameFileTitle: "Rename file",
	modalRenameFolderTitle: "Rename folder",
	modalRenamePlaceholder: "New name",
	modalButtonRename: "Rename",

	// Modals - Confirm Close Unsaved
	modalUnsavedTitle: "Unsaved changes in {0}",
	modalUnsavedMessage: "Do you want to save your changes before closing?",
	modalButtonSave: "Save changes",
	modalButtonDiscard: "Discard",

	// Modals - Confirm Replace All
	modalReplaceAllTitle: "Replace all occurrences",
	modalReplaceAllMessage: "Are you sure you want to replace all {0} occurrences of \"{1}\" with \"{2}\"?",
	modalButtonReplaceAll: "Replace all",

	// Callouts
	calloutBinaryTitle: "Unsupported binary format",
	calloutBinaryDesc: "This file ({0}) cannot be opened in the code editor to protect it from binary corruption.",

	// Settings - Language
	settingsLanguageName: "Language",
	settingsLanguageDesc: "Choose the display language for this plugin's interface.",
	settingsLanguageAuto: "Auto (follow Obsidian)",

	// Settings - File Explorer
	settingsGroupFileExplorer: "File explorer",
	settingsShowHiddenDotfilesName: "Show hidden dotfiles and folders",
	settingsShowHiddenDotfilesDesc: "Reveal files and directories whose names start with a dot (e.g. .gitignore, .env, .github/). Internal system directories like .trash remain safely hidden.",
	settingsShowAllFileTypesName: "Show all file types",
	settingsShowAllFileTypesDesc: "Display all files in your vault in the file explorer (such as code, JSON, data, and extensionless files), not just Markdown notes.",
	settingsPreventAutoOpenName: "Prevent automatic opening of unsupported files",
	settingsPreventAutoOpenDesc: "Single-clicking unsupported binary or document files (such as .zip, .exe, .docx, .dmg) in the file explorer only selects them, preventing accidental unzipping or application launching.",
	settingsOpenOnDoubleClickName: "Open unsupported files on double-click",
	settingsOpenOnDoubleClickDesc: "Allow opening unsupported files with your system's default application on double-click. If disabled, files can only be opened externally via the right-click context menu.",
	settingsIgnoredPathsName: "Ignored files and folders",
	settingsIgnoredPathsDesc: "Hide specific files and folders using .gitignore patterns (one rule per line). Supports wildcards (*, **), folder trailing slashes (/), and negations (!).",
	settingsIgnoredPathsPlaceholder: "Enter one pattern per line",
	settingsButtonResetDefault: "Reset to default",
	settingsTooltipResetIgnored: "Reset ignored paths to default list",

	// Settings - Code Editor
	settingsGroupCodeEditor: "Code editor",
	settingsSecurityWarning: "Revealing dotfiles allows viewing and editing sensitive configuration files (e.g. .env, tokens, credentials). Please exercise caution when modifying or deleting files.",
	settingsAllowEditDotfilesName: "Allow editing dotfiles and extensionless files",
	settingsAllowEditDotfilesDesc: "Open and edit dotfiles (such as .gitignore or .env) and files without extensions (such as license or makefile) directly in the built-in editor.",
	settingsAllowEditCodeFilesName: "Allow editing code and data files",
	settingsAllowEditCodeFilesDesc: "Open files matching the editable extensions list below in the built-in code editor.",
	settingsCustomExtensionsName: "Editable file extensions",
	settingsCustomExtensionsDesc: "File extensions to open in the code editor, separated by commas, spaces, or line breaks.",
	settingsCustomExtensionsPlaceholder: "Enter file extensions",
	settingsTooltipResetExtensions: "Reset extensions to default list",
	settingsTabSizeName: "Tab indent size",
	settingsTabSizeDesc: "The number of spaces a tab is equal to. Set to 'Inherit from Obsidian' to follow your core Obsidian editor settings.",
	settingsTabSizeAuto: "Inherit from Obsidian",
	settingsIndentWithName: "Indent with tabs",
	settingsIndentWithDesc: "Whether to insert tab characters or spaces when pressing the Tab key or auto-indenting.",
	settingsIndentWithAuto: "Inherit from Obsidian",
	settingsIndentWithTabs: "Tabs",
	settingsIndentWithSpaces: "Spaces",
	settingsLineWrappingName: "Line wrapping",
	settingsLineWrappingDesc: "Wrap long lines to fit the editor window.",
	settingsDisableAutoSaveName: "Disable auto-save",
	settingsDisableAutoSaveDesc: "Require pressing the save shortcut or tapping the save button before changes are saved to disk. Limitation: if you quit the Obsidian app, unsaved edits will be saved automatically.",
	settingsAutoSaveWarning: "Warning: Allowing auto-save immediately writes changes to disk, which may increase the risk of unintentionally damaging sensitive code files.",
	settingsResetAllName: "Reset all settings",
	settingsResetAllDesc: "Restore all plugin settings and file extensions back to their default values.",
	settingsButtonResetAll: "Reset all",
	settingsTooltipResetAll: "Reset all settings to default",

	// Notices
	noticeCreated: "Created {0}",
	noticeSaved: "Saved {0}",
	noticeHiddenFilesVisible: "Hidden dotfiles and folders are now visible.",
	noticeHiddenFilesHidden: "Hidden dotfiles and folders are now hidden.",
	noticeAllFilesVisible: "All file types are now visible.",
	noticeAllFilesHidden: "All file types are now hidden.",
	noticeDotfileEditingEnabled: "Dotfile and extensionless file editing is now enabled.",
	noticeDotfileEditingDisabled: "Dotfile and extensionless file editing is now disabled.",
	noticeCodeEditingEnabled: "Code and data file editing is now enabled.",
	noticeCodeEditingDisabled: "Code and data file editing is now disabled.",
	noticeAutoSaveDisabled: "Auto-save for code files is now disabled.",
	noticeAutoSaveEnabled: "Auto-save for code files is now enabled.",
	noticeExtensionsReset: "File extensions reset to default.",
	noticeIgnoredPathsReset: "Ignored paths reset to default.",
	noticeAllSettingsReset: "All settings have been reset to default.",
	noticeNoActiveToRename: "No active file or folder to rename.",
	noticeReplaceAllSuccess: "Replaced {0} occurrences.",

	// Commands
	commandCreateFile: "Create new file (any type)",
	commandCreateFolder: "Create new folder (including dotfolder)",
	commandRenameActive: "Rename active file or folder",
	commandToggleHidden: "Toggle hidden dotfiles and folders",
	commandToggleAllTypes: "Toggle all file types visibility",
	commandToggleAllowEditDotfiles: "Toggle dotfile and extensionless file editing",
	commandToggleAllowEditCodeFiles: "Toggle code and data file editing",
	commandToggleLineWrapping: "Toggle line wrapping in code editor",
};

export type TranslationSchema = typeof en;
