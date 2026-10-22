import { TranslationSchema } from "./en";

export const it: TranslationSchema = {
	// Ribbon & Toolbars
	ribbonNewFileTooltip: "Nuovo file (qualsiasi tipo)",
	viewToggleCode: "Codice",
	viewToggleRendered: "Anteprima",
	viewToggleTooltip: "Passa dalla visualizzazione codice a quella anteprima",
	saveChanges: "Salva",
	saveChangesTooltip: "Salva modifiche",
	saved: "Salvato",

	// Search & Replace Panel
	searchFindPlaceholder: "Trova...",
	searchFindAriaLabel: "Trova",
	searchToggleReplaceTooltip: "Mostra/nascondi barra di sostituzione",
	searchMatchCase: "Maiuscole/minuscole (Aa)",
	searchWholeWord: "Parola intera (\\b)",
	searchRegex: "Espressione regolare (.*)",
	searchPreviousMatch: "Risultato precedente",
	searchNextMatch: "Risultato successivo",
	searchSelectAll: "Seleziona tutti i risultati",
	searchClose: "Chiudi ricerca (Esc)",
	searchReplacePlaceholder: "Sostituisci con...",
	searchReplaceAriaLabel: "Sostituisci con",
	searchReplace: "Sostituisci",
	searchReplaceAll: "Sostituisci tutto",
	searchCountMatches: "{0} di {1}",
	searchNoResults: "Nessun risultato",
	searchInvalidRegex: "Espressione regolare non valida",

	// Context Menu
	contextNewNoteHere: "Nuova nota qui",
	contextNewFileHere: "Nuovo file qui (qualsiasi tipo)",
	contextNewFile: "Nuovo file (qualsiasi tipo)",
	contextEditInCodeEditor: "Modifica nell'editor di codice",

	// Modals - Create File
	modalCreateFileTitle: "Crea nuovo file",
	modalCreateFilePlaceholder: "es. script.py, .gitignore, src/app.js",
	modalCreateFileEmptyError: "Il nome del file non può essere vuoto.",
	modalCreateFileExistsError: "Un file o una cartella con il nome '{0}' esiste già.",
	modalCreateFilePathInvalidError: "Il percorso non può contenere caratteri non validi (\\ : * ? \" < > |).",
	modalButtonCreate: "Crea",
	modalButtonCancel: "Annulla",

	// Modals - Create Folder
	modalCreateFolderTitle: "Crea nuova cartella",
	modalCreateFolderPlaceholder: "es. .github, assets, src/components",
	modalCreateFolderEmptyError: "Il nome della cartella non può essere vuoto.",
	modalCreateFolderExistsError: "Un file o una cartella con il nome '{0}' esiste già.",

	// Modals - Rename
	modalRenameFileTitle: "Rinomina file",
	modalRenameFolderTitle: "Rinomina cartella",
	modalRenamePlaceholder: "Nuovo nome",
	modalButtonRename: "Rinomina",

	// Modals - Confirm Close Unsaved
	modalUnsavedTitle: "Modifiche non salvate in {0}",
	modalUnsavedMessage: "Vuoi salvare le modifiche prima di chiudere?",
	modalButtonSave: "Salva modifiche",
	modalButtonDiscard: "Ignora",

	// Modals - Confirm Replace All
	modalReplaceAllTitle: "Sostituisci tutte le occorrenze",
	modalReplaceAllMessage: "Sei sicuro di voler sostituire tutte le {0} occorrenze di \"{1}\" con \"{2}\"?",
	modalButtonReplaceAll: "Sostituisci tutto",

	// Callouts
	calloutBinaryTitle: "Formato binario non supportato",
	calloutBinaryDesc: "Questo file ({0}) non può essere aperto nell'editor di codice per evitare corruzioni binarie.",

	// Settings - Language
	settingsLanguageName: "Lingua",
	settingsLanguageDesc: "Scegli la lingua dell'interfaccia per questo plugin.",
	settingsLanguageAuto: "Automatico (come Obsidian)",

	// Settings - File Explorer
	settingsGroupFileExplorer: "Esplora file",
	settingsShowHiddenDotfilesName: "Mostra file e cartelle nascosti",
	settingsShowHiddenDotfilesDesc: "Mostra file e directory i cui nomi iniziano con un punto (es. .gitignore, .env, .github/). Le directory interne come .trash rimarranno nascoste.",
	settingsShowAllFileTypesName: "Mostra tutti i tipi di file",
	settingsShowAllFileTypesDesc: "Visualizza tutti i file del vault in esplora file (codice, JSON, dati e file senza estensione), non solo le note Markdown.",
	settingsPreventAutoOpenName: "Impedisci l'apertura automatica dei file non supportati",
	settingsPreventAutoOpenDesc: "Facendo un singolo clic su file binari o documenti non supportati (.zip, .exe, .docx, .dmg), questi vengono solo selezionati, evitando estrazioni o avvii accidentali di app esterne.",
	settingsOpenOnDoubleClickName: "Apri file non supportati con doppio clic",
	settingsOpenOnDoubleClickDesc: "Consenti l'apertura dei file non supportati con l'applicazione di sistema predefinita tramite doppio clic. Se disattivato, possono essere aperti solo dal menu contestuale.",
	settingsIgnoredPathsName: "File e cartelle ignorati",
	settingsIgnoredPathsDesc: "Nascondi file e cartelle specifici utilizzando schemi in formato .gitignore (una regola per riga). Supporta caratteri jolly (*, **), barre per cartelle (/) e negazioni (!).",
	settingsIgnoredPathsPlaceholder: "Inserisci una regola per riga",
	settingsButtonResetDefault: "Ripristina predefiniti",
	settingsTooltipResetIgnored: "Ripristina i percorsi ignorati all'elenco predefinito",

	// Settings - Code Editor
	settingsGroupCodeEditor: "Editor di codice",
	settingsSecurityWarning: "La visualizzazione dei file nascosti consente di vedere e modificare file di configurazione sensibili (.env, token, credenziali). Prestare attenzione durante la modifica o l'eliminazione dei file.",
	settingsAllowEditDotfilesName: "Consenti la modifica di file nascosti e senza estensione",
	settingsAllowEditDotfilesDesc: "Apri e modifica file con punto (come .gitignore o .env) e file senza estensione (come license o makefile) direttamente nell'editor integrato.",
	settingsAllowEditCodeFilesName: "Consenti la modifica di file di codice e dati",
	settingsAllowEditCodeFilesDesc: "Apri i file corrispondenti all'elenco di estensioni modificabili nell'editor di codice integrato.",
	settingsCustomExtensionsName: "Estensioni di file modificabili",
	settingsCustomExtensionsDesc: "Estensioni di file da aprire nell'editor di codice, separate da virgole, spazi o a capo.",
	settingsCustomExtensionsPlaceholder: "Inserisci estensioni",
	settingsTooltipResetExtensions: "Ripristina le estensioni all'elenco predefinito",
	settingsTabSizeName: "Dimensione rientro tabulazione",
	settingsTabSizeDesc: "Numero di spazi per tabulazione. Imposta 'Eredita da Obsidian' per seguire le impostazioni principali.",
	settingsTabSizeAuto: "Eredita da Obsidian",
	settingsIndentWithName: "Rientra con tabulazioni",
	settingsIndentWithDesc: "Determina se inserire tabulazioni o spazi per il rientro.",
	settingsIndentWithAuto: "Eredita da Obsidian",
	settingsIndentWithTabs: "Tabulazioni",
	settingsIndentWithSpaces: "Spazi",
	settingsDisableAutoSaveName: "Disattiva salvataggio automatico",
	settingsDisableAutoSaveDesc: "Richiede di premere la scorciatoia di salvataggio o il pulsante di salvataggio prima di scrivere le modifiche su disco. Nota: all'uscita da Obsidian le modifiche non salvate verranno salvate automaticamente.",
	settingsAutoSaveWarning: "Attenzione: il salvataggio automatico scrive immediatamente le modifiche su disco, aumentando il rischio di danneggiare accidentalmente file di codice importanti.",
	settingsResetAllName: "Ripristina tutte le impostazioni",
	settingsResetAllDesc: "Ripristina tutte le impostazioni del plugin e le estensioni ai valori predefiniti.",
	settingsButtonResetAll: "Ripristina tutto",
	settingsTooltipResetAll: "Ripristina tutte le impostazioni predefinite",

	// Notices
	noticeCreated: "Creato {0}",
	noticeSaved: "Salvato {0}",
	noticeHiddenFilesVisible: "I file e le cartelle nascosti sono ora visibili.",
	noticeHiddenFilesHidden: "I file e le cartelle nascosti sono ora nascosti.",
	noticeAllFilesVisible: "Tutti i tipi di file sono ora visibili.",
	noticeAllFilesHidden: "Tutti i tipi di file sono ora nascosti.",
	noticeDotfileEditingEnabled: "La modifica dei file nascosti e senza estensione è ora abilitata.",
	noticeDotfileEditingDisabled: "La modifica dei file nascosti e senza estensione è ora disabilitata.",
	noticeCodeEditingEnabled: "La modifica dei file di codice e dati è ora abilitata.",
	noticeCodeEditingDisabled: "La modifica dei file di codice e dati è ora disabilitata.",
	noticeAutoSaveDisabled: "Il salvataggio automatico dei file di codice è disabilitato.",
	noticeAutoSaveEnabled: "Il salvataggio automatico dei file di codice è abilitato.",
	noticeExtensionsReset: "Le estensioni dei file sono state ripristinate ai valori predefiniti.",
	noticeIgnoredPathsReset: "I percorsi ignorati sono stati ripristinati ai valori predefiniti.",
	noticeAllSettingsReset: "Tutte le impostazioni sono state ripristinate ai valori predefiniti.",
	noticeNoActiveToRename: "Nessun file o cartella attivo da rinominare.",
	noticeReplaceAllSuccess: "Sostituite {0} occorrenze.",

	// Commands
	commandCreateFile: "Crea nuovo file (qualsiasi tipo)",
	commandCreateFolder: "Crea nuova cartella (incluse cartelle con punto)",
	commandRenameActive: "Rinomina file o cartella attivo",
	commandToggleHidden: "Attiva/disattiva visibilità file e cartelle nascosti",
	commandToggleAllTypes: "Attiva/disattiva visibilità di tutti i tipi di file",
	commandToggleAllowEditDotfiles: "Attiva/disattiva modifica file nascosti e senza estensione",
	commandToggleAllowEditCodeFiles: "Attiva/disattiva modifica file di codice e dati",
};
