# Vault Code

<span style="color: #8a5cf5; font-weight: bold; font-size: 1.125em;">Make your Obsidian vault a complete workspace for notes, code, and files.</span>
See hidden files, create, edit and organize files of any kind in beautiful code editor, preview HTML, SVG, and MJML, work together with AI Agent, all without leaving Obsidian.

---

**<span style="color: #8a5cf5; font-weight: bold;">Vault Code</span> keeps you in flow** — It turns your vault into a fast, focused workspace where you can view hidden dotfiles, edit code across most programming languages, and live-preview HTML, SVG, and MJML files, all while feeling completely native to your Obsidian experience.

Vault Code automatically adapts to your Obsidian display language: English, 繁體中文, 简体中文, 日本語, 한국어, Español, Français, Italiano, Deutsch, and Русский.

---

## ⚡ Features at a glance

* **Reveal hidden files and folders**: View and edit dotfiles (`.gitignore`, `.env`), dotfolders, and extensionless files.
* **Universal file creator**: Create files with any extension (or none), and type nested paths like `src/utils/math.ts` to build entire folder trees in one step.
* **Edit file name and extension**: Rename files and change extensions freely with built-in validation and safety checks.
* **Manage ignore rules**: Filter out build caches and clutter with standard `.obsidianignore` and `.gitignore` pattern matching.
* **Beautiful code editor**: Fast syntax highlighting across 100+ programming languages powered by Obsidian's native editor engine.
* **Edit notes as source code**: Switch between rendered Markdown and raw code editor in one click with the `</>` tab header button.
* **Find and replace**: Multiline search, regex, case and whole-word matching, live match counters, and go-to-line navigation.
* **Live visual preview**: Toggle instant live previews for HTML pages, SVG vector graphics, and responsive MJML email templates.
* **Git integration (Desktop)**: Gutter diff markers, inline diff comparison, status bar branch tracking, commit stats, and hunk-level revert controls.
* **Agent chat (Desktop)**: Pair-program inside your notes with local coding CLIs, hosted cloud APIs, or private local LLM servers.
* **Interactive diff reviews**: Review AI-proposed edits with visual side-by-side diffs before applying them to your files.
* **Mobile and tablet ready**: Responsive layout and touch-friendly controls crafted for iOS, iPadOS, and Android.

---

## What you can do

### ✏️ Edit code right where you write notes
Open and edit scripts, data, and configuration files without jumping out to an external editor:
* **Broad language support**: Syntax highlighting for Python, JavaScript, TypeScript, Rust, Go, C++, SQL, HTML, CSS, JSON, YAML, Shell scripts, TOML, Dockerfile, and almost any language in your stack.
* **Edit Markdown in code view**: Need pure source editing for complex frontmatter, raw tables, or regex tweaks? Right-click any `.md` file to **Edit in code editor**, or click the code icon (`</>`) in the tab header to switch instantly.
* **Feels like a proper code editor**: Line numbers, active line highlights, bracket matching, fold gutters, smooth scrolling, and VS Code muscle memory (moving lines, line duplication, commenting, and go-to-line).
* **Zero bloat**: Built directly on Obsidian's editor engine, so it inherits your theme, dark/light mode, and font size instantly with zero extra lag.

### 🤖 Pair-program with your AI Agent (Desktop)
Collaborate with AI directly inside your vault with context from your active notes and files:
* **Always one click away**: Click the sparkling Agent icon (`✦`) in the top-right header of any note or code leaf, click the ribbon icon, or use the Command Palette to open the chat pane with your active file attached as context.
* **Three ways to connect**:
  * **Local CLI coding agents**: Run autonomous coding CLIs installed on your machine (Antigravity, Claude Code, OpenAI Codex, GitHub Copilot CLI, Cursor Agent, Aider, OpenCode, Pi, Kimi Code, Grok CLI). Vault Code detects them automatically, checks their authentication status, and updates them with a single click in settings with streaming terminal logs.
  * **Direct cloud APIs**: Connect directly to OpenAI, Anthropic, Google Gemini, OpenRouter, DeepSeek, Qwen, Kimi / Moonshot, GLM / Z.ai, MiniMax, SiliconFlow, or any custom OpenAI-compatible endpoint with streamed replies and automatic model discovery.
  * **100% private local models**: Connect to Ollama, LM Studio, or Atomic Chat over local loopback (`http://127.0.0.1:11434/v1`). Completely private, offline-capable, and equipped with passive socket detection that never wakes your background daemon unexpectedly.
* **Chat vs. Edit modes**:
  * *Chat mode*: Ask questions, brainstorm logic, discuss architecture, or debug errors with formatted Markdown, syntax-highlighted code blocks, and one-click copy buttons.
  * *Edit mode and visual diff reviews*: Instruct the agent to refactor, write new functions, or edit your note. For direct connections, Vault Code presents a visual **Diff Review** modal showing additions, deletions, and an explanation before any changes are written.
