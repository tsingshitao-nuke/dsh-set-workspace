export declare const name = "dsh-set-workspace";
export declare const inject: string[];
/**
 * Find the DSH launcher for this installation. Supported layouts:
 * - Desktop (Tauri):    `<app>/dsh-desktop/vendor/node/node.exe` + `<app>/dsh-tauri-app.exe`
 * - Desktop (Electron): `<app>/resources/node/node.exe` + `<app>/<AppName>.exe`
 * - Official CLI/npm:   the running kernel IS the `dsh` CLI — `process.argv[1]`
 *   points at `@deepseek-ai/dsh/lib/bin.js`, which we can re-launch later to
 *   boot a stopped DSH.
 * Returns `{ type: 'exe' | 'cli' | 'none', command, args }`; `command` is the
 * executable (exe path, or node for the CLI) and `args` the extra spawn args.
 */
export declare function findLaunch(port: number): {
    type: 'exe' | 'cli' | 'none';
    command: string;
    args: string[];
};
export declare function apply(ctx: any): void;
