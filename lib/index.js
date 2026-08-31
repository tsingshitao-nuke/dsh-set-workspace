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
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
export const name = 'dsh-set-workspace';
export const inject = ['webServer'];
const RUNTIME_DIR = join(homedir(), '.dsh', 'dsh-set-workspace');
const RUNTIME_FILE = join(RUNTIME_DIR, 'runtime.json');
/**
 * Locate the DSH application root directory, or null when the running kernel
 * is not inside a Desktop app tree. Anchors, in priority order:
 * 1. The kernel entry `process.argv[1]` — the dsh `lib/bin.js` lives at
 *    `<app>/dsh-desktop/node_modules/@deepseek-ai/dsh/lib/bin.js`, so walking
 *    up past `dsh-desktop` yields the app root.
 * 2. `process.cwd()` — the DSH Desktop supervisor runs the kernel with
 *    cwd = `<app>/dsh-desktop`.
 * 3. The Electron layout `<app>/resources/node/node.exe`.
 * Deliberately NOT a blind upward scan from `process.execPath`: the kernel can
 * run from a system node (e.g. `D:\nodejs\node.exe`), and scanning the drive
 * root picks unrelated exes (observed: `D:\lantern-installer.exe`).
 */
function findAppRoot() {
    const bin = typeof process.argv[1] === 'string' ? process.argv[1] : '';
    if (bin && /[\\/](?:@deepseek-ai[\\/])?dsh[\\/]lib[\\/]bin\.js$/i.test(bin)) {
        let d = dirname(bin);
        for (let i = 0; i < 8; i++) {
            const name = basename(d);
            if (name === 'dsh-desktop' || name === 'resources')
                return dirname(d);
            if (name === 'node_modules' || name === 'lib' || name === 'bin' || name === 'dsh' || name.startsWith('@')) {
                d = dirname(d);
                continue;
            }
            break;
        }
    }
    try {
        const cwd = process.cwd();
        const base = cwd ? basename(cwd) : '';
        if (base === 'dsh-desktop' || base === 'resources')
            return dirname(cwd);
    }
    catch {
        /* ignore */
    }
    try {
        const nodeDir = dirname(process.execPath);
        if (basename(nodeDir) === 'node' && basename(dirname(nodeDir)) === 'resources')
            return dirname(dirname(nodeDir));
    }
    catch {
        /* ignore */
    }
    return null;
}
/**
 * Find the DSH launcher for this installation. Supported layouts:
 * - Desktop (Tauri):    `<app>/dsh-desktop/...` + `<app>/dsh-tauri-app.exe`
 * - Desktop (Electron): `<app>/resources/node/node.exe` + `<app>/<AppName>.exe`
 * - Official CLI/npm:   the running kernel IS the `dsh` CLI — `process.argv[1]`
 *   points at `@deepseek-ai/dsh/lib/bin.js`, which we can re-launch later to
 *   boot a stopped DSH.
 * Returns `{ type: 'exe' | 'cli' | 'none', command, args }`; `command` is the
 * executable (exe path, or node for the CLI) and `args` the extra spawn args.
 */
export function findLaunch(port) {
    // 1. Desktop shell: only look inside the anchored application root — never
    //    scan a drive root or unrelated directories (see findAppRoot).
    try {
        const root = findAppRoot();
        if (root) {
            let fallback = '';
            for (const name of readdirSync(root)) {
                if (!/\.exe$/i.test(name))
                    continue;
                if (/uninstall/i.test(name))
                    continue;
                if (/^node/i.test(name))
                    continue;
                const full = join(root, name);
                if (/dsh-tauri-app/i.test(name))
                    return { type: 'exe', command: full, args: [] };
                fallback ||= full;
            }
            if (fallback)
                return { type: 'exe', command: fallback, args: [] };
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