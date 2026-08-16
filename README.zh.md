# dsh-set-workspace

> 在 Windows 文件管理器里右键文件夹 → **在此处打开 DSH 工作区**。

<div align="center">
  <a href="https://opensource.org/licenses/MIT"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg" /></a>
  <img alt="Windows 文件管理器右键菜单" src="https://img.shields.io/badge/Windows-资源管理器右键菜单-4d6bfe" />
  <img alt="中 / 英" src="https://img.shields.io/badge/lang-zh%2Fen-4d6bfe" /><br /><br />
  🌏 <a href="./README.md"><b>English</b></a> · <a href="./README.zh.md">中文</a>
</div>

**非官方社区项目。与 DeepSeek 无关联、未获其背书或维护。**

一个原生 DSH web 插件（不是浏览器扩展），只加一个资源管理器右键项：右键任意文件夹 → 把它注册为工作区、在其中开启会话，并把 **DSH 页面切换到该工作区**——全程走官方 `workspace.create` / `session.create` RPC，工作区出现与持久化方式和 UI 里创建的一模一样。

## ✨ 功能

- 🖱️ **右键文件夹** →「在此处打开 DSH 工作区」。
- 🗂️ **注册工作区**（幂等——重复执行返回已有工作区）并在其中**开启会话**。
- 🎯 **DSH 页面自动切换**到新工作区（客户端半部分监听该会话并 `open()`，无需刷新页面）。
- 🌏 **中英自适应**——菜单与弹窗跟随系统 UI 语言（`在此处打开 DSH 工作区` / `Open DSH Workspace Here`）。
- 🐳 菜单项带 **DSH 鲸鱼吉祥物**图标。
- 👻 **不闪黑框**——动作经 `wscript` 隐藏窗口启动器运行。
- 🪶 **零新增存储 / schema / 工具**——复用核心工作区注册表与既有 `/api` RPC。

## 🚀 安装

**前置**：Windows、`dsh web` 能正常运行、`PATH` 里有 Node.js ≥ 20。

### 一键（PowerShell 5.1+ / pwsh）

```powershell
irm https://raw.githubusercontent.com/tsingshitao-nuke/dsh-set-workspace/main/scripts/install.ps1 | iex
```

Git Bash / WSL：

```sh
curl -fsSL https://raw.githubusercontent.com/tsingshitao-nuke/dsh-set-workspace/main/scripts/install.sh | bash
```

### 手动

```sh
# ① 安装 bundle
dsh plugin --profile web add github:tsingshitao-nuke/dsh-set-workspace

# ② 注册文件管理器右键菜单（先重启 DSH，让 host 半部分发布端口）
node ~/.dsh/profiles/web/node_modules/dsh-set-workspace/bin/install-context-menu.cjs
```

移除菜单（保留 bundle）：

```sh
node ~/.dsh/profiles/web/node_modules/dsh-set-workspace/bin/install-context-menu.cjs --uninstall
```

<details>
<summary><b>从本地克隆安装（开发）</b></summary>

```sh
git clone https://github.com/tsingshitao-nuke/dsh-set-workspace.git
cd dsh-set-workspace && npm install && npm run build
dsh plugin --profile web add link:../dsh-set-workspace
node ~/.dsh/profiles/web/node_modules/dsh-set-workspace/bin/install-context-menu.cjs
```

</details>

## 🔍 工作原理

```
文件管理器右键
  └─ wscript launch-hidden.vbs "%1"           （隐藏窗口——不闪黑框）
       └─ node set-workspace.cjs "<文件夹>"
            ├─ 读  ~/.dsh/dsh-set-workspace/runtime.json   （端口，由 host 半部分发布）
            ├─ POST /api/workspace.create { path }          （幂等）
            ├─ POST /api/session.create  { workspaceId, sessionId: "dsw-open-…" }
            └─ MessageBox 确认

DSH 客户端半部分监听会话列表 → open() 该 "dsw-open-…" 会话 → 页面切到该工作区
```

本 bundle 是标准的 **host/client 双半结构** DSH 包：host 半部分（`src/index.ts`）把当前 webserver 端口发布到 `~/.dsh/dsh-set-workspace/runtime.json`；客户端半部分（`src/client/index.ts`）负责切换。桥接脚本（`bin/set-workspace.cjs`）、鲸鱼图标与启动器复制到 `~/.dsh/dsh-set-workspace/`（无空格、重装后仍稳定的目录），注册表项位于 `HKCU\Software\Classes\Directory\shell`（无需管理员权限）。

## ⚙️ 开发与构建

```sh
npm install        # 开发依赖：typescript + tsdown（+ @types/node）
npm run build      # host（tsc）+ client（tsdown -> lib/client.js）
```

client bundle 必须以 `window.__ModuleLoader__.load` 注册 `dsh-set-workspace` 并导出 `{ apply, inject }`。

## ⚠️ 已知限制

- **Windows 11**：第三方 `Directory\shell` 项可能出现在 **「显示更多选项」**（Shift+F10）而非顶级菜单。要提到顶级需 COM `IContextMenu` 处理器（较重，暂未提供）。
- 桥接脚本经回环地址访问 host——DSH 需处于运行中。

## 📦 发布

```sh
npm pack   # -> dsh-set-workspace-<version>.tgz（作为 GitHub Release 附件上传）
```

## License

[MIT](./LICENSE)
