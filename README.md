# Vault Code

**The must-have all-in-one workspace for Obsidian.**  
A file manager to display and manage all file types, including hidden files, plus a beautiful code editor and more.

---

Obsidian is where you think, write, and organize your knowledge. But when you need to tweak a script, check a `.env` file, or preview an HTML, you're usually forced to jump out to VS Code or another window.

**Vault Code keeps you in flow.** It turns your vault into a fast, focused workspace where you can view hidden dotfiles, edit code across most programming languages, and live-preview HTML, SVG, and MJML files, all while feeling completely native to your Obsidian experience.

Vault Code automatically adapts to your Obsidian display language: English, 繁體中文, 简体中文, 日本語, 한국어, Español, Français, Italiano, Deutsch, and Русский.

---

## ⚡ Features at a Glance

* **Reveal Hidden Files & Folders**: View and edit dotfiles and extensionless files.
* **Universal File Creator**: Create dotfiles, dotfolders, and any file extension.
* **Edit File Name & Extension**: Rename files and change extensions freely with built-in safety.
* **Manage Ignore Rules**: Filter files with `.obsidianignore` and `.gitignore` files.
* **Beautiful Code Editor**: Fast syntax highlighting across most programming languages.
* **Edit Notes as Source Code**: Toggle between native note view and code editor in one click.
* **Find & Replace**: Multiline search, regex, case and word matching, and jump navigation.
* **Live Preview**: Toggle live preview for HTML, SVG, and MJML email templates.
* **Git Integration (Desktop)**: View branch indicator, inline diff comparisons, and file change stats.
* **Mobile & Tablet Ready**: Edit code and manage files comfortably on phones and tablets.

---

## What you can do

### ✏️ Edit code right where you write notes
Open and edit scripts, data, and config files without leaving your vault. 
* **Broad language support**: Python, JavaScript, TypeScript, Rust, Go, C++, SQL, HTML, CSS, JSON, YAML, Shell scripts, and almost any language in your stack.
* **Edit Markdown in code view**: Need pure source editing for frontmatter, raw tables, or regex tweaks? Right-click any `.md` file to **Edit in code editor**, or click the code icon (`</>`) in the tab header to switch instantly.
* **Feels like a proper code editor**: Line numbers, active line highlights, bracket matching, fold gutters, smooth scrolling, and VS Code-compatible muscle memory (moving lines, line duplication, commenting, and go-to-line).
* **Zero bloat**: Built on Obsidian’s native editor engine, so it inherits your theme, dark/light mode, and font size instantly with zero extra lag.

### 👁️ See your hidden dotfiles and configs
Obsidian normally hides dotfiles from view. Vault Code lets you peek behind the curtain:
* Reveal `.gitignore`, `.env`, `.dockerignore`, `.github/`, and other developer dotfiles right in your file explorer.
* Open extensionless files like `Makefile`, `Dockerfile`, `LICENSE`, and `CNAME`.
* Need to hide noisy build caches? Add `.git`, `node_modules`, or custom patterns in settings to keep your sidebar tidy.

### 🌐 Live visual preview for HTML, SVG & MJML
Turn Obsidian into a playground for web designs, vector graphics, and responsive emails:
* Press <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>E</kbd> on any HTML or MJML file to toggle between raw code and a live rendered preview. Relative links to local CSS, scripts, and vault images work automatically, and external CDN stylesheets are inlined securely.
* Live-render responsive email templates with built-in MJML support.
* View and inspect vector SVG graphics directly, or switch to XML mode to tweak paths and colors.

### 🔍 Search & replace without friction
Press <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>F</kbd> (or <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>H</kbd> to replace) for a familiar search panel:
* Jump through matches with live count indicators (`1 of 14`).
* Toggle case matching (`Aa`), whole-word matching (`\b`), and regular expressions (`.*`) with a single click.

### 📂 Create, rename & manage files anywhere
Right-click any file or folder in your file explorer to:
* **New note here**: Create a markdown note directly inside that folder.
* **New folder here**: Create a new folder at the exact same location using Obsidian's native inline folder creation.
* **New file here (any extension)**: Create any file with any extension (or no extension), and even type nested paths like `src/components/Button.tsx` to create folders and files in one go.
* **Edit file name and extension...**: Freely rename files and modify extensions, dotfiles, or extensionless formats with built-in validation.

