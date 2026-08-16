# dsh-set-workspace

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：给 **Windows 文件管理器**加一个**右键菜单**——右键文件夹 → **「设为 DSH 工作区」** → 该文件夹即被注册为运行中 DSH 的工作区。

不新增存储、不新增 schema、不新增工具——直接复用内置工作区选择器所用的 `workspace.create` RPC，工作区立即出现在 DSH 中，并与 UI 创建的工作区完全一致地持久化。

## 工作原理

```
文件管理器右键
  └─ 执行  node set-workspace.cjs "<文件夹>"
       ├─ 读取  ~/.dsh/dsh-set-workspace/runtime.json   （端口，由 host 插件发布）
       └─ POST   http://127.0.0.1:<端口>/api/workspace.create { path }
```

1. **host 侧**（`src/index.ts`）把当前 webserver 端口发布到 `~/.dsh/dsh-set-workspace/runtime.json`。
2. **右键菜单**（HKCU 注册表）运行独立的**桥接脚本**（`bin/set-workspace.cjs`）。
3. 桥接脚本调用 host 既有的 `/api/workspace.create` 端点（幂等——对同一文件夹重复执行会返回已有工作区）。

## 安装

1. 把本 bundle 装进你的 DSH profile（dependencies + bundles），例如用运行时超级模组注入器的 `dev_install_package`，或在 profile 的 `package.json` 加入 `dsh-set-workspace`。
2. 重启 DSH（让 host 侧发布 `runtime.json`）。
3. 注册文件管理器右键菜单：

```bash
node <package>/bin/install-context-menu.cjs
```

卸载：

```bash
node <package>/bin/install-context-menu.cjs --uninstall
```

桥接脚本与鲸鱼图标会被复制到 `~/.dsh/dsh-set-workspace/`（无空格的稳定目录），因此注册表项在包重装后依然有效。

## 环境要求

- Windows（右键菜单走 HKCU `Directory\shell`，无需管理员权限）
- `PATH` 中有 Node >= 20
- 运行中的 DSH web host（桥接脚本访问其回环 `/api` 端点）

## 备注

- Windows 11 下，第三方 `Directory\shell` 项可能出现在 **「显示更多选项」**（Shift+F10）里，而非顶级菜单。
- 图标为 DSH 鲸鱼吉祥物（`assets/dsh-whale.ico`，取自应用自带的品牌图标）。

## License

MIT
