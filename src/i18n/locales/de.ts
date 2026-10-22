import { TranslationSchema } from "./en";

export const de: TranslationSchema = {
	// Ribbon & Toolbars
	ribbonNewFileTooltip: "Neue Datei (beliebiger Typ)",
	viewToggleCode: "Code",
	viewToggleRendered: "Vorschau",
	viewToggleTooltip: "Zwischen Code- und Vorschauansicht wechseln",
	saveChanges: "Speichern",
	saveChangesTooltip: "Änderungen speichern",
	saved: "Gespeichert",

	// Search & Replace Panel
	searchFindPlaceholder: "Suchen...",
	searchFindAriaLabel: "Suchen",
	searchToggleReplaceTooltip: "Ersetzen-Leiste umschalten",
	searchMatchCase: "Groß-/Kleinschreibung beachten (Aa)",
	searchWholeWord: "Ganzes Wort (\\b)",
	searchRegex: "Regulären Ausdruck verwenden (.*)",
	searchPreviousMatch: "Vorheriger Treffer",
	searchNextMatch: "Nächster Treffer",
	searchSelectAll: "Alle Treffer auswählen",
	searchClose: "Suche schließen (Esc)",
	searchReplacePlaceholder: "Ersetzen durch...",
	searchReplaceAriaLabel: "Ersetzen durch",
	searchReplace: "Ersetzen",
	searchReplaceAll: "Alle ersetzen",
	searchCountMatches: "{0} von {1}",
	searchNoResults: "Keine Treffer",
	searchInvalidRegex: "Ungültiger regulärer Ausdruck",

	// Context Menu
	contextNewNoteHere: "Neue Notiz hier",
	contextNewFileHere: "Neue Datei hier (beliebiger Typ)",
	contextNewFile: "Neue Datei (beliebiger Typ)",
	contextEditInCodeEditor: "Im Code-Editor bearbeiten",

	// Modals - Create File
	modalCreateFileTitle: "Neue Datei erstellen",
	modalCreateFilePlaceholder: "z. B. script.py, .gitignore, src/app.js",
	modalCreateFileEmptyError: "Dateiname darf nicht leer sein.",
	modalCreateFileExistsError: "Eine Datei oder ein Ordner mit dem Namen '{0}' existiert bereits.",
	modalCreateFilePathInvalidError: "Der Pfad darf keine ungültigen Zeichen enthalten (\\ : * ? \" < > |).",
	modalButtonCreate: "Erstellen",
	modalButtonCancel: "Abbrechen",

	// Modals - Create Folder
	modalCreateFolderTitle: "Neuen Ordner erstellen",
	modalCreateFolderPlaceholder: "z. B. .github, assets, src/components",
	modalCreateFolderEmptyError: "Ordnername darf nicht leer sein.",
	modalCreateFolderExistsError: "Eine Datei oder ein Ordner mit dem Namen '{0}' existiert bereits.",

	// Modals - Rename
	modalRenameFileTitle: "Datei umbenennen",
	modalRenameFolderTitle: "Ordner umbenennen",
	modalRenamePlaceholder: "Neuer Name",
	modalButtonRename: "Umbenennen",

	// Modals - Confirm Close Unsaved
	modalUnsavedTitle: "Ungespeicherte Änderungen in {0}",
	modalUnsavedMessage: "Möchten Sie Ihre Änderungen vor dem Schließen speichern?",
	modalButtonSave: "Änderungen speichern",
	modalButtonDiscard: "Verwerfen",

	// Modals - Confirm Replace All
	modalReplaceAllTitle: "Alle Vorkommen ersetzen",
	modalReplaceAllMessage: "Möchten Sie wirklich alle {0} Vorkommen von „{1}“ durch „{2}“ ersetzen?",
	modalButtonReplaceAll: "Alle ersetzen",

	// Callouts
	calloutBinaryTitle: "Nicht unterstütztes Binärformat",
	calloutBinaryDesc: "Diese Datei ({0}) kann nicht im Code-Editor geöffnet werden, um eine Beschädigung der Binärdaten zu verhindern.",

	// Settings - Language
	settingsLanguageName: "Sprache",
	settingsLanguageDesc: "Wählen Sie die Anzeigesprache für dieses Plugin.",
	settingsLanguageAuto: "Automatisch (wie Obsidian)",

	// Settings - File Explorer
	settingsGroupFileExplorer: "Dateiexplorer",
	settingsShowHiddenDotfilesName: "Versteckte Dateien und Ordner anzeigen",
	settingsShowHiddenDotfilesDesc: "Dateien und Verzeichnisse anzeigen, deren Name mit einem Punkt beginnt (z. B. .gitignore, .env, .github/). Interne Systemordner wie .trash bleiben sicher ausgeblendet.",
	settingsShowAllFileTypesName: "Alle Dateitypen anzeigen",
	settingsShowAllFileTypesDesc: "Alle Dateien im Tresor im Dateiexplorer anzeigen (z. B. Code-, JSON-, Daten- und dateiendungslose Dateien), nicht nur Markdown-Notizen.",
	settingsPreventAutoOpenName: "Automatisches Öffnen nicht unterstützter Dateien verhindern",
	settingsPreventAutoOpenDesc: "Ein einfacher Klick auf nicht unterstützte Binär- oder Dokumentdateien (.zip, .exe, .docx, .dmg) wählt diese nur aus, um ein versehentliches Entpacken oder Starten externer Programme zu verhindern.",
	settingsOpenOnDoubleClickName: "Nicht unterstützte Dateien per Doppelklick öffnen",
	settingsOpenOnDoubleClickDesc: "Erlaubt das Öffnen nicht unterstützter Dateien mit der Standardanwendung des Systems per Doppelklick. Wenn deaktiviert, können sie nur über das Kontextmenü geöffnet werden.",
	settingsIgnoredPathsName: "Ignorierte Dateien und Ordner",
	settingsIgnoredPathsDesc: "Bestimmte Dateien und Ordner mithilfe von .gitignore-Mustern ausblenden (eine Regel pro Zeile). Unterstützt Platzhalter (*, **), Ordner-Schrägstriche (/) und Negationen (!).",
	settingsIgnoredPathsPlaceholder: "Ein Muster pro Zeile eingeben",
	settingsButtonResetDefault: "Auf Standard zurücksetzen",
	settingsTooltipResetIgnored: "Ignorierte Pfade auf Standardliste zurücksetzen",

	// Settings - Code Editor
	settingsGroupCodeEditor: "Code-Editor",
	settingsSecurityWarning: "Das Einblenden versteckter Dateien ermöglicht das Anzeigen und Bearbeiten sensibler Konfigurationsdateien (.env, Tokens, Anmeldedaten). Seien Sie vorsichtig beim Bearbeiten oder Löschen von Dateien.",
	settingsAllowEditDotfilesName: "Bearbeiten von Dotfiles und Dateien ohne Endung erlauben",
	settingsAllowEditDotfilesDesc: "Dotfiles (wie .gitignore oder .env) und Dateien ohne Endung (wie license oder makefile) direkt im integrierten Editor öffnen und bearbeiten.",
	settingsAllowEditCodeFilesName: "Bearbeiten von Code- und Datendateien erlauben",
	settingsAllowEditCodeFilesDesc: "Dateien öffnen, deren Endung mit der unten stehenden Liste übereinstimmt, im integrierten Code-Editor.",
	settingsCustomExtensionsName: "Bearbeitbare Dateiendungen",
	settingsCustomExtensionsDesc: "Im Code-Editor zu öffnende Dateiendungen, getrennt durch Kommas, Leerzeichen oder Zeilenumbrüche.",
	settingsCustomExtensionsPlaceholder: "Dateiendungen eingeben",
	settingsTooltipResetExtensions: "Dateiendungen auf Standardliste zurücksetzen",
	settingsDisableAutoSaveName: "Automatisches Speichern deaktivieren",
	settingsDisableAutoSaveDesc: "Erfordert das Drücken des Tastaturkürzels oder das Klicken auf die Schaltfläche vor dem Speichern auf Festplatte. Hinweis: Beim Schließen von Obsidian werden ungespeicherte Änderungen automatisch gespeichert.",
	settingsAutoSaveWarning: "Warnung: Durch das automatische Speichern werden Änderungen sofort geschrieben, was das Risiko einer versehentlichen Beschädigung sensibler Codedateien erhöhen kann.",
	settingsResetAllName: "Alle Einstellungen zurücksetzen",
	settingsResetAllDesc: "Alle Plugin-Einstellungen und Dateiendungen auf die Standardwerte zurücksetzen.",
	settingsButtonResetAll: "Alles zurücksetzen",
	settingsTooltipResetAll: "Alle Einstellungen auf Standard zurücksetzen",

	// Notices
	noticeCreated: "{0} erstellt",
	noticeSaved: "{0} gespeichert",
	noticeHiddenFilesVisible: "Versteckte Dateien und Ordner sind jetzt sichtbar.",
	noticeHiddenFilesHidden: "Versteckte Dateien und Ordner sind jetzt ausgeblendet.",
	noticeAllFilesVisible: "Alle Dateitypen sind jetzt sichtbar.",
	noticeAllFilesHidden: "Alle Dateitypen sind jetzt ausgeblendet.",
	noticeDotfileEditingEnabled: "Bearbeitung von Dotfiles und dateiendungslosen Dateien ist jetzt aktiviert.",
	noticeDotfileEditingDisabled: "Bearbeitung von Dotfiles und dateiendungslosen Dateien ist jetzt deaktiviert.",
	noticeCodeEditingEnabled: "Bearbeitung von Code- und Datendateien ist jetzt aktiviert.",
	noticeCodeEditingDisabled: "Bearbeitung von Code- und Datendateien ist jetzt deaktiviert.",
	noticeAutoSaveDisabled: "Automatisches Speichern für Codedateien ist jetzt deaktiviert.",
	noticeAutoSaveEnabled: "Automatisches Speichern für Codedateien ist jetzt aktiviert.",
	noticeExtensionsReset: "Dateiendungen auf Standard zurückgesetzt.",
	noticeIgnoredPathsReset: "Ignorierte Pfade auf Standard zurückgesetzt.",
	noticeAllSettingsReset: "Alle Einstellungen wurden auf Standard zurückgesetzt.",
	noticeNoActiveToRename: "Keine aktive Datei oder Ordner zum Umbenennen vorhanden.",
	noticeReplaceAllSuccess: "{0} Vorkommen wurden ersetzt.",

	// Commands
	commandCreateFile: "Neue Datei erstellen (beliebiger Typ)",
	commandCreateFolder: "Neuen Ordner erstellen (einschließlich Dotfolder)",
	commandRenameActive: "Aktive Datei oder Ordner umbenennen",
	commandToggleHidden: "Versteckte Dateien und Ordner umschalten",
	commandToggleAllTypes: "Sichtbarkeit aller Dateitypen umschalten",
	commandToggleAllowEditDotfiles: "Bearbeitung von Dotfiles und dateiendungslosen Dateien umschalten",
	commandToggleAllowEditCodeFiles: "Bearbeitung von Code- und Datendateien umschalten",
};
