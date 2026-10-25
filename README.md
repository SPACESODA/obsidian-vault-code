# Vault Code

<span style="color: #8a5cf5; font-weight: bold; font-size: 1.15em;">Vault Code turns your Obsidian vault into a workspace for notes, code, and files.</span>

View hidden files, create and organize files of any kind, and edit code in a beautiful editor. Preview web pages, diagrams, and data, or work with AI agents—all without leaving Obsidian.

Vault Code follows your Obsidian theme and display language: English, 繁體中文, 简体中文, 日本語, 한국어, Español, Français, Italiano, Deutsch, and Русский.

---

## ⚡ Features at a Glance

* **Hidden files & folders**: Reveal dotfiles, dotfolders, and extensionless files.
* **File creation & renaming**: Create any file type or nested path; rename files and extensions.
* **Ignore rules**: Keep the explorer tidy with `.obsidianignore` and `.gitignore`.
* **Code editor**: Syntax highlighting, line numbers, folding, and familiar editing shortcuts.
* **Markdown source editing**: Switch between Obsidian's note view and the code editor.
* **Find & replace**: Search across lines with regex, case matching, and whole-word matching.
* **Live preview**: Render web pages, emails, diagrams, data tables, and diffs.
* **Git (Desktop)**: Review diffs, keep or revert changes, and commit individual files.
* **Agent chat (Desktop)**: Connect coding CLIs, hosted APIs, or local model servers.
* **Mobile & tablet support**: Edit code and manage files on iOS, iPadOS, and Android.

---

## What you can do

### ✏️ Edit code right where you write notes

Open scripts, styles, and configuration files alongside your notes.

* **Language support**: Python, JavaScript, TypeScript, Rust, Go, C++, SQL, HTML, CSS, JSON, YAML, shell scripts, and more.
* **Markdown source**: Right-click a `.md` file and choose **Edit in code editor**, or click `</>` in the tab header. Useful for frontmatter, tables, and regex edits.
* **Familiar controls**: Line numbers, bracket matching, code folding, line duplication, commenting, and go-to-line.
* **Native foundation**: Built on Obsidian's editor engine, with your theme, font size, and light or dark mode.

### 👁️ See your hidden dotfiles and configs

* Reveal `.gitignore`, `.env`, `.dockerignore`, and `.github/` in the file explorer.
* Open extensionless files such as `Makefile`, `Dockerfile`, `LICENSE`, and `CNAME`.
* Hide `.git`, `node_modules`, and other clutter with ignore rules.

### 🌐 Preview files beside your code

Switch between code and preview with the **Preview** button or **Toggle code / preview** command.

* Render HTML, SVG, and MJML, including linked styles and images.
* View Mermaid diagrams, JSON, CSV/TSV, JSONL/NDJSON, and diff/patch files.
* Edit supported table cells with **Apply** or **Cancel**. Invalid or ambiguous data stays read-only.

### 🔍 Find & replace

Press <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>F</kbd> to search, or <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>H</kbd> to replace.

* Search across multiple lines and jump between matches with a live count (`1 of 14`).
* Toggle case matching (`Aa`), whole words (`\b`), or regular expressions (`.*`).

### 📂 Create, rename & organize files

Right-click a file or folder in the explorer:

* **New note here**: Create a Markdown note in that folder.
* **New folder here**: Name a folder directly in the explorer.
* **New file here (any extension)**: Create any file type, including dotfiles and nested paths such as `src/components/Button.tsx`.
* **Edit file name and extension...**: Rename files or change their extensions with built-in validation.
* **Add external folder by symlink (Desktop)**: Bring a folder from your disk into the explorer. Edits affect the originals; deleting the symlink keeps the original folder intact.

### 🌿 Review changes with Git (Desktop)

When your vault is inside a Git repository:

* Compare unstaged changes with the last commit directly in the editor.
* Jump between changes and keep or revert individual hunks.
* See the current branch and changed-file count in the status bar.
* Commit an individual file with a message, or discard its changes.

### ✨ Work with an AI agent (Desktop)

Summarize notes, explain code, or draft edits beside your work. Open **Chat with Agent** from the ribbon, a note's tab header, or the command palette.

Choose a connection in settings:

