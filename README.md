# dsh-set-workspace

Adds a Windows File Explorer context menu entry: right-click a folder and pick **"Open DSH Workspace Here"** to register it as a DSH workspace, start a session in it, and switch the DSH page to that workspace.

Unofficial community project. Not affiliated with or endorsed by DeepSeek.

[中文说明](./README.zh.md)

## What it does

- Right-click a folder in File Explorer, then choose **Open DSH Workspace Here**.
- If DSH is not running, the bridge launches it — the Desktop app, or the official `dsh` CLI in npm installs; if it is running (even minimized or in the background), the DSH window is restored and brought to the front.
- The folder is registered as a workspace (idempotent) and a session is started in it.
- The DSH page switches to the new workspace automatically (the client half watches for the session and opens it — no page reload).
- If you view DSH in a regular browser instead of the Desktop window, install with `--browser`; the bridge then focuses the browser page.
- Menu label and dialogs follow the OS UI language (Chinese / English).
- The action runs through a `wscript` hidden-window launcher, so no console window flashes.
- The menu item uses the DSH whale icon.
- No new storage, schema, or tools — it reuses the core workspace registry and the existing `/api` RPCs.

## Install

Requirements: Windows, Node.js >= 20 on `PATH`, and a DSH installation — the DSH Desktop app or the official CLI (`npm i -g @deepseek-ai/dsh`). The bridge launches DSH automatically when it is not running; it discovers the launch path from a runtime file that DSH writes, so run DSH once before the first use.

One-liner (PowerShell 5.1+ / pwsh):

```powershell
irm https://raw.githubusercontent.com/tsingshitao-nuke/dsh-set-workspace/main/scripts/install.ps1 | iex
```

Git Bash / WSL:

```sh
curl -fsSL https://raw.githubusercontent.com/tsingshitao-nuke/dsh-set-workspace/main/scripts/install.sh | bash
```

Manual install:

```sh
# 1. install the bundle
dsh plugin --profile web add github:tsingshitao-nuke/dsh-set-workspace

# 2. register the Explorer context menu (restart DSH first so the host half publishes the port)
node ~/.dsh/profiles/web/node_modules/dsh-set-workspace/bin/install-context-menu.cjs
```

Remove the menu (keeps the bundle installed):

```sh
node ~/.dsh/profiles/web/node_modules/dsh-set-workspace/bin/install-context-menu.cjs --uninstall
```

## How it works

```
File Explorer right-click
  └─ wscript launch-hidden.vbs "%1"           (hidden window)
       └─ node set-workspace.cjs "<folder>"
            ├─ reads  ~/.dsh/dsh-set-workspace/runtime.json   (port + launch command)
            ├─ launches the DSH Desktop app — boots it when down, and when it is
            │  already running the app's own single-instance handler restores,
            │  shows and focuses its window (same trick as VS Code "Open with Code")
            ├─ polls until /api is ready
            ├─ POST   /api/workspace.create { path }          (idempotent)
            ├─ POST   /api/session.create  { workspaceId, sessionId: "dsw-open-…" }
            └─ MessageBox confirmation

The DSH client half watches the session list, opens the "dsw-open-…" session,
and the page switches to the workspace.

Browser mode: when DSH is served into a regular browser, run the installer with
`--browser` (or write `{"ui":"browser"}` to ~/.dsh/dsh-set-workspace/config.json).
The bridge then focuses the browser page via the loopback URL instead of the
Desktop window.
```

The bundle is a standard host/client dual-half DSH package. The host half (`src/index.ts`) writes the current webserver port and the Desktop launch command to `~/.dsh/dsh-set-workspace/runtime.json`. The client half (`src/client/index.ts`) performs the switch. The bridge script, whale icon, and launcher are copied to `~/.dsh/dsh-set-workspace/` (space-free, stable across reinstalls); the registry entries live under `HKCU\Software\Classes\Directory\shell` (no admin rights).

## Compatibility

- **DSH Desktop (Tauri / Electron)**: the host records the app executable; the bridge launches it to boot DSH, and when it is already running the app's own single-instance handler restores and focuses the window (VS Code "Open with Code" pattern).
- **Official CLI / npm install** (`npm i -g @deepseek-ai/dsh`, DSH served into a browser): the host records the `dsh web` launch command (the same node + `lib/bin.js` the running kernel uses, with `--no-open --host 127.0.0.1 --port <port>`); the bridge boots DSH through it when it is down and focuses the browser page — no desktop window required.
- The launcher type is re-detected every time the host starts, so the same plugin adapts to whichever install you upgrade to.

## Build

```sh
npm install
npm run build   # host (tsc) + client (tsdown -> lib/client.js)
```

## Known limitations

- On Windows 11, third-party `Directory\shell` verbs may appear under "Show more options" (Shift+F10) instead of the top-level menu. Putting them at the top level requires a COM `IContextMenu` handler, which this plugin does not ship.
- The bridge talks to the host over loopback. It launches DSH when the host is down, but if DSH has never run (so no launch path is recorded), it falls back to asking you to start DSH first.
- Browser mode focuses the browser and opens the DSH page; Windows has no cross-browser API to activate a specific existing tab, so it may open a new tab instead of switching to an already-open one.

## License

[MIT](./LICENSE)