* **Searchable model palette**: A fast modal suggest search lets you filter through dozens of models across providers in milliseconds.
* **Saved in your vault**: Every conversation is saved as a clean Markdown note in your configured chat folder (`Chats/` by default), making your AI discussions searchable and permanent.

### 👁️ See your hidden dotfiles and configs
Obsidian normally hides dotfiles from view. Vault Code lets you peek behind the curtain:
* Reveal `.gitignore`, `.env`, `.dockerignore`, `.github/`, and other developer dotfiles right in your file explorer.
* Open extensionless files like `Makefile`, `Dockerfile`, `LICENSE`, and `CNAME`.
* Need to hide noisy build caches? Add `.git`, `node_modules`, or custom patterns in settings or `.obsidianignore` to keep your sidebar tidy.

### 🌐 Live visual preview for HTML, SVG & MJML
Turn Obsidian into a playground for web designs, vector graphics, and responsive emails:
* Press <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>E</kbd> on any HTML or MJML file to toggle between raw code and a live rendered preview. Relative links to local CSS, scripts, and vault images work automatically, and external CDN stylesheets are inlined securely.
* Live-render responsive email templates with built-in MJML compilation.
* View and inspect vector SVG graphics directly, or switch to XML mode to tweak paths and colors.

### 🌿 Git integration with inline diffs (Desktop)
When your vault is inside a Git repository:
* **Inline gutter diffs**: View unstaged additions, deletions, and modifications directly alongside your code.
* **Diff navigation and hunk controls**: Jump between changes, revert individual hunks, or keep them.
* **Status bar and branch indicator**: See current Git branch and file modification counts at a glance.
* **Commit and revert**: Stage and commit changes with a commit message, or discard changes to revert to the last commit with confirmation.

### 🔍 Search and replace without friction
Press <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>F</kbd> (or <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>H</kbd> to replace) for a familiar search panel:
* Jump through matches with live count indicators (`1 of 14`).
* Toggle case matching (`Aa`), whole-word matching (`\b`), and regular expressions (`.*`) with a single click.
* Jump straight to any line with <kbd>Ctrl</kbd> + <kbd>G</kbd> (or <kbd>Cmd</kbd> + <kbd>Alt</kbd> + <kbd>G</kbd>).

### 📂 Create, rename and organize files anywhere
Right-click any file or folder in your file explorer to:
* **New note here**: Create a markdown note directly inside that folder.
* **New folder here**: Create a new folder at the exact same location using Obsidian's native inline folder creation.
* **New file here (any extension)**: Create any file with any extension (or no extension), and even type nested paths like `src/components/Button.tsx` to create folders and files in one go.
* **Edit file name and extension...**: Freely rename files and modify extensions, dotfiles, or extensionless formats with built-in validation.

### 🛡️ Thoughtful safety guardrails and mobile support
* **Safe single-click**: Single-clicking unsupported files (like `.zip`, `.pdf`, or binaries) safely selects them without unzipping archives or launching external OS apps.
* **Double-click controls**: Optionally enable opening unsupported files in your system's default app on double-click (disabled by default; right-click is always available).
* **Unsaved changes prompt**: Warns you before closing a tab with unsaved work, with optional auto-save settings if you prefer saving manually (<kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>S</kbd>).
* **Tablet and mobile ready**: Fully responsive controls and touch-friendly targets ensure seamless editing on iOS, iPadOS, and Android.

---

## Shortcuts

| Shortcut | Action | Where |
| :--- | :--- | :--- |
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>F</kbd> | Find text | In code editor |
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>H</kbd> | Find and replace | In code editor |
| <kbd>Ctrl</kbd> + <kbd>G</kbd> / <kbd>Cmd</kbd> + <kbd>Alt</kbd> + <kbd>G</kbd> | Go to line | In code editor |
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>/</kbd> | Toggle line comment | In code editor |
| <kbd>Shift</kbd> + <kbd>Option</kbd> / <kbd>Alt</kbd> + <kbd>A</kbd> | Toggle block comment | In code editor |
| <kbd>Option</kbd> / <kbd>Alt</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd> | Move line up / down | In code editor |
| <kbd>Shift</kbd> + <kbd>Option</kbd> / <kbd>Alt</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd> | Duplicate line up / down | In code editor |
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>K</kbd> | Delete line | In code editor |
| <kbd>Alt</kbd> + <kbd>Z</kbd> | Toggle line wrapping | In code editor |
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>E</kbd> | Toggle code / live preview | HTML, SVG & MJML files |
| <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>S</kbd> | Save file explicitly | In code editor |
| Header `✦` icon / Ribbon `✦` | Open Agent chat | Active leaf or ribbon |
| <kbd>Esc</kbd> | Close search bar or dismiss popups | Anywhere |

