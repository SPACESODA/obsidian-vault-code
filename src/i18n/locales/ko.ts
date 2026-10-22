import { TranslationSchema } from "./en";

export const ko: TranslationSchema = {
	// Ribbon & Toolbars
	ribbonNewFileTooltip: "새 파일 (모든 형식)",
	viewToggleCode: "코드",
	viewToggleRendered: "미리보기",
	viewToggleTooltip: "코드 및 미리보기 보기 전환",
	editorLineWrapToggle: "자동 줄 바꿈 전환",
	saveChanges: "저장",
	saveChangesTooltip: "변경 사항 저장",
	saved: "저장됨",

	// Search & Replace Panel
	searchFindPlaceholder: "찾기...",
	searchFindAriaLabel: "찾기",
	searchToggleReplaceTooltip: "바꾸기 표시 전환",
	searchMatchCase: "대소문자 구분 (Aa)",
	searchWholeWord: "단어 단위로 일치 (\\b)",
	searchRegex: "정규식 사용 (.*)",
	searchPreviousMatch: "이전 일치 항목",
	searchNextMatch: "다음 일치 항목",
	searchSelectAll: "모든 일치 항목 선택",
	searchReplacePlaceholder: "바꿀 내용...",
	searchReplaceAriaLabel: "바꿀 내용",
	searchReplace: "바꾸기",
	searchReplaceAll: "모두 바꾸기",
	searchCountMatches: "{0} / {1}",
	searchNoResults: "결과 없음",
	searchInvalidRegex: "잘못된 정규식",

	// Context Menu
	contextNewNoteHere: "여기에 새 노트 만들기",
	contextNewFileHere: "여기에 새 파일 만들기 (모든 형식)",
	contextNewFolderHere: "여기에 새 폴더 만들기",
	contextNewFile: "새 파일 만들기 (모든 형식)",
	contextEditInCodeEditor: "코드 편집기에서 편집",

	// Modals - Create File
	modalCreateFileTitle: "새 파일 만들기",
	modalCreateFilePlaceholder: "예: script.py, .gitignore, src/app.js",
	modalCreateFileEmptyError: "파일 이름을 입력하세요.",
	modalCreateFileExistsError: "'{0}' 파일 또는 폴더가 이미 존재합니다.",
	modalCreateFilePathInvalidError: "경로에 사용할 수 없는 문자(\\ : * ? \" < > |)가 포함되어 있습니다.",
	modalButtonCreate: "만들기",
	modalButtonCancel: "취소",

	// Modals - Rename
	modalRenameFileTitle: "파일 이름 바꾸기",
	modalRenameFolderTitle: "폴더 이름 바꾸기",
	modalRenamePlaceholder: "새 이름",
	modalButtonRename: "이름 바꾸기",

	// Modals - Confirm Close Unsaved
	modalUnsavedTitle: "'{0}' 파일의 저장되지 않은 변경 사항",
	modalUnsavedMessage: "닫기 전에 변경 사항을 저장하시겠습니까?",
	modalButtonSave: "변경 사항 저장",
	modalButtonDiscard: "저장 안 함",

	// Modals - Confirm Replace All
	modalReplaceAllTitle: "모두 바꾸기 확인",
	modalReplaceAllMessage: "{0}개의 \"{1}\" 일치 항목을 \"{2}\"(으)로 모두 바꾸시겠습니까?",
	modalButtonReplaceAll: "모두 바꾸기",

	// Modals - Go to Line
	modalButtonGo: "이동",

	// Callouts
	calloutBinaryTitle: "지원되지 않는 바이너리 형식",
	calloutBinaryDesc: "데이터 손상을 방지하기 위해 이 파일({0})은 코드 편집기에서 열 수 없습니다.",

	// Settings - Language
	settingsLanguageName: "언어",
	settingsLanguageDesc: "이 플러그인의 인터페이스 표시 언어를 선택하세요.",
	settingsLanguageAuto: "자동 (Obsidian 설정 따름)",

	// Settings - File Explorer
	settingsGroupFileExplorer: "파일 탐색기",
	settingsShowHiddenDotfilesName: "숨김 파일 및 폴더 표시",
	settingsShowHiddenDotfilesDesc: "점(.)으로 시작하는 파일 및 디렉토리(예: .gitignore, .env, .github/)를 표시합니다. .trash와 같은 내부 시스템 디렉토리는 안전하게 숨겨집니다.",
	settingsShowAllFileTypesName: "모든 파일 형식 표시",
	settingsShowAllFileTypesDesc: "Markdown 노트뿐만 아니라 보관함의 모든 파일(코드, JSON, 데이터, 확장자 없는 파일 등)을 파일 탐색기에 표시합니다.",
	settingsPreventAutoOpenName: "지원되지 않는 파일의 자동 실행 방지",
	settingsPreventAutoOpenDesc: "파일 탐색기에서 지원되지 않는 바이너리 또는 문서 파일(.zip, .exe, .docx, .dmg 등)을 한 번 클릭할 때 선택만 수행하여 원치 않는 압축 해제나 외부 프로그램 실행을 방지합니다.",
	settingsOpenOnDoubleClickName: "더블 클릭으로 지원되지 않는 파일 열기",
	settingsOpenOnDoubleClickDesc: "더블 클릭 시 시스템 기본 응용 프로그램으로 파일을 열 수 있도록 허용합니다. 비활성화 시 마우스 오른쪽 버튼 메뉴에서만 외부 실행할 수 있습니다.",
	settingsObsidianIgnoreName: "파일 및 폴더 제외: .obsidianignore",
	settingsObsidianIgnoreDesc: "볼트 루트에 있는 .obsidianignore 파일에 정의된 규칙을 적용합니다.",
	settingsButtonCreateDefault: "기본 파일 생성",
	settingsButtonCopyDefault: "기본값 복사",
	settingsTooltipCreateDefault: "볼트 루트에 기본 제외 규칙이 포함된 .obsidianignore 파일을 생성합니다",
	settingsTooltipCopyDefault: "기본 제외 규칙을 클립보드에 복사",
	settingsNoticeCreatedObsidianIgnore: "볼트 루트에 .obsidianignore 파일이 생성되었습니다.",
	settingsNoticeCopiedDefaultIgnore: "기본 제외 규칙이 클립보드에 복사되었습니다.",
	settingsGitIgnoreName: "파일 및 폴더 제외: .gitignore",
	settingsGitIgnoreDesc: "볼트 루트에 있는 .gitignore 파일에 정의된 규칙도 함께 적용합니다.",
	settingsButtonResetDefault: "기본값으로 재설정",

	// Settings - Code Editor
	settingsGroupCodeEditor: "코드 편집기",
	settingsSecurityWarning: "숨김 파일을 표시하면 중요한 설정 파일(.env, API 토큰, 자격 증명 등)을 보고 편집할 수 있습니다. 파일을 수정하거나 삭제할 때 주의하세요.",
	settingsAllowEditDotfilesName: "숨김 파일 및 확장자 없는 파일 편집 허용",
	settingsAllowEditDotfilesDesc: "점 파일(.gitignore, .env 등) 및 확장자가 없는 파일(license, makefile 등)을 내장 편집기에서 직접 열고 편집합니다.",
	settingsAllowEditCodeFilesName: "코드 및 데이터 파일 편집 허용",
	settingsAllowEditCodeFilesDesc: "아래의 편집 가능한 확장자 목록과 일치하는 파일을 내장 코드 편집기에서 엽니다.",
	settingsCustomExtensionsName: "편집 가능한 파일 확장자",
	settingsCustomExtensionsDesc: "코드 편집기에서 열 파일 확장자를 쉼표, 공백 또는 줄 바꿈으로 구분하여 입력하세요.",
	settingsCustomExtensionsPlaceholder: "확장자 입력",
	settingsTooltipResetExtensions: "확장자 목록을 기본값으로 재설정",
	settingsTabSizeName: "탭 들여쓰기 너비",
	settingsTabSizeDesc: "탭 1개에 해당하는 공백 수입니다. 'Obsidian 설정 따르기'로 설정하면 기본 설정을 따릅니다.",
	settingsTabSizeAuto: "Obsidian 설정 따르기",
	settingsIndentWithName: "탭으로 들여쓰기",
	settingsIndentWithDesc: "Tab 키를 누르거나 자동 들여쓰기 시 탭 또는 공백을 삽입합니다.",
	settingsIndentWithAuto: "Obsidian 설정 따르기",
	settingsIndentWithTabs: "탭 (Tabs)",
	settingsIndentWithSpaces: "공백 (Spaces)",
	settingsLineWrappingName: "자동 줄 바꿈",
	settingsLineWrappingDesc: "편집기 창 너비에 맞춰 긴 줄을 자동 줄 바꿈합니다.",
	settingsDisableAutoSaveName: "자동 저장 비활성화",
	settingsDisableAutoSaveDesc: "변경 사항을 디스크에 기록하기 전에 저장 단축키를 누르거나 저장 버튼을 클릭해야 합니다. 참고: Obsidian 앱을 종료할 때 저장되지 않은 편집 내용은 자동으로 저장됩니다.",
	settingsAutoSaveWarning: "경고: 자동 저장을 허용하면 변경 사항이 즉시 디스크에 기록되므로 중요한 코드 파일이 실수로 손상될 위험이 높아질 수 있습니다.",
	settingsResetAllName: "모든 설정 재설정",
	settingsResetAllDesc: "모든 플러그인 설정 및 파일 확장자를 기본값으로 복원합니다.",
	settingsButtonResetAll: "모두 초기화",
	settingsTooltipResetAll: "모든 설정을 기본값으로 재설정",

	// Notices
	noticeCreated: "{0} 파일이 생성되었습니다",
	noticeSaved: "저장되었습니다",
	noticeHiddenFilesVisible: "이제 숨김 파일 및 폴더가 표시됩니다.",
	noticeHiddenFilesHidden: "이제 숨김 파일 및 폴더가 숨겨집니다.",
	noticeAllFilesVisible: "이제 모든 파일 형식이 표시됩니다.",
	noticeAllFilesHidden: "이제 모든 파일 형식이 숨겨집니다.",
	noticeDotfileEditingEnabled: "숨김 파일 및 확장자 없는 파일 편집이 활성화되었습니다.",
	noticeDotfileEditingDisabled: "숨김 파일 및 확장자 없는 파일 편집이 비활성화되었습니다.",
	noticeCodeEditingEnabled: "코드 및 데이터 파일 편집이 활성화되었습니다.",
	noticeCodeEditingDisabled: "코드 및 데이터 파일 편집이 비활성화되었습니다.",
	noticeAutoSaveDisabled: "코드 파일의 자동 저장이 비활성화되었습니다.",
	noticeAutoSaveEnabled: "코드 파일의 자동 저장이 활성화되었습니다.",
	noticeExtensionsReset: "파일 확장자가 기본값으로 재설정되었습니다.",
	noticeAllSettingsReset: "모든 설정이 기본값으로 재설정되었습니다.",
	noticeNoActiveToRename: "이름을 바꿀 활성 파일 또는 폴더가 없습니다.",
	noticeReplaceAllSuccess: "{0}개의 일치 항목을 바꿨습니다.",

	// Commands
	commandCreateFile: "새 파일 만들기 (모든 형식)",
	commandCreateFolder: "새 폴더 만들기 (점 폴더 포함)",
	commandRenameActive: "현재 파일 또는 폴더 이름 바꾸기",
	commandToggleHidden: "숨김 파일 및 폴더 표시 전환",
	commandToggleAllTypes: "모든 파일 형식 표시 전환",
	commandToggleAllowEditDotfiles: "숨김 파일 및 확장자 없는 파일 편집 전환",
	commandToggleAllowEditCodeFiles: "코드 및 데이터 파일 편집 전환",
	commandToggleLineWrapping: "코드 편집기에서 자동 줄 바꿈 전환",
	commandGotoLine: "코드 편집기에서 지정된 행으로 이동",
};
