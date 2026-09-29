export declare const name = "dsh-set-workspace";
export declare const inject: string[];
export type LaunchKind = 'exe' | 'cli' | 'none';
export interface Launch {
    type: LaunchKind;
    command: string;
    args: string[];
    /** Where the launcher came from — useful in logs and runtime.json diagnostics. */
    source?: 'electron-desktop-host' | 'electron-registry' | 'electron-exec-path' | 'tauri-desktop' | 'exe-scan' | 'cli' | 'none';
    /** Application root of the detected installation, when one was identified. */
    installLocation?: string;
    /** Display/product name of the detected application, when one was identified. */
    productName?: string;
}
interface DetectOptions {
    argv?: string[];
    execPath?: string;
    /** Skip Windows install-registry discovery (used by tests for determinism). */
    skipRegistry?: boolean;
}
/**
 * Find the DSH launcher for this installation. Supported layouts:
 * - Official Desktop (Electron): `<app>/DeepSeek Harness.exe` +
 *   `<app>/resources/app.asar` (the running kernel is the sibling
 *   `@deepseek-ai/dsh-desktop-host` entry). Launching this exe again boots DSH
 *   when it is down, and when it is already running the app's own
 *   `requestSingleInstanceLock` / `second-instance` handler restores and
 *   focuses the window.
 * - Legacy Desktop (Tauri):    `<app>/dsh-desktop/...` + `<app>/dsh-tauri-app.exe`
 * - Official CLI/npm:          the running kernel IS the `dsh` CLI —
 *   `process.argv[1]` points at `@deepseek-ai/dsh/lib/bin.js`, which we can
 *   re-launch later to boot a stopped DSH.
 * Returns `{ type: 'exe' | 'cli' | 'none', command, args }`; `command` is the
 * executable (exe path, or node for the CLI) and `args` the extra spawn args.
 */
export declare function findLaunch(port: number, options?: DetectOptions): Launch;
export declare function apply(ctx: any): void;
export {};