---

## Agent chat configuration

Choose **CLI**, **API**, or **Local model** in **Settings → Vault Code → AI connections**:

* **CLI coding agents**: Connects to installed coding CLIs using their own credentials and local tools. Vault Code discovers them automatically and lets you update or install them with one click.
* **Direct hosted APIs**: Connects directly to cloud providers. Built-in presets include OpenAI, Anthropic, Google Gemini, OpenRouter, DeepSeek, Qwen, Moonshot / Kimi, GLM / Z.ai, MiniMax, and SiliconFlow. Presets supply standard endpoints and formats while allowing full customization of model IDs, headers, and custom base URLs.
* **Private local models**: Connects to local runners such as Ollama, LM Studio, or [Atomic Chat](https://github.com/AtomicBot-ai/Atomic-Chat) over loopback (`http://127.0.0.1:11434/v1`). Background checks use lightweight passive probes that never wake idle local daemons.

### Credentials and security
* **Native SecretStorage**: API keys are stored securely using Obsidian's native SecretStorage API (Obsidian 1.11.4+) and are never saved in plaintext `data.json` or committed to your vault.
* **No telemetry**: Vault Code contains zero tracking or analytics. Prompts and context are only transmitted directly to the endpoints you choose.
* **Safe diff previews**: When using Edit mode with direct models, proposals are displayed in a visual Diff Review modal. Changes are only applied when you click **Accept edit**, and are refused if the underlying note changed concurrently.

---

## Settings overview

Configure Vault Code in **Settings → Community plugins → Vault Code**:

* **Language**: Choose your display language or leave on *Auto (follow Obsidian)*.

#### File explorer
* **Show hidden dotfiles & folders**: Toggle visibility of files and folders starting with `.`.
* **Show all file types**: Toggle visibility of non-markdown files in your explorer.
* **Open unsupported files on double-click**: Optionally open files Obsidian cannot view (such as `.zip`, `.docx`, or `.pdf`) in your system's default app on double-click. Single-clicking safely selects files, and right-click is always available.
* **Ignored files and folders**: Filter vault contents with standard `.gitignore` pattern syntax using `.obsidianignore` and `.gitignore`.

#### Code editor
* **Allow editing dotfiles and extensionless files**: Secure toggle with a safety confirmation to edit sensitive configuration files.
* **Editable file extensions**: Add custom extensions you want Vault Code to open.
* **Disable auto-save**: Require manual saving with <kbd>Cmd</kbd> / <kbd>Ctrl</kbd> + <kbd>S</kbd>, complete with an unsaved dirty dot indicator `●`.

#### Git (Desktop)
* **Git integration**: Show file changes, branch indicator, and inline gutter diffs when your vault is inside a Git repository. Cleanly shuts down all Git operations when disabled.

#### Agent chat (Desktop)
* **Enable Agent chat**: Toggle the AI assistant on or off. Cleanly shuts down all background processes when disabled.
* **Chat folder**: Configure where conversation notes are stored (`Chats/` by default).
* **Auto-clean empty chats**: Automatically remove unedited or empty chat notes when closed.

---

## Installation

### From Obsidian Community Plugins *(Recommended)*
1. Open Obsidian **Settings → Community plugins**.
2. Make sure **Restricted mode** is turned off.
3. Click **Browse** and search for `Vault Code`.
4. Click **Install**, then **Enable**.

### Manual installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [GitHub Release](https://github.com/SPACESODA/obsidian-vault-code/releases).
2. Create a folder named `vault-code` inside your vault's `.obsidian/plugins/` directory.
3. Copy the 3 downloaded files into `.obsidian/plugins/vault-code/`.
4. In Obsidian, go to **Settings → Community plugins**, refresh the list, and turn on **Vault Code**.

---

## Privacy & Network Disclosure

Vault Code does not send analytics, telemetry, or user tracking data of any kind. Network activity depends entirely on the features you choose to use:

* **Agent chat**: CLI agents communicate directly with their configured services. Hosted API connections transmit prompts, conversation history, and attached note context only to the endpoint you configure. Local connections talk only to your local loopback address (`127.0.0.1`).
* **CLI updates and installation**: Contact the selected agent's official installer or package registry when you trigger an update or installation in settings.
* **Live HTML preview**: Remote stylesheets or fonts referenced in your HTML (such as Google Fonts or CDN CSS) may be fetched by the browser renderer.
* **External links**: Documentation and setup links in settings open in your default browser.

---

## License

Brought to you by **[SPACESODA](https://github.com/SPACESODA)** under the [GNU AGPLv3 License](LICENSE).
