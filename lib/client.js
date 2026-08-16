window.__ModuleLoader__.load({
	id: "dsh-set-workspace",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		let react_dom_client = require("react-dom/client");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/i18n.ts
		const zh = {
			title: "文件树",
			toggle: "文件树",
			root: "工作区根目录",
			setWorkspace: "设为工作区",
			openSession: "在新会话中打开",
			copyPath: "复制路径",
			refresh: "刷新",
			close: "关闭",
			loading: "加载中…",
			empty: "（空目录）",
			error: "加载失败",
			alreadyWorkspace: "已是工作区",
			setWorkspaceDone: "已设为工作区",
			copied: "已复制"
		};
		const en = {
			title: "File Tree",
			toggle: "File Tree",
			root: "Workspace root",
			setWorkspace: "Set as workspace",
			openSession: "Open in new session",
			copyPath: "Copy path",
			refresh: "Refresh",
			close: "Close",
			loading: "Loading…",
			empty: "(empty directory)",
			error: "Load failed",
			alreadyWorkspace: "Workspace",
			setWorkspaceDone: "Set as workspace",
			copied: "Copied"
		};
		function detectLang() {
			if (typeof document !== "undefined") {
				if ((document.documentElement.getAttribute("lang") || "").toLowerCase().startsWith("zh")) return "zh";
			}
			if (typeof navigator !== "undefined" && (navigator.language || "").toLowerCase().startsWith("zh")) return "zh";
			return "en";
		}
		function tr(lang) {
			return (key) => lang === "zh" ? zh[key] : en[key];
		}
		//#endregion
		//#region src/client/store.ts
		let state = { open: false };
		const listeners = /* @__PURE__ */ new Set();
		const panelStore = {
			getSnapshot: () => state,
			subscribe: (listener) => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			},
			toggle: () => {
				state = { open: !state.open };
				for (const listener of listeners) listener();
			},
			close: () => {
				if (!state.open) return;
				state = { open: false };
				for (const listener of listeners) listener();
			}
		};
		//#endregion
		//#region src/client/panel.tsx
		function basename(path) {
			const trimmed = path.replace(/[\\/]+$/, "");
			const at = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
			return at === -1 ? trimmed : trimmed.slice(at + 1);
		}
		function normPath(path) {
			let value = path.replace(/\\/g, "/").replace(/\/+$/, "");
			if (typeof navigator !== "undefined" && /win/i.test(navigator.userAgent)) value = value.toLowerCase();
			return value;
		}
		function SetWorkspacePanel({ workspaces, sessions }) {
			const t = tr(detectLang());
			const open = (0, react.useSyncExternalStore)(panelStore.subscribe, panelStore.getSnapshot).open;
			const wsSnap = (0, react.useSyncExternalStore)((cb) => workspaces.list.subscribe(cb), () => workspaces.list.getSnapshot());
			const sessSnap = (0, react.useSyncExternalStore)((cb) => sessions.list.subscribe(cb), () => sessions.list.getSnapshot());
			const [root, setRoot] = (0, react.useState)(null);
			const [expanded, setExpanded] = (0, react.useState)(() => /* @__PURE__ */ new Set());
			const [data, setData] = (0, react.useState)({});
			const [menu, setMenu] = (0, react.useState)(null);
			const [toast, setToast] = (0, react.useState)(null);
			const dataRef = (0, react.useRef)({});
			const seqRef = (0, react.useRef)(0);
			const toastTimer = (0, react.useRef)(null);
			const workspacePaths = (0, react.useMemo)(() => {
				const set = /* @__PURE__ */ new Set();
				for (const w of wsSnap.items ?? []) set.add(normPath(w.path));
				return set;
			}, [wsSnap]);
			const showToast = (0, react.useCallback)((msg) => {
				setToast(msg);
				if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
				toastTimer.current = window.setTimeout(() => setToast(null), 2400);
			}, []);
			const load = (0, react.useCallback)((dir) => {
				if (dataRef.current[dir] !== void 0) return;
				dataRef.current = {
					...dataRef.current,
					[dir]: {}
				};
				setData(dataRef.current);
				const seq = ++seqRef.current;
				workspaces.listDirectory(dir, void 0).then((listing) => {
					if (seq !== seqRef.current) return;
					dataRef.current = {
						...dataRef.current,
						[dir]: { entries: listing.entries ?? [] }
					};
					setData(dataRef.current);
				}).catch((error) => {
					if (seq !== seqRef.current) return;
					dataRef.current = {
						...dataRef.current,
						[dir]: { error: error?.message ?? String(error) }
					};
					setData(dataRef.current);
				});
			}, [workspaces]);
			(0, react.useEffect)(() => {
				const s = sessSnap;
				const current = s.current;
				const cwd = current != null ? s.byId?.[current]?.cwd : void 0;
				if (cwd) {
					setRoot(cwd);
					return;
				}
				const w = wsSnap;
				const recent = (w.items ?? []).find((x) => x.workspaceId === w.recentWorkspaceId);
				if (recent) {
					setRoot(recent.path);
					return;
				}
				if (root === null) workspaces.listDirectory(void 0, void 0).then((listing) => setRoot(listing.path)).catch(() => {});
			}, [
				sessSnap,
				wsSnap,
				workspaces,
				root
			]);
			(0, react.useEffect)(() => {
				if (root === null) return;
				seqRef.current += 1;
				dataRef.current = {};
				setData({});
				setExpanded(/* @__PURE__ */ new Set([root]));
				load(root);
			}, [root, load]);
			const toggleDir = (0, react.useCallback)((dir) => {
				setExpanded((prev) => {
					const next = new Set(prev);
					if (next.has(dir)) {
						next.delete(dir);
						return next;
					}
					next.add(dir);
					load(dir);
					return next;
				});
			}, [load]);
			const refresh = (0, react.useCallback)(() => {
				if (root === null) return;
				seqRef.current += 1;
				dataRef.current = {};
				setData({});
				load(root);
			}, [root, load]);
			const openMenu = (0, react.useCallback)((event, path) => {
				event.preventDefault();
				event.stopPropagation();
				setMenu({
					path,
					x: event.clientX,
					y: event.clientY
				});
			}, []);
			const onMenuSelect = (0, react.useCallback)((id) => {
				const target = menu;
				if (!target) return;
				setMenu(null);
				if (id === "copy") {
					(0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(target.path);
					showToast(t("copied"));
					return;
				}
				if (id === "set" || id === "open") workspaces.create({ path: target.path }).then((w) => {
					if (id === "open") workspaces.startSession(w.workspaceId);
					else showToast(`${t("setWorkspaceDone")}: ${w.title}`);
				}).catch((error) => showToast(error?.message ?? String(error)));
			}, [
				menu,
				workspaces,
				showToast,
				t
			]);
			const renderRow = (entry, depth) => {
				const isOpen = expanded.has(entry.path);
				const isWorkspace = workspacePaths.has(normPath(entry.path));
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsw-row",
					style: { paddingLeft: depth * 16 + 8 },
					role: "button",
					tabIndex: 0,
					title: entry.path,
					onClick: () => toggleDir(entry.path),
					onKeyDown: (event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							toggleDir(entry.path);
						}
					},
					onContextMenu: (event) => openMenu(event, entry.path),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsw-chevron",
							children: isOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { size: 12 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, { size: 12 })
						}),
						isOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpen16, { size: 14 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderClose16, { size: 14 }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsw-name",
							children: entry.name
						}),
						isWorkspace && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsw-badge",
							title: t("alreadyWorkspace"),
							children: "WS"
						})
					]
				}), isOpen && renderLevel(entry.path, depth + 1)] }, entry.path);
			};
			const renderLevel = (dir, depth) => {
				const level = data[dir];
				if (level === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsw-row dsw-muted",
					style: { paddingLeft: depth * 16 + 8 },
					children: t("loading")
				});
				if (level.error !== void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsw-row dsw-error",
					style: { paddingLeft: depth * 16 + 8 },
					children: [
						t("error"),
						": ",
						level.error
					]
				});
				const entries = [...level.entries ?? []].sort((a, b) => a.name.localeCompare(b.name));
				if (entries.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsw-row dsw-muted",
					style: { paddingLeft: depth * 16 + 8 },
					children: t("empty")
				});
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: entries.map((entry) => renderRow(entry, depth)) });
			};
			if (!open) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsw-panel",
				role: "dialog",
				"aria-label": t("title"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsw-header",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsw-title",
								children: t("title")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsw-iconbtn",
								title: t("refresh"),
								onClick: refresh,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, { size: 14 })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsw-iconbtn",
								title: t("close"),
								onClick: () => panelStore.close(),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, { size: 14 })
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsw-body",
						children: root === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsw-row dsw-muted",
							children: t("loading")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsw-row dsw-root",
							role: "button",
							tabIndex: 0,
							title: root,
							onClick: () => toggleDir(root),
							onContextMenu: (event) => openMenu(event, root),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsw-chevron",
									children: expanded.has(root) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { size: 12 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, { size: 12 })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpen16, { size: 14 }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsw-name",
									children: basename(root)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsw-rootlabel",
									children: t("root")
								})
							]
						}), expanded.has(root) && renderLevel(root, 1)] })
					}),
					toast !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsw-toast",
						role: "status",
						children: toast
					})
				]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
				open: menu !== null,
				onClose: () => setMenu(null),
				items: [
					{
						id: "set",
						label: t("setWorkspace"),
						icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconProjectAddOutline16, { size: 14 })
					},
					{
						id: "open",
						label: t("openSession"),
						icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconNewChatOutline16, { size: 14 })
					},
					{
						id: "copy",
						label: t("copyPath"),
						icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, { size: 14 })
					}
				],
				onSelect: onMenuSelect,
				portal: true,
				align: "start",
				getAnchorRect: () => menu === null ? null : new DOMRect(menu.x, menu.y, 0, 0),
				anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {})
			})] });
		}
		//#endregion
		//#region src/client/styles.ts
		/**
		* Inline styles injected once into `document.head`. Uses the DSH design-token
		* CSS variables (light/dark themed) with sensible fallbacks so the panel
		* matches the surrounding UI without any external stylesheet.
		*/
		const CSS = `
.dsw-panel{position:fixed;top:68px;right:16px;z-index:9990;width:320px;max-width:calc(100vw - 32px);max-height:calc(100vh - 96px);display:flex;flex-direction:column;background:var(--dsw-alias-bg-module-platform,#ffffff);color:var(--dsw-alias-label-primary,#1f2328);border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.18);overflow:hidden;font-size:13px;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2,rgba(0,0,0,.12))}
.dsw-header{display:flex;align-items:center;gap:2px;padding:10px 10px 8px 14px;border-bottom:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.08));flex:none}
.dsw-title{font-size:13px;font-weight:600;flex:1}
.dsw-iconbtn{cursor:pointer;width:26px;height:26px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#57606a);display:inline-flex;align-items:center;justify-content:center}
.dsw-iconbtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.dsw-body{overflow:auto;padding:4px 0;flex:1;min-height:0}
.dsw-row{display:flex;align-items:center;gap:5px;padding:3px 10px;line-height:20px;cursor:pointer;border-radius:6px;margin:1px 6px;white-space:nowrap;user-select:none}
.dsw-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.dsw-chevron{flex:none;display:inline-flex;color:var(--dsw-alias-label-tertiary,#8b949e)}
.dsw-name{overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.dsw-badge{flex:none;font-size:10px;line-height:1;padding:2px 5px;border-radius:4px;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.08));color:var(--dsw-alias-label-secondary,#57606a);letter-spacing:.02em}
.dsw-root{font-weight:600}
.dsw-rootlabel{flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary,#8b949e)}
.dsw-muted{color:var(--dsw-alias-label-tertiary,#8b949e);cursor:default}
.dsw-error{color:#e5484d;cursor:default}
.dsw-toast{position:absolute;left:12px;right:12px;bottom:12px;padding:8px 12px;border-radius:8px;background:var(--dsw-alias-label-primary,#1f2328);color:var(--dsw-alias-bg-module-platform,#fff);font-size:12px;box-shadow:0 6px 20px rgba(0,0,0,.2);pointer-events:none}
.dsw-toggle{cursor:pointer;border:none;background:transparent;color:var(--dsw-alias-label-secondary,#57606a);display:inline-flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;font-size:13px}
.dsw-toggle:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.dsw-toggle[aria-pressed="true"]{color:var(--dsw-alias-label-primary,#1f2328)}
.dsw-toggle-label{white-space:nowrap}
`;
		let installed = false;
		function ensureStyles() {
			if (installed || typeof document === "undefined") return;
			installed = true;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-set-workspace";
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region src/client/index.tsx
		const inject = [
			"workspaces",
			"sessions",
			"slots"
		];
		const MOUNT_ID = "dsh-set-workspace-root";
		/** Sidebar footer toggle button (native `sidebar.footer.action` list slot). */
		function FooterToggleButton({ wide }) {
			const t = tr(detectLang());
			const open = (0, react.useSyncExternalStore)(panelStore.subscribe, panelStore.getSnapshot).open;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: "dsw-toggle",
				"aria-pressed": open,
				title: t("toggle"),
				onClick: () => panelStore.toggle(),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
					width: "14",
					height: "14",
					viewBox: "0 0 16 16",
					fill: "none",
					"aria-hidden": "true",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M1.5 3.5a1 1 0 0 1 1-1h3.2a1 1 0 0 1 .7.3l.9.9h5.2a1.5 1.5 0 0 1 1.5 1.5v5.3a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 1.5 10V3.5Z",
						stroke: "currentColor",
						strokeWidth: "1.1",
						strokeLinejoin: "round"
					})
				}), wide ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dsw-toggle-label",
					children: t("toggle")
				}) : null]
			});
		}
		function apply(ctx) {
			if (typeof window === "undefined" || typeof document === "undefined") return;
			ensureStyles();
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "dsh-set-workspace",
				order: 50
			}, FooterToggleButton));
			ctx.effect(() => {
				if (document.getElementById(MOUNT_ID)) return;
				const host = document.createElement("div");
				host.id = MOUNT_ID;
				document.body.appendChild(host);
				const root = (0, react_dom_client.createRoot)(host);
				root.render(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SetWorkspacePanel, {
					workspaces: ctx.workspaces,
					sessions: ctx.sessions
				}));
				return () => {
					root.unmount();
					host.remove();
				};
			}, "dsh-set-workspace: panel");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map