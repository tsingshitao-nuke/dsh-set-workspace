# dsh-set-workspace

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that adds a **Windows File Explorer right-click menu**:

> **Open DSH Workspace Here** — right-click a folder → register it as a workspace, start a session in it, and **switch the DSH page to it**.

No new storage, no schema, no new tools — it rides the existing `workspace.create` + `session.create` RPCs that the built-in picker already uses. The menu label is localized (zh / en, following the OS UI language), and the action runs through a `wscript` launcher so **no console window flashes**.

## How it works

```
File Explorer right-click
  └─ wscript launch-hidden.vbs "%1"          (hidden window)
       └─ node set-workspace.cjs "<folder>"
            ├─ reads ~/.dsh/dsh-set-workspace/runtime.json   (port, published by the host plugin)
            ├─ POST /api/workspace.create { path }           (idempotent)
            ├─ POST /api/session.create  { workspaceId, sessionId: "dsw-open-…" }
            └─ MessageBox confirmation
```

The `dsw-open-` session id is the switch signal: the **client half** (`src/client/index.ts`) watches the session list and `open()`s that session, so the DSH page navigates to the new workspace immediately.

## Install

1. Install the bundle into your DSH profile (dependencies + bundles), e.g. with the runtime super-injector's `dev_install_package`.
2. Restart DSH (so the host half publishes `runtime.json`).
3. Register the Explorer menu:

```bash
node <package>/bin/install-context-menu.cjs
```

Remove it:

```bash
node <package>/bin/install-context-menu.cjs --uninstall
```

The bridge, the whale icon, and the hidden launcher are copied to `~/.dsh/dsh-set-workspace/` (space-free, stable across reinstalls).

## Requirements

- Windows (HKCU `Directory\shell`, no admin rights needed)
- Node >= 20 in `PATH`
- A running DSH web host

## Notes

- On Windows 11, third-party `Directory\shell` verbs may appear under **"Show more options"** (Shift+F10).
- The icon is the DSH whale mascot (`assets/dsh-whale.ico`).
- Menu label: **"在此处打开 DSH 工作区"** (zh) / **"Open DSH Workspace Here"** (en).

## License

MIT
