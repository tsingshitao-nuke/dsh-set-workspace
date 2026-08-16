# dsh-set-workspace

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that adds a **Windows File Explorer right-click menu**: right-click a folder → **"设为 DSH 工作区" (Set as DSH workspace)** → the folder is registered as a workspace in the running DSH host.

No new storage, no schema, no new tools — it rides the existing `workspace.create` RPC that the built-in workspace picker already uses, so the workspace appears in DSH immediately and persists exactly like one created from the UI.

## How it works

```
File Explorer right-click
  └─ runs  node set-workspace.cjs "<folder>"
       ├─ reads  ~/.dsh/dsh-set-workspace/runtime.json   (port, published by the host plugin)
       └─ POST   http://127.0.0.1:<port>/api/workspace.create { path }
```

1. The **host half** (`src/index.ts`) publishes the live webserver port to `~/.dsh/dsh-set-workspace/runtime.json`.
2. The **context menu** (HKCU registry) runs the standalone **bridge** (`bin/set-workspace.cjs`).
3. The bridge calls the host's existing `/api/workspace.create` endpoint (idempotent — re-running for the same folder returns the existing workspace).

## Install

1. Install the bundle into your DSH profile (dependencies + bundles), e.g. with the runtime super-injector's `dev_install_package`, or by adding `dsh-set-workspace` to the profile `package.json`.
2. Restart DSH (so the host half publishes `runtime.json`).
3. Register the Explorer menu:

```bash
node <package>/bin/install-context-menu.cjs
```

To remove it:

```bash
node <package>/bin/install-context-menu.cjs --uninstall
```

The bridge script and the whale icon are copied to `~/.dsh/dsh-set-workspace/` (a space-free, stable location), so the registry entries survive package reinstalls.

## Requirements

- Windows (the context menu is HKCU `Directory\shell`, no admin rights needed)
- Node >= 20 in `PATH`
- A running DSH web host (the bridge talks to its loopback `/api` endpoint)

## Notes

- On Windows 11, third-party `Directory\shell` verbs may appear under **"Show more options"** (Shift+F10) rather than the top-level menu.
- The icon is the DSH whale mascot (`assets/dsh-whale.ico`, copied from the app's own brand icon).

## License

MIT
