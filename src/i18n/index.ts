import { getLanguage, requireApiVersion } from "obsidian";
import { de } from "./locales/de";
import { en, type TranslationSchema } from "./locales/en";
import { es } from "./locales/es";
import { fr } from "./locales/fr";
import { it } from "./locales/it";
import { ja } from "./locales/ja";
import { ko } from "./locales/ko";
import { ru } from "./locales/ru";
import { zhCn } from "./locales/zh-cn";
import { zhTw } from "./locales/zh-tw";

export type TranslationKey = keyof TranslationSchema;

export const SUPPORTED_LANGUAGES: Record<string, string> = {
	auto: "Auto",
	en: "English",
	"zh-tw": "繁體中文",
	"zh-cn": "简体中文",
	ja: "日本語",
	ko: "한국어",
	es: "Español",
	fr: "Français",
	it: "Italiano",
	de: "Deutsch",
	ru: "Русский",
};

const locales: Record<string, TranslationSchema | undefined> & { en: TranslationSchema } = {
	en,
	"zh-tw": zhTw,
	"zh-cn": zhCn,
	ja,
	ko,
	es,
	fr,
	it,
	de,
	ru,
};

let activeLanguage = "en";

export function normalizeLanguageCode(code: string): string {
	if (!code) return "en";
	const lower = code.toLowerCase().trim();

	// Traditional Chinese
	if (lower === "zh-tw" || lower === "zh-hk" || lower === "zh-mo" || lower.includes("hant")) {
		return "zh-tw";
	}
	// Simplified Chinese
	if (lower === "zh" || lower === "zh-cn" || lower === "zh-sg" || lower.includes("hans")) {
		return "zh-cn";
	}
	// Japanese
	if (lower.startsWith("ja")) return "ja";
	// Korean
	if (lower.startsWith("ko")) return "ko";
	// Spanish
	if (lower.startsWith("es")) return "es";
	// French
	if (lower.startsWith("fr")) return "fr";
	// Italian
	if (lower.startsWith("it")) return "it";
	// German
	if (lower.startsWith("de")) return "de";
	// Russian
	if (lower.startsWith("ru")) return "ru";
	// English
	if (lower.startsWith("en")) return "en";

	return "en";
}

export function detectObsidianLanguage(): string {
	let lang = "";
	if (requireApiVersion("1.8.7")) {
		try {
			lang = getLanguage();
		} catch {
			// Fall back if getLanguage throws
		}
	}

	if (!lang) {
		const momentLocale =
			typeof window !== "undefined" &&
			(window as unknown as { moment?: { locale?: () => string } }).moment?.locale?.();
		if (momentLocale) {
			lang = momentLocale;
		}
	}

	if (!lang && typeof navigator !== "undefined" && navigator.language) {
		lang = navigator.language;
	}

	return normalizeLanguageCode(lang);
}

export function setLanguage(lang: string): void {
	if (!lang || lang === "auto") {
		activeLanguage = detectObsidianLanguage();
	} else {
		activeLanguage = normalizeLanguageCode(lang);
	}
}

export function getActiveLanguage(): string {
	return activeLanguage;
}

export function t(key: TranslationKey, ...args: (string | number)[]): string {
	const current = locales[activeLanguage] ?? locales.en;
	let template = current[key];

	if (template === undefined || template === null) {
		template = locales.en[key] ?? (key as string);
	}

	if (args.length === 0) {
		return template;
	}

	return template.replace(/\{(\d+)\}/g, (_match: string, indexStr: string) => {
		const index = parseInt(indexStr, 10);
		return args[index] !== undefined ? String(args[index]) : _match;
	});
}
