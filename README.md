# dsh-set-workspace

> Right-click a folder in Windows File Explorer → **Open DSH Workspace Here**.

<div align="center">
  <a href="https://opensource.org/licenses/MIT"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg" /></a>
  <img alt="Windows Explorer context menu" src="https://img.shields.io/badge/Windows-Explorer%20context%20menu-4d6bfe" />
  <img alt="zh / en" src="https://img.shields.io/badge/lang-zh%2Fen-4d6bfe" /><br /><br />
  🌏 <a href="./README.md"><b>English</b></a> · <a href="./README.zh.md">中文</a>
</div>

**Unofficial community project. Not affiliated with, endorsed by, or maintained by DeepSeek.**

A native DSH web plugin (not a browser extension) that adds one Explorer verb. Right-click any folder → it registers the folder as a workspace, starts a session in it, and **switches the DSH page to that workspace** — all through the official `workspace.create` / `session.create` RPCs, so the workspace appears and persists exactly like one created from the UI.

## ✨ Features

- 🖱️ **Right-click a folder** in Windows File Explorer → `Open DSH Workspace Here`.
- 🗂️ **Registers the workspace** (idempotent — re-running returns the existing one) and **starts a session** in it.
- 🎯 **Switches the DSH page** to the new workspace (the client half watches for the session and `open()`s it — no page reload).
- 🌏 **Localized** — menu label and dialogs follow the OS UI language (`在此处打开 DSH 工作区` / `Open DSH Workspace Here`).
- 🐳 **DSH whale mascot icon** on the menu item.
- 👻 **No console flash** — the action runs through a `wscript` hidden-window launcher.
- 🪶 **No new storage / schema / tools** — reuses the core workspace registry and the existing `/api` RPCs.

## 🚀 Install

**Prerequisites**: Windows, a running `dsh web`, Node.js ≥ 20 on `PATH`.

### One-liner (PowerShell 5.1+ / pwsh)

```powershell
irm https://raw.githubusercontent.com/tsingshitao-nuke/dsh-set-workspace/main/scripts/install.ps1 | iex
```

Git Bash / WSL:

```sh
curl -fsSL https://raw.githubusercontent.com/tsingshitao-nuke/dsh-set-workspace/main/scripts/install.sh | bash
```

### Manual

```sh
# ① install the bundle
dsh plugin --profile web add github:tsingshitao-nuke/dsh-set-workspace

# ② register the Explorer right-click menu (restart DSH first so the host half publishes the port)
node ~/.dsh/profiles/web/node_modules/dsh-set-workspace/bin/install-context-menu.cjs
```

Remove the menu (keeps the bundle):

```sh
node ~/.dsh/profiles/web/node_modules/dsh-set-workspace/bin/install-context-menu.cjs --uninstall
```

<details>
<summary><b>From a local clone (development)</b></summary>

```sh
git clone https://github.com/tsingshitao-nuke/dsh-set-workspace.git
cd dsh-set-workspace && npm install && npm run build
dsh plugin --profile web add link:../dsh-set-workspace
node ~/.dsh/profiles/web/node_modules/dsh-set-workspace/bin/install-context-menu.cjs
```

</details>

## 🔍 How it works

```
File Explorer right-click
  └─ wscript launch-hidden.vbs "%1"            (hidden window — no console flash)
       └─ node set-workspace.cjs "<folder>"
            ├─ reads  ~/.dsh/dsh-set-workspace/runtime.json   (port, published by the host half)
            ├─ POST   /api/workspace.create { path }          (idempotent)
            ├─ POST   /api/session.create  { workspaceId, sessionId: "dsw-open-…" }
            └─ MessageBox confirmation

DSH client half watches the session list → open()s the "dsw-open-…" session → page switches to the workspace
```

The bundle is a standard **host/client dual-half** DSH package: the host half (`src/index.ts`) publishes the live webserver port to `~/.dsh/dsh-set-workspace/runtime.json`; the client half (`src/client/index.ts`) performs the switch. The bridge (`bin/set-workspace.cjs`), the whale icon, and the launcher are copied to `~/.dsh/dsh-set-workspace/` (space-free, stable across reinstalls), and the registry entries live under `HKCU\Software\Classes\Directory\shell` (no admin rights).

## ⚙️ Development

```sh
npm install        # dev deps: typescript + tsdown (+ @types/node)
npm run build      # host (tsc) + client (tsdown -> lib/client.js)
```

The client bundle must start with a `window.__ModuleLoader__.load` registration for `dsh-set-workspace` and export `{ apply, inject }`.

## ⚠️ Known limitations

- **Windows 11**: third-party `Directory\shell` verbs may appear under **"Show more options"** (Shift+F10) rather than the top-level menu. Surfacing at the top level requires a COM `IContextMenu` handler (heavier; not shipped).
- The bridge talks to the host over loopback — DSH must be running.

## 📦 Publishing

```sh
npm pack   # -> dsh-set-workspace-<version>.tgz (upload as a GitHub Release asset)
```

## License

[MIT](./LICENSE)
