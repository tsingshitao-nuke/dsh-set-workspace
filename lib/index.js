/**
 * dsh-set-workspace — host half.
 *
 * A Windows shell integration for DSH: right-click a folder in File Explorer
 * and pick "在此处打开 DSH 工作区" to register it as a workspace, start a
 * session in it, and switch the DSH page to it. This host plugin publishes a
 * runtime file that the standalone shell bridge (bin/set-workspace.cjs) uses
 * to discover (a) the loopback API port and (b) how to launch DSH when it is
 * not running.
 * @module dsh-set-workspace
 */
import { homedir } from 'node:os';
import { mkdirSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
export const name = 'dsh-set-workspace';
export const inject = ['webServer'];
const RUNTIME_DIR = join(homedir(), '.dsh', 'dsh-set-workspace');
const RUNTIME_FILE = join(RUNTIME_DIR, 'runtime.json');
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
export function findLaunch(port) {
    // 1. Desktop shell: walk upward from the running node, take the first app exe
    //    (never node.exe / uninstall.exe); the Tauri launcher is preferred.
    try {
        let dir = dirname(process.execPath);
        for (let hops = 0; hops < 10; hops++) {
            let fallback = '';
            for (const name of readdirSync(dir)) {
                if (!/\.exe$/i.test(name))
                    continue;
                if (/uninstall/i.test(name))
                    continue;
                if (/^node/i.test(name))
                    continue;
                const full = join(dir, name);
                if (/dsh-tauri-app/i.test(name))
                    return { type: 'exe', command: full, args: [] };
                fallback ||= full;
            }
            if (fallback)
                return { type: 'exe', command: fallback, args: [] };
            const parent = dirname(dir);
            if (parent === dir)
                break;
            dir = parent;
        }
    }
    catch {
        /* no desktop shell */
    }
    // 2. Official CLI/npm install: re-launch the same entry the kernel was
    //    started from, so a stopped DSH can be booted again (same invocation the
    //    DSH Desktop supervisor uses: `node bin.js web --no-open --host ...`).
    try {
        const bin = typeof process.argv[1] === 'string' ? process.argv[1] : '';
        if (bin && /[\\/](?:@deepseek-ai[\\/])?dsh[\\/]lib[\\/]bin\.js$/i.test(bin)) {
            const args = [bin, 'web', '--no-open', '--host', '127.0.0.1'];
            if (port > 0)
                args.push('--port', String(port));
            return { type: 'cli', command: process.execPath, args };
        }
    }
    catch {
        /* fall through */
    }
    return { type: 'none', command: '', args: [] };
}
function publishRuntime(ctx) {
    try {
        const port = ctx.webServer?.port;
        const actualPort = typeof port === 'number' && port > 0 ? port : 0;
        const launch = findLaunch(actualPort);
        mkdirSync(RUNTIME_DIR, { recursive: true });
        writeFileSync(RUNTIME_FILE, JSON.stringify({
            host: '127.0.0.1',
            port: actualPort,
            execPath: process.execPath,
            launchType: launch.type,
            launchCommand: launch.command,
            launchArgs: launch.args,
            cwd: process.cwd(),
            updatedAt: new Date().toISOString(),
        }, null, 2), 'utf8');
        // Keep the standalone bridge in sync: upgrading the bundle must also
        // upgrade the copy the Explorer menu invokes (it lives outside the bundle).
        const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
        copyFileSync(join(pkg, 'bin', 'set-workspace.cjs'), join(RUNTIME_DIR, 'set-workspace.cjs'));
    }
    catch (error) {
        ctx.logger?.warn?.(`dsh-set-workspace: cannot write runtime.json: ${String(error)}`);
    }
}
export function apply(ctx) {
    // The webserver is initialized before this plugin (declared in `inject`),
    // so its port is already known here. Write it once; a restart rewrites it.
    publishRuntime(ctx);
}
//# sourceMappingURL=index.js.map