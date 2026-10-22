import { TranslationSchema } from "./en";

export const ru: TranslationSchema = {
	// Ribbon & Toolbars
	ribbonNewFileTooltip: "Новый файл (любой тип)",
	viewToggleCode: "Код",
	viewToggleRendered: "Просмотр",
	viewToggleTooltip: "Переключение между режимами кода и просмотра",
	editorLineWrapToggle: "Переключить перенос строк (Alt+Z)",
	saveChanges: "Сохранить",
	saveChangesTooltip: "Сохранить изменения",
	saved: "Сохранено",

	// Search & Replace Panel
	searchFindPlaceholder: "Найти...",
	searchFindAriaLabel: "Найти",
	searchToggleReplaceTooltip: "Показать/скрыть замену",
	searchMatchCase: "Учитывать регистр (Aa)",
	searchWholeWord: "Слово целиком (\\b)",
	searchRegex: "Регулярное выражение (.*)",
	searchPreviousMatch: "Предыдущее совпадение",
	searchNextMatch: "Следующее совпадение",
	searchSelectAll: "Выбрать все совпадения",
	searchReplacePlaceholder: "Заменить на...",
	searchReplaceAriaLabel: "Заменить на",
	searchReplace: "Заменить",
	searchReplaceAll: "Заменить все",
	searchCountMatches: "{0} из {1}",
	searchNoResults: "Нет результатов",
	searchInvalidRegex: "Неверное регулярное выражение",

	// Context Menu
	contextNewNoteHere: "Новая заметка здесь",
	contextNewFileHere: "Новый файл здесь (любой тип)",
	contextNewFolderHere: "Новая папка здесь",
	contextNewFile: "Новый файл (любой тип)",
	contextEditInCodeEditor: "Редактировать в редакторе кода",

	// Modals - Create File
	modalCreateFileTitle: "Создать новый файл",
	modalCreateFilePlaceholder: "например, script.py, .gitignore, src/app.js",
	modalCreateFileEmptyError: "Имя файла не может быть пустым.",
	modalCreateFileExistsError: "Файл или папка с именем '{0}' уже существует.",
	modalCreateFilePathInvalidError: "Путь не может содержать недопустимые символы (\\ : * ? \" < > |).",
	modalButtonCreate: "Создать",
	modalButtonCancel: "Отмена",

	// Modals - Create Folder
	modalCreateFolderTitle: "Создать новую папку",
	modalCreateFolderPlaceholder: "например, .github, assets, src/components",
	modalCreateFolderEmptyError: "Имя папки не может быть пустым.",
	modalCreateFolderExistsError: "Файл или папка с именем '{0}' уже существует.",

	// Modals - Rename
	modalRenameFileTitle: "Переименовать файл",
	modalRenameFolderTitle: "Переименовать папку",
	modalRenamePlaceholder: "Новое имя",
	modalButtonRename: "Переименовать",

	// Modals - Confirm Close Unsaved
	modalUnsavedTitle: "Несохраненные изменения в {0}",
	modalUnsavedMessage: "Сохранить изменения перед закрытием?",
	modalButtonSave: "Сохранить изменения",
	modalButtonDiscard: "Не сохранять",

	// Modals - Confirm Replace All
	modalReplaceAllTitle: "Заменить все совпадения",
	modalReplaceAllMessage: "Вы уверены, что хотите заменить все {0} совпадений «{1}» на «{2}»?",
	modalButtonReplaceAll: "Заменить все",

	// Callouts
	calloutBinaryTitle: "Неподдерживаемый двоичный формат",
	calloutBinaryDesc: "Этот файл ({0}) нельзя открыть в редакторе кода во избежание повреждения двоичных данных.",

	// Settings - Language
	settingsLanguageName: "Язык",
	settingsLanguageDesc: "Выберите язык интерфейса для этого плагина.",
	settingsLanguageAuto: "Авто (как в Obsidian)",

	// Settings - File Explorer
	settingsGroupFileExplorer: "Проводник файлов",
	settingsShowHiddenDotfilesName: "Показывать скрытые файлы и папки",
	settingsShowHiddenDotfilesDesc: "Отображать файлы и папки, имена которых начинаются с точки (например, .gitignore, .env, .github/). Системные каталоги (например, .trash) останутся скрытыми.",
	settingsShowAllFileTypesName: "Показывать файлы всех типов",
	settingsShowAllFileTypesDesc: "Отображать все файлы хранилища в проводнике (файлы кода, JSON, данных и файлы без расширений), а не только заметки Markdown.",
	settingsPreventAutoOpenName: "Предотвращать автооткрытие неподдерживаемых файлов",
	settingsPreventAutoOpenDesc: "Одиночный щелчок по неподдерживаемым двоичным файлам или документам (.zip, .exe, .docx, .dmg) только выбирает их, предотвращая случайную распаковку или запуск внешних приложений.",
	settingsOpenOnDoubleClickName: "Открывать неподдерживаемые файлы двойным щелчком",
	settingsOpenOnDoubleClickDesc: "Разрешить открытие неподдерживаемых файлов системным приложением по умолчанию двойным щелчком. Если отключено, файлы можно открыть только через контекстное меню.",
	settingsIgnoredPathsName: "Игнорируемые файлы и папки",
	settingsIgnoredPathsDesc: "Скрывать определенные файлы и папки с помощью правил в формате .gitignore (по одному правилу на строку). Поддерживаются шаблоны (*, **), косая черта папки (/) и исключения (!).",
	settingsIgnoredPathsPlaceholder: "Введите по одному правилу на строку",
	settingsButtonResetDefault: "Сбросить по умолчанию",
	settingsTooltipResetIgnored: "Сбросить игнорируемые пути к исходному списку",

	// Settings - Code Editor
	settingsGroupCodeEditor: "Редактор кода",
	settingsSecurityWarning: "Отображение скрытых файлов позволяет просматривать и редактировать конфиденциальные файлы конфигурации (.env, токены, учетные данные). Будьте осторожны при изменении или удалении файлов.",
	settingsAllowEditDotfilesName: "Разрешить редактирование скрытых файлов и файлов без расширения",
	settingsAllowEditDotfilesDesc: "Открывать и редактировать скрытые файлы (например, .gitignore или .env) и файлы без расширения (например, license или makefile) непосредственно во встроенном редакторе.",
	settingsAllowEditCodeFilesName: "Разрешить редактирование файлов кода и данных",
	settingsAllowEditCodeFilesDesc: "Открывать файлы с расширениями из списка ниже во встроенном редакторе кода.",
	settingsCustomExtensionsName: "Редактируемые расширения файлов",
	settingsCustomExtensionsDesc: "Расширения файлов для открытия в редакторе кода, разделенные запятыми, пробелами или переносами строк.",
	settingsCustomExtensionsPlaceholder: "Введите расширения",
	settingsTooltipResetExtensions: "Сбросить расширения к исходному списку",
	settingsTabSizeName: "Размер отступа табуляции",
	settingsTabSizeDesc: "Количество пробелов на один символ табуляции. Выберите 'Наследовать из Obsidian', чтобы использовать основные настройки.",
	settingsTabSizeAuto: "Наследовать из Obsidian",
	settingsIndentWithName: "Отступ табуляцией",
	settingsIndentWithDesc: "Вставлять символы табуляции или пробелы при отступе.",
	settingsIndentWithAuto: "Наследовать из Obsidian",
	settingsIndentWithTabs: "Табуляция",
	settingsIndentWithSpaces: "Пробелы",
	settingsLineWrappingName: "Перенос строк",
	settingsLineWrappingDesc: "Переносить длинные строки по ширине окна редактора.",
	settingsDisableAutoSaveName: "Отключить автосохранение",
	settingsDisableAutoSaveDesc: "Требуется нажать сочетание клавиш или кнопку сохранения перед записью изменений на диск. Примечание: при закрытии Obsidian несохраненные изменения сохранятся автоматически.",
	settingsAutoSaveWarning: "Предупреждение: автосохранение мгновенно записывает изменения на диск, что может увеличить риск случайного повреждения важных файлов кода.",
	settingsResetAllName: "Сбросить все настройки",
	settingsResetAllDesc: "Восстановить все настройки плагина и расширения файлов до значений по умолчанию.",
	settingsButtonResetAll: "Сбросить все",
	settingsTooltipResetAll: "Сбросить все настройки к значениям по умолчанию",

	// Notices
	noticeCreated: "Создан {0}",
	noticeSaved: "Сохранен {0}",
	noticeHiddenFilesVisible: "Скрытые файлы и папки теперь видны.",
	noticeHiddenFilesHidden: "Скрытые файлы и папки теперь скрыты.",
	noticeAllFilesVisible: "Все типы файлов теперь видны.",
	noticeAllFilesHidden: "Все типы файлов теперь скрыты.",
	noticeDotfileEditingEnabled: "Редактирование скрытых файлов и файлов без расширения включено.",
	noticeDotfileEditingDisabled: "Редактирование скрытых файлов и файлов без расширения отключено.",
	noticeCodeEditingEnabled: "Редактирование файлов кода и данных включено.",
	noticeCodeEditingDisabled: "Редактирование файлов кода и данных отключено.",
	noticeAutoSaveDisabled: "Автосохранение для файлов кода отключено.",
	noticeAutoSaveEnabled: "Автосохранение для файлов кода включено.",
	noticeExtensionsReset: "Расширения файлов сброшены по умолчанию.",
	noticeIgnoredPathsReset: "Игнорируемые пути сброшены по умолчанию.",
	noticeAllSettingsReset: "Все настройки были сброшены по умолчанию.",
	noticeNoActiveToRename: "Нет активного файла или папки для переименования.",
	noticeReplaceAllSuccess: "Заменено совпадений: {0}.",

	// Commands
	commandCreateFile: "Создать новый файл (любой тип)",
	commandCreateFolder: "Создать новую папку (включая скрытую)",
	commandRenameActive: "Переименовать активный файл или папку",
	commandToggleHidden: "Переключить отображение скрытых файлов и папок",
	commandToggleAllTypes: "Переключить видимость всех типов файлов",
	commandToggleAllowEditDotfiles: "Переключить редактирование скрытых файлов и файлов без расширения",
	commandToggleAllowEditCodeFiles: "Переключить редактирование файлов кода и данных",
	commandToggleLineWrapping: "Переключить перенос строк в редакторе кода",
};
