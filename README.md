# dsh-set-workspace

Adds a Windows File Explorer context menu entry: right-click a folder and pick **"Open DSH Workspace Here"** to register it as a DSH workspace, start a session in it, and switch the DSH page to that workspace.

Unofficial community project. Not affiliated with or endorsed by DeepSeek.

[中文说明](./README.zh.md)

## What it does

- Right-click a folder in File Explorer, then choose **Open DSH Workspace Here**.
- If DSH is not running, the bridge launches it — the official **DeepSeek Harness** Desktop app, the legacy Tauri DSH Desktop, or the official `dsh` CLI; if it is running (even minimized or hidden in the tray), the window is restored and brought to the front.
- The folder is registered as a workspace (idempotent) and a session is started in it.
- The DSH page switches to the new workspace automatically (the client half watches for the session and opens it — no page reload).
- If you view DSH in a regular browser instead of the Desktop window, install with `--browser`; the bridge then focuses the browser page.
- Menu label and dialogs follow the OS UI language (Chinese / English).
- The action runs through a `wscript` hidden-window launcher, so no console window flashes.
- The menu item uses the DSH whale icon.
- No new storage, schema, or tools — it reuses the core workspace registry and the existing `/api` RPCs.

## Install

Requirements: Windows, Node.js >= 20 on `PATH`, and a DSH installation — the **official DeepSeek Harness Desktop app**, the legacy Tauri DSH Desktop, or the official CLI (`npm i -g @deepseek-ai/dsh`). The bridge launches DSH automatically when it is not running; it discovers the launch path from a runtime file that DSH writes, so run DSH once before the first use.

One-liner (PowerShell 5.1+ / pwsh):

```powershell
irm https://raw.githubusercontent.com/tsingshitao-nuke/dsh-set-workspace/main/scripts/install.ps1 | iex
```

Git Bash / WSL:

```sh
curl -fsSL https://raw.githubusercontent.com/tsingshitao-nuke/dsh-set-workspace/main/scripts/install.sh | bash
```

The installer adds the bundle to **every** DSH profile it finds. The official Desktop app runs the `desktop` profile (`~/.dsh/profiles/desktop`) and `dsh web` runs `web`; both may exist side by side, and the context menu works for whichever one is running.

Manual install (official Desktop app):

```sh
# 1. install the bundle into the desktop profile
dsh plugin --profile desktop add github:tsingshitao-nuke/dsh-set-workspace

# 2. register the Explorer context menu, then restart DSH so the host half
#    publishes its port
node ~/.dsh/profiles/desktop/node_modules/dsh-set-workspace/bin/install-context-menu.cjs
```

Manual install (`dsh web` profile): same commands with `--profile web` and the `web` path.

Remove the menu (keeps the bundle installed):

```sh
node ~/.dsh/profiles/desktop/node_modules/dsh-set-workspace/bin/install-context-menu.cjs --uninstall
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
            ├─ probes the loopback ports (recorded, other profiles, live DSH
            │  listeners, 19387/3080) and calls the one that answers
            ├─ POST   /api/workspace/create { request: { path } }   (idempotent)
            ├─ POST   /api/session/create  { workspaceId, sessionId: "dsw-open-…" }
            └─ MessageBox confirmation

The DSH client half watches the session list, opens the "dsw-open-…" session,
and the page switches to the workspace.
```

The bundle is a standard host/client dual-half DSH package. The host half (`src/index.ts`) writes the current webserver port and the Desktop launch command to `~/.dsh/dsh-set-workspace/runtime.json`. The client half (`src/client/index.ts`) performs the switch. The bridge script, whale icon, and launcher are copied to `~/.dsh/dsh-set-workspace/` (space-free, stable across reinstalls); the registry entries live under `HKCU\Software\Classes\Directory\shell` (no admin rights).

## Compatibility

- **Official DeepSeek Harness Desktop (Electron, `deepseek-ai/deepseek-harness` → `apps/desktop`)**: the app ships its runtime inside `resources/app.asar` and starts it as a child process (`…/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js`). The host half recognizes that layout from the running kernel's own arguments, falls back to the running executable, and finally to the Windows install registration (`DisplayIcon`/`InstallLocation`/`UninstallString`), and records `<install>\DeepSeek Harness.exe`. Launching that exe again boots DSH when it is down; when it is already running, the app's `requestSingleInstanceLock` + `second-instance` handler (Electron's standard VS Code-style behavior) restores, shows and focuses its window. The app defaults to port `19387`.
- **Legacy DSH Desktop (Tauri)**: `<app>/dsh-desktop/...` + `<app>/dsh-tauri-app.exe` is still detected and launched the same way.
- **Official CLI / npm install** (`npm i -g @deepseek-ai/dsh`, DSH served into a browser): the host records the `dsh web` launch command (the same node + `lib/bin.js` the running kernel uses, with `--no-open --host 127.0.0.1 --port <port>`); the bridge boots DSH through it when it is down and focuses the browser page — no desktop window required.
- **Stale runtime files self-heal**: the recorded port and launcher both go stale when you upgrade or move an installation (for example from a removed Tauri folder to the official Electron build). The bridge then re-discovers the live loopback port and looks for the current installation again — a `config.json` override (`{"launch":{"exe":"…"}}`), a live Desktop process, the recorded install location, the Windows registration, or a sibling of the previous launcher.
- The launcher type is re-detected every time the host starts, so the same plugin adapts to whichever install you upgrade to.

## Build

```sh
npm install
npm run build        # host (tsc) + client (tsdown -> lib/client.js)
npm run typecheck
npm test             # launch-detection + README tests (Node 22+, uses --experimental-strip-types)
npm run test:bridge  # optional: end-to-end bridge run against a live DSH host
```

## Known limitations

- On Windows 11, third-party `Directory\shell` verbs may appear under "Show more options" (Shift+F10) instead of the top-level menu. Putting them at the top level requires a COM `IContextMenu` handler, which this plugin does not ship.
- The bridge talks to the host over loopback. It launches DSH when the host is down, but if DSH has never run (so no launch path is recorded), it falls back to asking you to start DSH first.
- The Desktop app hides its window instead of quitting; the context menu reuses the app's single-instance focus, and `dsh://open` remains the app's own way to raise the window.
- Browser mode focuses the browser and opens the DSH page; Windows has no cross-browser API to activate a specific existing tab, so it may open a new tab instead of switching to an already-open one.

## License

[MIT](./LICENSE)
