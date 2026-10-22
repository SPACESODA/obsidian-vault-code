# Vault Code

A lightweight code editor and hidden file manager for Obsidian.

---

Obsidian is where you think, write, and organize your knowledge. But the moment you need to tweak a Python script, check a `.env` file, or preview an HTML mock-up, you're usually forced to jump out to VS Code or another window.

**Vault Code keeps you in flow.** It turns your vault into a fast, focused developer workspace where you can view hidden dotfiles, edit code across 70+ languages, and live-preview HTML and SVG files—all while feeling completely native to your Obsidian theme.

Vault Code automatically adapts to your Obsidian display language: English, 繁體中文, 简体中文, 日本語, 한국어, Español, Français, Italiano, Deutsch, and Русский.

---

## What you can do

### ✏️ Edit code right where you write notes
Open and edit scripts, data, and config files without leaving your vault. 
* **70+ languages supported**: Python, JavaScript, TypeScript, Rust, Go, C++, SQL, HTML, CSS, JSON, YAML, Shell scripts, and more.
* **Edit Markdown in code view**: Need pure source editing for frontmatter, raw tables, or regex tweaks? Right-click any `.md` file to **Edit in code editor**, or click the code icon (`</>`) in the tab header to switch instantly.
* **Feels like a proper code editor**: Line numbers, active line highlights, bracket matching, fold gutters, smooth scrolling, and VS Code-compatible muscle memory (moving lines, line duplication, commenting, and go-to-line).
* **Zero bloat**: Built on Obsidian’s native editor engine, so it inherits your theme, dark/light mode, and font size instantly with zero extra lag.

### 👁️ See your hidden dotfiles and configs
Obsidian normally hides dotfiles from view. Vault Code lets you peek behind the curtain:
* Reveal `.gitignore`, `.env`, `.dockerignore`, `.github/`, and other developer dotfiles right in your file explorer.
* Open extensionless files like `Makefile`, `Dockerfile`, `LICENSE`, and `CNAME`.
* Need to hide noisy build caches? Add `.git`, `node_modules`, or custom patterns in settings to keep your sidebar tidy.

### 🌐 Live visual preview for HTML & SVG
Turn Obsidian into a playground for web designs and vector graphics:
* Press <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>E</kbd> on any HTML file to toggle between raw code and a live rendered page. Relative links to local CSS, scripts, and vault images work automatically.
* View and inspect vector SVG graphics directly, or switch to XML mode to tweak paths and colors.

### 🔍 Search & replace without friction
Press <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>F</kbd> (or <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>H</kbd> to replace) for a familiar search panel:
* Jump through matches with live count indicators (`1 of 14`).
* Toggle case matching (`Aa`), whole-word matching (`\b`), and regular expressions (`.*`) with a single click.

### 📂 Create files & folders anywhere
Right-click any file or folder in your file explorer to:
* **New note here**: Create a markdown note directly inside that folder.
* **New folder here**: Create a new folder at the exact same location using Obsidian's native inline folder creation.
* **New file here (any type)**: Create any file with any extension (or no extension), and even type nested paths like `src/components/Button.tsx` to create folders and files in one go.

### 🛡️ Thoughtful safety guardrails & mobile support
* **No accidental launches**: Single-clicking unsupported files (like `.zip`, `.pdf`, or binaries) safely selects them without unzipping archives or launching external OS apps.
* **Unsaved changes prompt**: Warns you before closing a tab with unsaved work, with optional auto-save settings if you prefer saving manually (<kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>S</kbd>).
* **Tablet & Mobile ready**: Fully responsive controls and touch-friendly targets ensure seamless editing on iOS, iPadOS, and Android.

---

## Shortcuts

| Shortcut | Action | Where |
| :--- | :--- | :--- |
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>F</kbd> | Find text | In code editor |
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>H</kbd> | Find and replace | In code editor |
| <kbd>Ctrl</kbd> + <kbd>G</kbd> | Go to line | In code editor |
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>/</kbd> | Toggle line comment | In code editor |
| <kbd>Shift</kbd> + <kbd>Option</kbd> / <kbd>Alt</kbd> + <kbd>A</kbd> | Toggle block comment | In code editor |
| <kbd>Option</kbd> / <kbd>Alt</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd> | Move line up / down | In code editor |
| <kbd>Shift</kbd> + <kbd>Option</kbd> / <kbd>Alt</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd> | Duplicate line up / down | In code editor |
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>K</kbd> | Delete line | In code editor |
| <kbd>Alt</kbd> + <kbd>Z</kbd> | Toggle line wrapping | In code editor |
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>E</kbd> | Toggle code / live preview | HTML & SVG files |
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>S</kbd> | Save file | In code editor |
| <kbd>Esc</kbd> | Close search bar or dismiss popups | Anywhere |

---

## Settings

Tailor Vault Code to your workflow in **Settings → Community plugins → Vault Code**:

* **Display language**: Choose your preferred language or leave on *Auto (follow Obsidian)*.
* **Show hidden dotfiles & folders**: Toggle visibility of files and folders starting with `.`.
* **Show all file types**: Toggle visibility of non-markdown files in your explorer.
* **Ignored files and folders**: Add standard `.gitignore` rules (e.g. `node_modules/`, `.git/`) to hide specific noisy folders.
* **Prevent automatic opening of unsupported files**: Stop accidental double/single-click launches on system files.
* **Editable file extensions**: Add custom extensions you want Vault Code to open.
* **Disable auto-save**: Prefer manual saving? Turn this on to require <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>S</kbd>, complete with a dirty dot indicator (`●`).

---

## Installation

### From Obsidian Community Plugins *(Recommended once listed)*
1. Open Obsidian **Settings → Community plugins**.
2. Make sure **Restricted mode** is turned off.
3. Click **Browse** and search for `Vault Code`.
4. Click **Install**, then **Enable**.

### Manual installation
1. Grab `main.js`, `manifest.json`, and `styles.css` from the latest [GitHub Release](https://github.com/SPACESODA/obsidian-vault-code/releases).
2. Create a folder named `vault-code` inside your vault's `.obsidian/plugins/` directory.
3. Copy the 3 downloaded files into `.obsidian/plugins/vault-code/`.
4. In Obsidian, go to **Settings → Community plugins**, refresh the list, and turn on **Vault Code**.

---

## License

Brought to you by **[SPACESODA](https://github.com/SPACESODA)** under the [MIT License](LICENSE).
