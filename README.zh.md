# dsh-set-workspace

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件，给 **Windows 文件管理器**加一个**右键菜单**：

> **在此处打开 DSH 工作区** —— 右键文件夹 → 注册为工作区、在其中开启会话、并把 **DSH 页面切换到该工作区**。

不新增存储、不新增 schema、不新增工具——直接复用内置选择器所用的 `workspace.create` + `session.create` RPC。菜单文案中英自适应（跟随系统 UI 语言），动作经 `wscript` 隐藏窗口启动器运行，**不再闪黑框**。

## 工作原理

```
文件管理器右键
  └─ wscript launch-hidden.vbs "%1"          （隐藏窗口）
       └─ node set-workspace.cjs "<文件夹>"
            ├─ 读 ~/.dsh/dsh-set-workspace/runtime.json   （端口，由 host 插件发布）
            ├─ POST /api/workspace.create { path }          （幂等）
            ├─ POST /api/session.create  { workspaceId, sessionId: "dsw-open-…" }
            └─ MessageBox 确认
```

`dsw-open-` 会话 id 就是「切换」信号：**客户端半部分**（`src/client/index.ts`）监听会话列表并对该会话执行 `open()`，DSH 页面随即切到新工作区。

## 安装

1. 把本 bundle 装进你的 DSH profile（dependencies + bundles），例如用运行时超级模组注入器的 `dev_install_package`。
2. 重启 DSH（让 host 侧发布 `runtime.json`）。
3. 注册文件管理器右键菜单：

```bash
node <package>/bin/install-context-menu.cjs
```

卸载：

```bash
node <package>/bin/install-context-menu.cjs --uninstall
```

桥接脚本、鲸鱼图标与隐藏启动器会复制到 `~/.dsh/dsh-set-workspace/`（无空格、重装后仍稳定的目录）。

## 环境要求

- Windows（HKCU `Directory\shell`，无需管理员权限）
- `PATH` 中有 Node >= 20
- 运行中的 DSH web host

## 备注

- Windows 11 下，第三方 `Directory\shell` 项可能出现在 **「显示更多选项」**（Shift+F10）里。
- 图标为 DSH 鲸鱼吉祥物（`assets/dsh-whale.ico`）。
- 菜单文案：**「在此处打开 DSH 工作区」**（中）/ **"Open DSH Workspace Here"**（英）。

## License

MIT