* **CLI**: Use Claude Code, Codex, Copilot, and other coding agents with their workspace tools. Install and update agents from settings.
* **API**: Bring your own key for OpenAI, Anthropic, Gemini, DeepSeek, Qwen, or another provider. Custom endpoints and model IDs are supported.
* **Local model**: Connect Ollama, LM Studio, Atomic Chat, or another compatible server.

Attach notes or selections, pin context, and revisit Markdown chat histories. **Safe mode** is read-only. **Edit mode** enables edits; API and local models require review before applying.

Some providers require a subscription or credits. API keys use Obsidian's secret storage (**1.11.4+**) and must be configured on each device.

### 🛡️ Control editing and file opening

* Single-clicking unsupported files selects them. Opening them in your system's default app on double-click is optional and disabled by default.
* Disable auto-save to save manually with <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>S</kbd>. A dirty dot (`●`) marks unsaved changes, and closing an unsaved tab prompts you. **Quitting Obsidian still saves unsaved edits.**
* File management and code editing work on desktop, mobile, and tablets. Git and Agent chat require desktop Obsidian.

---

## Shortcuts

| Shortcut | Action | Where |
| :--- | :--- | :--- |
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>F</kbd> | Find text | Code editor |
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>H</kbd> | Find and replace | Code editor |
| <kbd>Ctrl</kbd> + <kbd>G</kbd> | Go to line | Code editor |
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>/</kbd> | Toggle line comment | Code editor |
| <kbd>Shift</kbd> + <kbd>Option</kbd> / <kbd>Alt</kbd> + <kbd>A</kbd> | Toggle block comment | Code editor |
| <kbd>Option</kbd> / <kbd>Alt</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd> | Move line | Code editor |
| <kbd>Shift</kbd> + <kbd>Option</kbd> / <kbd>Alt</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd> | Duplicate line | Code editor |
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>K</kbd> | Delete line | Code editor |
| <kbd>Alt</kbd> + <kbd>Z</kbd> | Toggle line wrapping | Code editor |
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>S</kbd> | Save file | Code editor |
| <kbd>Esc</kbd> | Close search or dismiss a popup | Relevant editor or dialog |

Assign custom shortcuts to **Vault Code: Chat with Agent** or **Vault Code: Toggle code / preview in code editor** in **Settings → Hotkeys**.

---

## Settings

Open **Settings → Community plugins → Vault Code**:

* **Language**: Follow Obsidian or choose a display language.
* **File explorer**: Show hidden files or all file types, configure double-click behavior, and apply ignore rules.
* **Code editor**: Choose editable extensions, allow dotfile editing, set indentation and line wrapping, or disable auto-save.
* **Git (Desktop)**: Enable the branch indicator, diffs, and file commits.
* **Agent chat (Desktop)**: Manage CLI, API, and local connections; choose defaults and the chat history folder.
* **Auto-clean old chats**: Move chats last modified more than 7, 30, or 90 days ago to the trash on startup. Off by default; manual cleanup is also available.

---

## Installation

### From Obsidian Community Plugins *(Recommended)*

1. Open **Settings → Community plugins** and turn off **Restricted mode**.
2. Click **Browse** and search for `Vault Code`.
3. Click **Install**, then **Enable**.

### Via BRAT

To test pre-release builds or update directly from GitHub:

1. Install and enable the [BRAT](https://community.obsidian.md/plugins/obsidian42-brat) plugin from Community Plugins.
2. In BRAT settings, click **Add Beta plugin** and enter `SPACESODA/obsidian-vault-code`.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [GitHub Release](https://github.com/SPACESODA/obsidian-vault-code/releases).
2. Create `.obsidian/plugins/vault-code/` inside your vault and copy those three files into it.
3. In Obsidian, open **Settings → Community plugins**, refresh the list, and enable **Vault Code**.

---

## Privacy & Network Disclosure

Vault Code sends no analytics or telemetry. Network activity depends on what you use:

* **Agent chat**: CLI agents contact their configured services. API and local connections send prompts, chat history, and attached note or selection context to your chosen endpoint. A loopback endpoint runs on your device; its server may also route to cloud providers. Generation tests run only when you click **Test**.
* **CLI installation & updates**: Contact the agent's installer or package registry.
* **Live preview**: HTML can run JavaScript and load remote resources. Remote CSS, fonts, images, or scripts may make network requests.
* **External links**: Settings links open in your default browser.

---

## License

Brought to you by **[SPACESODA](https://github.com/SPACESODA)** under the [GNU AGPLv3 License](LICENSE).
