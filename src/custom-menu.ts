import { Menu } from "obsidian";

/**
 * Creates an Obsidian Menu forced to use the custom DOM/HTML renderer
 * (with SVG icons, active states, and full CSS styling) rather than native OS menus.
 */
export function createCustomMenu(): Menu {
	const menu = new Menu();
	(
		menu as unknown as {
			setUseNativeMenu?: (use: boolean) => Menu;
			useNativeMenu?: boolean;
		}
	).setUseNativeMenu?.(false);
	(
		menu as unknown as { useNativeMenu?: boolean }
	).useNativeMenu = false;
	return menu;
}
