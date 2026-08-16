# dsh-set-workspace

Adds a Windows File Explorer context menu entry: right-click a folder and pick **"Open DSH Workspace Here"** to register it as a DSH workspace, start a session in it, and switch the DSH page to that workspace.

Unofficial community project. Not affiliated with or endorsed by DeepSeek.

[中文说明](./README.zh.md)

## What it does

- Right-click a folder in File Explorer, then choose **Open DSH Workspace Here**.
- The folder is registered as a workspace (idempotent) and a session is started in it.
- The DSH page switches to the new workspace automatically (the client half watches for the session and opens it — no page reload).
- Menu label and dialogs follow the OS UI language (Chinese / English).
- The action runs through a `wscript` hidden-window launcher, so no console window flashes.
- The menu item uses the DSH whale icon.
- No new storage, schema, or tools — it reuses the core workspace registry and the existing `/api` RPCs.

## Install

Requirements: Windows, a running `dsh web`, Node.js >= 20 on `PATH`.

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
            ├─ reads  ~/.dsh/dsh-set-workspace/runtime.json   (port, published by the host half)
            ├─ POST   /api/workspace.create { path }          (idempotent)
            ├─ POST   /api/session.create  { workspaceId, sessionId: "dsw-open-…" }
            └─ MessageBox confirmation

The DSH client half watches the session list, opens the "dsw-open-…" session,
and the page switches to the workspace.
```

The bundle is a standard host/client dual-half DSH package. The host half (`src/index.ts`) writes the current webserver port to `~/.dsh/dsh-set-workspace/runtime.json`. The client half (`src/client/index.ts`) performs the switch. The bridge script, whale icon, and launcher are copied to `~/.dsh/dsh-set-workspace/` (space-free, stable across reinstalls); the registry entries live under `HKCU\Software\Classes\Directory\shell` (no admin rights).

## Build

```sh
npm install
npm run build   # host (tsc) + client (tsdown -> lib/client.js)
```

## Known limitations

- On Windows 11, third-party `Directory\shell` verbs may appear under "Show more options" (Shift+F10) instead of the top-level menu. Putting them at the top level requires a COM `IContextMenu` handler, which this plugin does not ship.
- The bridge talks to the host over loopback, so DSH must be running.

## License

[MIT](./LICENSE)
