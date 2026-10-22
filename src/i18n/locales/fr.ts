import { TranslationSchema } from "./en";

export const fr: TranslationSchema = {
	// Ribbon & Toolbars
	ribbonNewFileTooltip: "Nouveau fichier (tout type)",
	viewToggleCode: "Code",
	viewToggleRendered: "Aperçu",
	viewToggleTooltip: "Basculer entre la vue code et la vue aperçu",
	editorLineWrapToggle: "Activer/désactiver le retour à la ligne",
	saveChanges: "Enregistrer",
	saveChangesTooltip: "Enregistrer les modifications",
	saved: "Enregistré",

	// Search & Replace Panel
	searchFindPlaceholder: "Rechercher...",
	searchFindAriaLabel: "Rechercher",
	searchToggleReplaceTooltip: "Afficher/masquer le remplacement",
	searchMatchCase: "Respecter la casse (Aa)",
	searchWholeWord: "Mot entier (\\b)",
	searchRegex: "Expression régulière (.*)",
	searchPreviousMatch: "Occurrence précédente",
	searchNextMatch: "Occurrence suivante",
	searchSelectAll: "Sélectionner toutes les occurrences",
	searchReplacePlaceholder: "Remplacer par...",
	searchReplaceAriaLabel: "Remplacer par",
	searchReplace: "Remplacer",
	searchReplaceAll: "Tout remplacer",
	searchCountMatches: "{0} sur {1}",
	searchNoResults: "Aucun résultat",
	searchInvalidRegex: "Expression régulière invalide",

	// Context Menu
	contextNewNoteHere: "Nouvelle note ici",
	contextNewFileHere: "Nouveau fichier ici (tout type)",
	contextNewFolderHere: "Nouveau dossier ici",
	contextNewFile: "Nouveau fichier (tout type)",
	contextEditInCodeEditor: "Modifier dans l'éditeur de code",

	// Modals - Create File
	modalCreateFileTitle: "Créer un nouveau fichier",
	modalCreateFilePlaceholder: "ex. script.py, .gitignore, src/app.js",
	modalCreateFileEmptyError: "Le nom du fichier ne peut pas être vide.",
	modalCreateFileExistsError: "Un fichier ou dossier nommé '{0}' existe déjà.",
	modalCreateFilePathInvalidError: "Le chemin ne peut pas contenir de caractères non valides (\\ : * ? \" < > |).",
	modalButtonCreate: "Créer",
	modalButtonCancel: "Annuler",

	// Modals - Rename
	modalRenameFileTitle: "Renommer le fichier",
	modalRenameFolderTitle: "Renommer le dossier",
	modalRenamePlaceholder: "Nouveau nom",
	modalButtonRename: "Renommer",

	// Modals - Confirm Close Unsaved
	modalUnsavedTitle: "Modifications non enregistrées dans {0}",
	modalUnsavedMessage: "Voulez-vous enregistrer les modifications avant de fermer ?",
	modalButtonSave: "Enregistrer les modifications",
	modalButtonDiscard: "Ignorer",

	// Modals - Confirm Replace All
	modalReplaceAllTitle: "Remplacer toutes les occurrences",
	modalReplaceAllMessage: "Voulez-vous vraiment remplacer les {0} occurrences de « {1} » par « {2} » ?",
	modalButtonReplaceAll: "Tout remplacer",

	// Callouts
	calloutBinaryTitle: "Format binaire non pris en charge",
	calloutBinaryDesc: "Ce fichier ({0}) ne peut pas être ouvert dans l'éditeur de code afin d'éviter toute corruption binaire.",

	// Settings - Language
	settingsLanguageName: "Langue",
	settingsLanguageDesc: "Choisissez la langue d'affichage de ce plugin.",
	settingsLanguageAuto: "Automatique (selon Obsidian)",

	// Settings - File Explorer
	settingsGroupFileExplorer: "Explorateur de fichiers",
	settingsShowHiddenDotfilesName: "Afficher les fichiers et dossiers masqués",
	settingsShowHiddenDotfilesDesc: "Afficher les fichiers et dossiers commençant par un point (ex. .gitignore, .env, .github/). Les dossiers système internes tels que .trash restent masqués.",
	settingsShowAllFileTypesName: "Afficher tous les types de fichiers",
	settingsShowAllFileTypesDesc: "Afficher tous les fichiers du coffre dans l'explorateur (fichiers de code, JSON, données et sans extension), et pas seulement les notes Markdown.",
	settingsPreventAutoOpenName: "Empêcher l'ouverture automatique des fichiers non pris en charge",
	settingsPreventAutoOpenDesc: "Un simple clic sur des fichiers binaires ou documents non pris en charge (.zip, .exe, .docx, .dmg) les sélectionne uniquement, évitant ainsi toute décompression accidentelle ou lancement d'application externe.",
	settingsOpenOnDoubleClickName: "Ouvrir les fichiers non pris en charge par double-clic",
	settingsOpenOnDoubleClickDesc: "Autoriser l'ouverture des fichiers non pris en charge avec l'application par défaut du système lors d'un double-clic. Si désactivé, l'ouverture externe ne se fait que via le menu contextuel.",
	settingsIgnoredPathsName: "Fichiers et dossiers ignorés",
	settingsIgnoredPathsDesc: "Masquer des fichiers et dossiers spécifiques en utilisant des motifs au format .gitignore (une règle par ligne). Prend en charge les jokers (*, **), les barres obliques de dossier (/) et les négations (!).",
	settingsIgnoredPathsPlaceholder: "Entrez un motif par ligne",
	settingsButtonResetDefault: "Rétablir par défaut",
	settingsTooltipResetIgnored: "Rétablir les chemins ignorés à la liste par défaut",

	// Settings - Code Editor
	settingsGroupCodeEditor: "Éditeur de code",
	settingsSecurityWarning: "L'affichage des fichiers masqués permet de visualiser et modifier des fichiers de configuration sensibles (.env, jetons, identifiants). Soyez prudent lorsque vous modifiez ou supprimez des fichiers.",
	settingsAllowEditDotfilesName: "Autoriser la modification des fichiers masqués et sans extension",
	settingsAllowEditDotfilesDesc: "Ouvrir et modifier les fichiers commençant par un point (comme .gitignore ou .env) et les fichiers sans extension (comme license ou makefile) directement dans l'éditeur intégré.",
	settingsAllowEditCodeFilesName: "Autoriser la modification des fichiers de code et de données",
	settingsAllowEditCodeFilesDesc: "Ouvrir les fichiers correspondant à la liste d'extensions éditables ci-dessous dans l'éditeur de code intégré.",
	settingsCustomExtensionsName: "Extensions de fichiers modifiables",
	settingsCustomExtensionsDesc: "Extensions de fichiers à ouvrir dans l'éditeur de code, séparées par des virgules, des espaces ou des sauts de ligne.",
	settingsCustomExtensionsPlaceholder: "Entrez les extensions",
	settingsTooltipResetExtensions: "Rétablir les extensions à la liste par défaut",
	settingsTabSizeName: "Largeur d'indentation des tabulations",
	settingsTabSizeDesc: "Le nombre d'espaces équivalent à une tabulation. Choisissez 'Hériter d'Obsidian' pour suivre les paramètres généraux.",
	settingsTabSizeAuto: "Hériter d'Obsidian",
	settingsIndentWithName: "Indenter avec des tabulations",
	settingsIndentWithDesc: "Insérer des tabulations ou des espaces lors de l'indentation.",
	settingsIndentWithAuto: "Hériter d'Obsidian",
	settingsIndentWithTabs: "Tabulations",
	settingsIndentWithSpaces: "Espaces",
	settingsLineWrappingName: "Retour à la ligne",
	settingsLineWrappingDesc: "Ajuster les longues lignes à la largeur de l'éditeur.",
	settingsDisableAutoSaveName: "Désactiver l'enregistrement automatique",
	settingsDisableAutoSaveDesc: "Nécessite d'appuyer sur le raccourci d'enregistrement ou de cliquer sur le bouton avant d'écrire les modifications sur le disque. Remarque : à la fermeture d'Obsidian, les modifications non enregistrées sont automatiquement sauvegardées.",
	settingsAutoSaveWarning: "Avertissement : l'enregistrement automatique écrit immédiatement les modifications sur le disque, ce qui peut augmenter le risque d'endommager accidentellement des fichiers de code sensibles.",
	settingsResetAllName: "Réinitialiser tous les paramètres",
	settingsResetAllDesc: "Restaurer tous les paramètres du plugin et extensions à leurs valeurs par défaut.",
	settingsButtonResetAll: "Tout réinitialiser",
	settingsTooltipResetAll: "Rétablir tous les paramètres par défaut",

	// Notices
	noticeCreated: "Créé {0}",
	noticeSaved: "Enregistré {0}",
	noticeHiddenFilesVisible: "Les fichiers et dossiers masqués sont maintenant visibles.",
	noticeHiddenFilesHidden: "Les fichiers et dossiers masqués sont maintenant masqués.",
	noticeAllFilesVisible: "Tous les types de fichiers sont maintenant visibles.",
	noticeAllFilesHidden: "Tous les types de fichiers sont maintenant masqués.",
	noticeDotfileEditingEnabled: "La modification des fichiers masqués et sans extension est activée.",
	noticeDotfileEditingDisabled: "La modification des fichiers masqués et sans extension est désactivée.",
	noticeCodeEditingEnabled: "La modification des fichiers de code et de données est activée.",
	noticeCodeEditingDisabled: "La modification des fichiers de code et de données est désactivée.",
	noticeAutoSaveDisabled: "L'enregistrement automatique des fichiers de code est désactivé.",
	noticeAutoSaveEnabled: "L'enregistrement automatique des fichiers de code est activé.",
	noticeExtensionsReset: "Les extensions ont été réinitialisées par défaut.",
	noticeIgnoredPathsReset: "Les chemins ignorés ont été réinitialisés par défaut.",
	noticeAllSettingsReset: "Tous les paramètres ont été réinitialisés par défaut.",
	noticeNoActiveToRename: "Aucun fichier ou dossier actif à renommer.",
	noticeReplaceAllSuccess: "{0} occurrences ont été remplacées.",

	// Commands
	commandCreateFile: "Créer un nouveau fichier (tout type)",
	commandCreateFolder: "Créer un nouveau dossier (y compris dossier masqué)",
	commandRenameActive: "Renommer le fichier ou dossier actif",
	commandToggleHidden: "Basculer l'affichage des fichiers et dossiers masqués",
	commandToggleAllTypes: "Basculer l'affichage de tous les types de fichiers",
	commandToggleAllowEditDotfiles: "Basculer la modification des fichiers masqués et sans extension",
	commandToggleAllowEditCodeFiles: "Basculer la modification des fichiers de code et de données",
	commandToggleLineWrapping: "Activer/désactiver le retour à la ligne dans l'éditeur de code",
};
