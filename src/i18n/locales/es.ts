import { TranslationSchema } from "./en";

export const es: TranslationSchema = {
	// Ribbon & Toolbars
	ribbonNewFileTooltip: "Nuevo archivo (cualquier tipo)",
	viewToggleCode: "Código",
	viewToggleRendered: "Vista previa",
	viewToggleTooltip: "Alternar entre vista de código y vista previa",
	editorLineWrapToggle: "Alternar ajuste de línea",
	saveChanges: "Guardar",
	saveChangesTooltip: "Guardar cambios",
	saved: "Guardado",

	// Search & Replace Panel
	searchFindPlaceholder: "Buscar...",
	searchFindAriaLabel: "Buscar",
	searchToggleReplaceTooltip: "Alternar barra de reemplazo",
	searchMatchCase: "Coincidir mayúsculas/minúsculas (Aa)",
	searchWholeWord: "Palabra completa (\\b)",
	searchRegex: "Expresión regular (.*)",
	searchPreviousMatch: "Coincidencia anterior",
	searchNextMatch: "Coincidencia siguiente",
	searchSelectAll: "Seleccionar todas las coincidencias",
	searchReplacePlaceholder: "Reemplazar con...",
	searchReplaceAriaLabel: "Reemplazar con",
	searchReplace: "Reemplazar",
	searchReplaceAll: "Reemplazar todo",
	searchCountMatches: "{0} de {1}",
	searchNoResults: "Sin resultados",
	searchInvalidRegex: "Expresión regular no válida",

	// Context Menu
	contextNewNoteHere: "Nueva nota aquí",
	contextNewFileHere: "Nuevo archivo aquí (cualquier tipo)",
	contextNewFolderHere: "Nueva carpeta aquí",
	contextNewFile: "Nuevo archivo (cualquier tipo)",
	contextEditInCodeEditor: "Editar en editor de código",

	// Modals - Create File
	modalCreateFileTitle: "Crear nuevo archivo",
	modalCreateFilePlaceholder: "p. ej., script.py, .gitignore, src/app.js",
	modalCreateFileEmptyError: "El nombre del archivo no puede estar vacío.",
	modalCreateFileExistsError: "Ya existe un archivo o carpeta llamado '{0}'.",
	modalCreateFilePathInvalidError: "La ruta no puede contener caracteres no válidos (\\ : * ? \" < > |).",
	modalButtonCreate: "Crear",
	modalButtonCancel: "Cancelar",

	// Modals - Create Folder
	modalCreateFolderTitle: "Crear nueva carpeta",
	modalCreateFolderPlaceholder: "p. ej., .github, assets, src/components",
	modalCreateFolderEmptyError: "El nombre de la carpeta no puede estar vacío.",
	modalCreateFolderExistsError: "Ya existe un archivo o carpeta llamado '{0}'.",

	// Modals - Rename
	modalRenameFileTitle: "Renombrar archivo",
	modalRenameFolderTitle: "Renombrar carpeta",
	modalRenamePlaceholder: "Nuevo nombre",
	modalButtonRename: "Renombrar",

	// Modals - Confirm Close Unsaved
	modalUnsavedTitle: "Cambios sin guardar en {0}",
	modalUnsavedMessage: "¿Desea guardar los cambios antes de cerrar?",
	modalButtonSave: "Guardar cambios",
	modalButtonDiscard: "Descartar",

	// Modals - Confirm Replace All
	modalReplaceAllTitle: "Reemplazar todas las coincidencias",
	modalReplaceAllMessage: "¿Seguro que quieres reemplazar las {0} coincidencias de «{1}» por «{2}»?",
	modalButtonReplaceAll: "Reemplazar todo",

	// Callouts
	calloutBinaryTitle: "Formato binario no compatible",
	calloutBinaryDesc: "Este archivo ({0}) no se puede abrir en el editor de código para protegerlo de posibles corrupciones binarias.",

	// Settings - Language
	settingsLanguageName: "Idioma",
	settingsLanguageDesc: "Elija el idioma de la interfaz para este plugin.",
	settingsLanguageAuto: "Automático (según Obsidian)",

	// Settings - File Explorer
	settingsGroupFileExplorer: "Explorador de archivos",
	settingsShowHiddenDotfilesName: "Mostrar archivos y carpetas ocultos",
	settingsShowHiddenDotfilesDesc: "Mostrar archivos y directorios cuyos nombres comiencen con un punto (p. ej., .gitignore, .env, .github/). Los directorios internos como .trash permanecerán ocultos.",
	settingsShowAllFileTypesName: "Mostrar todos los tipos de archivo",
	settingsShowAllFileTypesDesc: "Mostrar todos los archivos de la bóveda en el explorador (código, JSON, datos y sin extensión), no solo notas Markdown.",
	settingsPreventAutoOpenName: "Evitar apertura automática de archivos no compatibles",
	settingsPreventAutoOpenDesc: "Al hacer un solo clic en archivos binarios o documentos no compatibles (.zip, .exe, .docx, .dmg), solo se seleccionarán, evitando descompresiones accidentales o aperturas de programas externos.",
	settingsOpenOnDoubleClickName: "Abrir archivos no compatibles con doble clic",
	settingsOpenOnDoubleClickDesc: "Permitir abrir archivos no compatibles con la aplicación predeterminada del sistema mediante doble clic. Si está desactivado, solo podrán abrirse desde el menú contextual.",
	settingsIgnoredPathsName: "Archivos y carpetas ignorados",
	settingsIgnoredPathsDesc: "Ocultar archivos y carpetas usando patrones de formato .gitignore (una regla por línea). Admite comodines (*, **), barras para carpetas (/) y negaciones (!).",
	settingsIgnoredPathsPlaceholder: "Introduzca una regla por línea",
	settingsButtonResetDefault: "Restablecer por defecto",
	settingsTooltipResetIgnored: "Restablecer rutas ignoradas a la lista por defecto",

	// Settings - Code Editor
	settingsGroupCodeEditor: "Editor de código",
	settingsSecurityWarning: "Mostrar archivos ocultos permite ver y editar archivos de configuración confidenciales (p. ej., .env, credenciales, claves). Tenga cuidado al modificar o eliminar archivos.",
	settingsAllowEditDotfilesName: "Permitir editar archivos ocultos y sin extensión",
	settingsAllowEditDotfilesDesc: "Abrir y editar archivos con punto (como .gitignore o .env) y archivos sin extensión (como license o makefile) directamente en el editor integrado.",
	settingsAllowEditCodeFilesName: "Permitir editar archivos de código y datos",
	settingsAllowEditCodeFilesDesc: "Abrir archivos que coincidan con la lista de extensiones editables en el editor de código integrado.",
	settingsCustomExtensionsName: "Extensiones de archivo editables",
	settingsCustomExtensionsDesc: "Extensiones de archivo para abrir en el editor de código, separadas por comas, espacios o saltos de línea.",
	settingsCustomExtensionsPlaceholder: "Introducir extensiones",
	settingsTooltipResetExtensions: "Restablecer extensiones a la lista por defecto",
	settingsTabSizeName: "Tamaño de sangría de tabulación",
	settingsTabSizeDesc: "El número de espacios que equivale a una tabulación. Establezca 'Heredar de Obsidian' para seguir la configuración principal.",
	settingsTabSizeAuto: "Heredar de Obsidian",
	settingsIndentWithName: "Sangrar con tabulaciones",
	settingsIndentWithDesc: "Indica si se deben insertar tabulaciones o espacios al sangrar.",
	settingsIndentWithAuto: "Heredar de Obsidian",
	settingsIndentWithTabs: "Tabulaciones",
	settingsIndentWithSpaces: "Espacios",
	settingsLineWrappingName: "Ajuste de línea",
	settingsLineWrappingDesc: "Ajustar líneas largas a la ventana del editor.",
	settingsDisableAutoSaveName: "Desactivar guardado automático",
	settingsDisableAutoSaveDesc: "Requiere pulsar el atajo de guardado o el botón de guardar antes de escribir cambios en el disco. Limitación: si cierra Obsidian, los cambios no guardados se guardarán automáticamente.",
	settingsAutoSaveWarning: "Advertencia: El guardado automático escribe inmediatamente los cambios en el disco, lo que puede aumentar el riesgo de dañar accidentalmente archivos de código sensibles.",
	settingsResetAllName: "Restablecer todos los ajustes",
	settingsResetAllDesc: "Restaurar todos los ajustes del plugin y extensiones a sus valores predeterminados.",
	settingsButtonResetAll: "Restablecer todo",
	settingsTooltipResetAll: "Restablecer todos los ajustes por defecto",

	// Notices
	noticeCreated: "Creado {0}",
	noticeSaved: "Guardado {0}",
	noticeHiddenFilesVisible: "Los archivos y carpetas ocultos ahora son visibles.",
	noticeHiddenFilesHidden: "Los archivos y carpetas ocultos ahora están ocultos.",
	noticeAllFilesVisible: "Todos los tipos de archivo ahora son visibles.",
	noticeAllFilesHidden: "Todos los tipos de archivo ahora están ocultos.",
	noticeDotfileEditingEnabled: "La edición de archivos ocultos y sin extensión está activada.",
	noticeDotfileEditingDisabled: "La edición de archivos ocultos y sin extensión está desactivada.",
	noticeCodeEditingEnabled: "La edición de archivos de código y datos está activada.",
	noticeCodeEditingDisabled: "La edición de archivos de código y datos está desactivada.",
	noticeAutoSaveDisabled: "El guardado automático para archivos de código está desactivado.",
	noticeAutoSaveEnabled: "El guardado automático para archivos de código está activado.",
	noticeExtensionsReset: "Extensiones de archivo restablecidas por defecto.",
	noticeIgnoredPathsReset: "Rutas ignoradas restablecidas por defecto.",
	noticeAllSettingsReset: "Todos los ajustes han sido restablecidos por defecto.",
	noticeNoActiveToRename: "No hay ningún archivo o carpeta activo para renombrar.",
	noticeReplaceAllSuccess: "Se han reemplazado {0} coincidencias.",

	// Commands
	commandCreateFile: "Crear nuevo archivo (cualquier tipo)",
	commandCreateFolder: "Crear nueva carpeta (incluye carpetas con punto)",
	commandRenameActive: "Renombrar archivo o carpeta activo",
	commandToggleHidden: "Alternar visibilidad de archivos y carpetas ocultos",
	commandToggleAllTypes: "Alternar visibilidad de todos los tipos de archivo",
	commandToggleAllowEditDotfiles: "Alternar edición de archivos ocultos y sin extensión",
	commandToggleAllowEditCodeFiles: "Alternar edición de archivos de código y datos",
	commandToggleLineWrapping: "Alternar ajuste de línea en el editor de código",
};