### 🌿 Git integration (Desktop)
When your vault is inside a Git repository:
* **Inline diff comparison**: View unstaged additions, deletions, and modifications directly alongside your code.
* **Diff navigation & hunk controls**: Jump between changes, revert individual hunks, or keep them.
* **Status bar & branch indicator**: See current Git branch and file modification counts at a glance.
* **Commit & revert**: Stage and commit changes with a commit message, or discard changes to revert to the last commit.

### 🛡️ Thoughtful safety guardrails & mobile support
* **Safe single-click**: Single-clicking unsupported files (like `.zip`, `.pdf`, or binaries) safely selects them without unzipping archives or launching external OS apps.
* **Double-click controls**: Optionally enable opening unsupported files in your system's default app on double-click (disabled by default; right-click is always available).
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
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>E</kbd> | Toggle code / live preview | HTML, SVG & MJML files |
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>S</kbd> | Save file | In code editor |
| <kbd>Esc</kbd> | Close search bar or dismiss popups | Anywhere |

---

## Settings

Tailor Vault Code to your workflow in **Settings → Community plugins → Vault Code**:

* **Language**: Choose your preferred language or leave on *Auto (follow Obsidian)*.

#### File explorer
* **Show hidden dotfiles & folders**: Toggle visibility of files and folders starting with `.`.
* **Show all file types**: Toggle visibility of non-markdown files in your explorer.
* **Open unsupported files on double-click**: Optionally open files Obsidian cannot view (such as .zip, .docx, or .pdf) in your system's default app on double-click. (Note: Single-click safely selects files, and right-click is always available).
* **Ignored files and folders**: Filter vault contents with standard `.gitignore` rules using `.obsidianignore` and `.gitignore`.

#### Code editor
* **Allow editing dotfiles and extensionless files**: Secure toggle with a safety reminder to edit sensitive files.
* **Editable file extensions**: Add custom extensions you want Vault Code to open.
* **Disable auto-save**: Prefer manual saving? Turn this on to require <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>S</kbd>, complete with a dirty dot indicator `●`.

#### Git (Desktop)
* **Git integration**: Show file changes, branch indicator, and inline diff comparison when vault is inside a Git repository. Cleanly shuts down all Git operations when disabled.

---

## Installation

### From Obsidian Community Plugins *(Recommended)*
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

## Agent chat

Choose **CLI**, **API**, or **Local model** in the plugin settings:

- **CLI** uses installed coding agents and their own sign-in. Agents retain their existing vault tools.
- **API** connects directly to hosted providers. Presets include OpenAI, Anthropic, Gemini, OpenRouter, DeepSeek, Qwen, Kimi, GLM, MiniMax, and SiliconFlow. Presets only fill editable defaults; custom endpoints and model IDs are supported.
- **Local model** connects to a running Ollama, LM Studio, [Atomic Chat](https://github.com/AtomicBot-ai/Atomic-Chat), or another compatible server. Load a model in that app first. The Atomic Chat preset uses `http://127.0.0.1:53176/v1`. Use the server URL shown in your Atomic Chat settings if it differs; its upstream documentation also lists port `1337`.

Add a connection, enter one or more model IDs (one per line), or use the refresh icon beside **Models** to discover them. **Advanced** contains the API format and optional non-secret headers. Regional endpoints and separate accounts can be saved as separate connections.

API keys are stored through Obsidian's secret storage (requires Obsidian 1.11.4 or newer), not in the plugin's `data.json`. Local servers can run without a key. Keys must be configured on each device; provider configuration contains no keys. CLI chat remains available on older supported Obsidian versions.

API and local-model chat use conversation history and attached note or selection context. **Review edits** lets a model propose changes; nothing is written until you review and apply them. Applying an edit is refused if the original note has changed in the meantime. Direct models do not receive shell access or vault-wide agent tools. Desktop supports streamed replies; a compatible server may also return a complete reply.

**Test** sends a short synthetic prompt with no vault content. Hosted providers may charge for it. Model discovery does not verify generation access.

## Privacy & Network Disclosure

Vault Code does not send analytics or telemetry. Network activity depends on the features you use:

- **Agent chat:** CLI agents communicate with their configured services. API connections send your prompts, conversation history, and attached note or selection to the configured endpoint. Local connections send the same context to the server URL you choose; a loopback server runs on your device. Connections are not tested automatically.
- **CLI installation and updates:** These contact the selected agent's installer or package registry.
- **Live HTML Preview:** Remote stylesheet references, such as fonts or CDN CSS, may be fetched for rendering.
- **External links:** Links in settings open in your default browser.


---

## License

Brought to you by **[SPACESODA](https://github.com/SPACESODA)** under the [GNU AGPLv3 License](LICENSE).
