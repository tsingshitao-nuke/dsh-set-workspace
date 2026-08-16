# dsh-set-workspace

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web plugin that adds a **Codex-style file tree** with a right-click **"Set as workspace"** action on folders.

Right-click any folder in the tree → register it as a DSH workspace (the same durable registry the built-in workspace browser uses). No new storage, no schema — it reuses the core `workspaceRegistry` through the official `ctx.workspaces` client service.

## Features

- Floating file tree rooted at the current session's working directory (falls back to the recent workspace, then home).
- Right-click a folder (or the root) for a context menu:
  - **Set as workspace** — register the folder in the workspace registry (idempotent).
  - **Open in new session** — register + open a new session in that workspace.
  - **Copy path** — copy the absolute path to the clipboard.
- Folders that are already workspaces show a `WS` badge.
- A toggle button is added to the sidebar footer (left rail) to open/close the panel.
- Light/dark theme via the DSH design tokens; zh/en copy.

## Install

This is a **bundle** plugin. Two ways to install it into a DSH profile:

### Manual (works anywhere)

```bash
npm pack          # produces dsh-set-workspace-0.1.0.tgz
```

Then install the `.tgz` into your profile's `bundles` and add the package name to the profile `package.json` `dependencies` + `bundles` array (or use the runtime super-injector: `dev_install_package` / `dev_inject_plugin` with the package directory).

### From source / injector

```bash
npm install       # dev deps: typescript + tsdown
npm run build     # host tsc + tsdown client bundle -> lib/
```

## Requirements

- Node >= 20
- A running DSH web profile that provides the client services `workspaces`, `sessions`, `slots`, and the `@deepseek-ai/dsh-client-ui-primitives` module.

## How it works

The host half (`src/index.ts`) is a no-op; everything is a client plugin (`src/client/index.tsx`) that:

1. Registers a toggle button into the `sidebar.footer.action` slot.
2. Mounts a floating panel into its own React root.
3. Lists one directory level at a time through `ctx.workspaces.listDirectory` (the official browse capability) and lazily loads children on expand.
4. Calls `ctx.workspaces.create({ path })` on "Set as workspace" — the exact RPC the built-in workspace picker uses.

## License

MIT
