# dsh-set-workspace

给 Windows 文件管理器加一个右键菜单：右键文件夹，选 **"在此处打开 DSH 工作区"**，即可把它注册为 DSH 工作区、在其中开启会话，并把 DSH 页面切换到该工作区。

非官方社区项目，与 DeepSeek 无关联、未获其背书。

[English](./README.md)

## 功能

- 在文件管理器里右键文件夹，选择"在此处打开 DSH 工作区"。
- 若 DSH 未运行，桥接脚本会先拉起它并等待就绪，再打开工作区。
- 文件夹被注册为工作区（幂等），并在其中开启一个会话。
- DSH 页面自动切到新工作区（客户端半部分监听该会话并打开它，无需刷新页面）。
- 菜单与弹窗文案跟随系统 UI 语言（中文 / 英文）。
- 动作经 `wscript` 隐藏窗口启动器运行，不闪黑框。
- 菜单项使用 DSH 鲸鱼图标。
- 不新增存储、schema 或工具——复用核心工作区注册表与既有 `/api` RPC。

## 安装

环境要求：Windows、`PATH` 里有 Node.js >= 20、已安装 DSH Desktop。DSH 未运行时桥接脚本会自动拉起；其启动路径来自 DSH 写出的运行时文件，因此首次使用前需先运行一次 DSH。

一键安装（PowerShell 5.1+ / pwsh）：

```powershell
irm https://raw.githubusercontent.com/tsingshitao-nuke/dsh-set-workspace/main/scripts/install.ps1 | iex
```

Git Bash / WSL：

```sh
curl -fsSL https://raw.githubusercontent.com/tsingshitao-nuke/dsh-set-workspace/main/scripts/install.sh | bash
```

手动安装：

```sh
# 1. 安装 bundle
dsh plugin --profile web add github:tsingshitao-nuke/dsh-set-workspace

# 2. 注册文件管理器右键菜单（先重启 DSH，让 host 半部分发布端口）
node ~/.dsh/profiles/web/node_modules/dsh-set-workspace/bin/install-context-menu.cjs
```

移除菜单（保留 bundle）：

```sh
node ~/.dsh/profiles/web/node_modules/dsh-set-workspace/bin/install-context-menu.cjs --uninstall
```

## 工作原理

```
文件管理器右键
  └─ wscript launch-hidden.vbs "%1"           （隐藏窗口）
       └─ node set-workspace.cjs "<文件夹>"
            ├─ 读  ~/.dsh/dsh-set-workspace/runtime.json   （端口 + 启动命令）
            ├─ 若 DSH 未运行：拉起它，轮询等待 /api 就绪
            ├─ POST /api/workspace.create { path }          （幂等）
            ├─ POST /api/session.create  { workspaceId, sessionId: "dsw-open-…" }
            └─ MessageBox 确认

DSH 客户端半部分监听会话列表，打开该 "dsw-open-…" 会话，页面即切到该工作区。
```

本 bundle 是标准的 host/client 双半结构 DSH 包。host 半部分（`src/index.ts`）把当前 webserver 端口写到 `~/.dsh/dsh-set-workspace/runtime.json`；客户端半部分（`src/client/index.ts`）负责切换。桥接脚本、鲸鱼图标与启动器复制到 `~/.dsh/dsh-set-workspace/`（无空格、重装后仍稳定的目录）；注册表项位于 `HKCU\Software\Classes\Directory\shell`（无需管理员权限）。

## 构建

```sh
npm install
npm run build   # host（tsc）+ client（tsdown -> lib/client.js）
```

## 已知限制

- Windows 11 下，第三方 `Directory\shell` 项可能出现在"显示更多选项"（Shift+F10）而非顶级菜单。要放到顶级需 COM `IContextMenu` 处理器，本插件未提供。
- 桥接脚本经回环地址访问 host。host 未运行时会自动拉起；但若 DSH 从未运行过（没有记录启动路径），则回退为提示你先手动启动 DSH。

## License

[MIT](./LICENSE)
