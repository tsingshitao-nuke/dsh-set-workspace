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
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
export const name = 'dsh-set-workspace';
export const inject = ['webServer'];
const RUNTIME_DIR = join(homedir(), '.dsh', 'dsh-set-workspace');
const RUNTIME_FILE = join(RUNTIME_DIR, 'runtime.json');
/**
 * Find the DSH Desktop launcher executable that owns this node host. Layouts:
 * - Electron: `<app>/resources/node/node.exe` with the GUI at `<app>/<AppName>.exe`
 * - Tauri:    `<app>/dsh-desktop/vendor/node/node.exe` with the GUI at `<app>/dsh-tauri-app.exe`
 * We walk upward from the running node and return the first application exe
 * (never node.exe / uninstall.exe); the Tauri launcher is preferred because it
 * is the current app shell. Returns an empty string when no launcher is found.
 */
function findLauncher() {
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
                    return full;
                fallback ||= full;
            }
            if (fallback)
                return fallback;
            const parent = dirname(dir);
            if (parent === dir)
                break;
            dir = parent;
        }
    }
    catch {
        /* fall through */
    }
    return '';
}
function publishRuntime(ctx) {
    try {
        const port = ctx.webServer?.port;
        mkdirSync(RUNTIME_DIR, { recursive: true });
        writeFileSync(RUNTIME_FILE, JSON.stringify({
            host: '127.0.0.1',
            port: typeof port === 'number' && port > 0 ? port : 0,
            execPath: process.execPath,
            launchCommand: findLauncher(),
            cwd: process.cwd(),
            updatedAt: new Date().toISOString(),
        }, null, 2), 'utf8');
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