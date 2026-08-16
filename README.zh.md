# dsh-set-workspace

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 插件：提供 **Codex 风格的文件树**，并支持**右键文件夹 →「设为工作区」**。

在文件树中右键任意文件夹，即可将其注册为 DSH 工作区（复用内置工作区浏览器使用的同一套持久化注册表）。不新增存储、不新增 schema——直接通过官方 `ctx.workspaces` 客户端服务调用核心 `workspaceRegistry`。

## 功能

- 悬浮文件树，根目录为当前会话工作目录（依次回退到最近工作区、主目录）。
- 右键文件夹（或根目录）弹出菜单：
  - **设为工作区** — 将该目录注册进工作区注册表（幂等）。
  - **在新会话中打开** — 注册后在该工作区打开一个新会话。
  - **复制路径** — 复制绝对路径到剪贴板。
- 已是工作区的文件夹显示 `WS` 徽标。
- 在侧边栏底部（左侧栏）新增一个开关按钮，用于开/关面板。
- 通过 DSH 设计令牌适配浅色/深色主题；中/英文文案。

## 安装

这是一个 **bundle** 插件，可通过两种方式安装到 DSH profile：

### 手动（通用）

```bash
npm pack          # 生成 dsh-set-workspace-0.1.0.tgz
```

将 `.tgz` 安装进 profile 的 `bundles`，并把包名加入 profile `package.json` 的 `dependencies` 与 `bundles` 数组（或使用运行时超级模组注入器 `dev_install_package` / `dev_inject_plugin` 指定本目录）。

### 从源码 / 注入器

```bash
npm install       # 开发依赖：typescript + tsdown
npm run build     # host tsc + tsdown client bundle -> lib/
```

## 环境要求

- Node >= 20
- 一个运行中的 DSH web profile，提供 `workspaces`、`sessions`、`slots` 客户端服务与 `@deepseek-ai/dsh-client-ui-primitives` 模块。

## 工作原理

host 侧（`src/index.ts`）为空实现；全部逻辑在客户端插件（`src/client/index.tsx`）中：

1. 向 `sidebar.footer.action` 插槽注册开关按钮。
2. 将悬浮面板挂载到独立的 React root。
3. 通过 `ctx.workspaces.listDirectory`（官方 browse 能力）逐层列出目录，展开时懒加载子目录。
4. 「设为工作区」调用 `ctx.workspaces.create({ path })` —— 与内置工作区选择器走同一条 RPC。

## License

MIT
