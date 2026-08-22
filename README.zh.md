# dsh-set-workspace

给 Windows 文件管理器加一个右键菜单：右键文件夹，选 **"在此处打开 DSH 工作区"**，即可把它注册为 DSH 工作区、在其中开启会话，并把 DSH 页面切换到该工作区。

非官方社区项目，与 DeepSeek 无关联、未获其背书。

[English](./README.md)

## 功能

- 在文件管理器里右键文件夹，选择"在此处打开 DSH 工作区"。
- 若 DSH 未运行，桥接脚本会拉起它（桌面版拉起应用，官方 CLI/npm 安装则拉起 `dsh web`）；若已在运行（即使最小化或在后台），DSH 窗口会被恢复并置前。
- 文件夹被注册为工作区（幂等），并在其中开启一个会话。
- DSH 页面自动切到新工作区（客户端半部分监听该会话并打开它，无需刷新页面）。
- 若你是在普通浏览器里看 DSH（而非桌面窗口），用 `--browser` 安装，桥接脚本会改为聚焦浏览器页面。
- 菜单与弹窗文案跟随系统 UI 语言（中文 / 英文）。
- 动作经 `wscript` 隐藏窗口启动器运行，不闪黑框。
- 菜单项使用 DSH 鲸鱼图标。
- 不新增存储、schema 或工具——复用核心工作区注册表与既有 `/api` RPC。

## 安装

环境要求：Windows、`PATH` 里有 Node.js >= 20、以及一个 DSH 安装——DSH Desktop 或官方 CLI（`npm i -g @deepseek-ai/dsh`）。DSH 未运行时桥接脚本会自动拉起；其启动路径来自 DSH 写出的运行时文件，因此首次使用前需先运行一次 DSH。

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
            ├─ 启动 DSH Desktop 应用——未运行则启动；已运行则由应用自带的
            │  单实例 second-instance 处理器恢复、显示并聚焦其窗口
            │  （与 VS Code「通过 Code 打开」同款机制）
            ├─ 轮询等待 /api 就绪
            ├─ POST /api/workspace.create { path }          （幂等）
            ├─ POST /api/session.create  { workspaceId, sessionId: "dsw-open-…" }
            └─ MessageBox 确认

DSH 客户端半部分监听会话列表，打开该 "dsw-open-…" 会话，页面即切到该工作区。

浏览器模式：若你是在普通浏览器里访问 DSH，安装时加 `--browser`
（或手动写 `{"ui":"browser"}` 到 ~/.dsh/dsh-set-workspace/config.json），
桥接脚本会改为通过回环 URL 聚焦浏览器页面，而不是桌面窗口。
```

本 bundle 是标准的 host/client 双半结构 DSH 包。host 半部分（`src/index.ts`）把当前 webserver 端口与桌面启动命令写到 `~/.dsh/dsh-set-workspace/runtime.json`；客户端半部分（`src/client/index.ts`）负责切换。桥接脚本、鲸鱼图标与启动器复制到 `~/.dsh/dsh-set-workspace/`（无空格、重装后仍稳定的目录）；注册表项位于 `HKCU\Software\Classes\Directory\shell`（无需管理员权限）。

## 兼容性

- **DSH Desktop（Tauri / Electron）**：host 记录应用可执行文件；桥接脚本启动它来拉起 DSH，已运行时由应用自带的单实例处理器恢复并聚焦窗口（VS Code「通过 Code 打开」同款机制）。
- **官方 CLI / npm 安装**（`npm i -g @deepseek-ai/dsh`，DSH 在浏览器里访问）：host 记录 `dsh web` 启动命令（即当前内核所用的同一个 node + `lib/bin.js`，带 `--no-open --host 127.0.0.1 --port <端口>`）；桥接脚本在 DSH 未运行时用它自举启动，并通过浏览器页面聚焦——无需桌面窗口。
- 启动方式在 host 每次启动时重新探测，同一插件可自适应你升级到的任意安装形态。

## 构建

```sh
npm install
npm run build   # host（tsc）+ client（tsdown -> lib/client.js）
```

## 已知限制

- Windows 11 下，第三方 `Directory\shell` 项可能出现在"显示更多选项"（Shift+F10）而非顶级菜单。要放到顶级需 COM `IContextMenu` 处理器，本插件未提供。
- 桥接脚本经回环地址访问 host。host 未运行时会自动拉起；但若 DSH 从未运行过（没有记录启动路径），则回退为提示你先手动启动 DSH。
- 浏览器模式会聚焦浏览器并打开 DSH 页面；Windows 没有跨浏览器「激活某个已存在标签页」的 API，因此可能新开一个标签页而不是切到已有的那个。

## License

[MIT](./LICENSE)
