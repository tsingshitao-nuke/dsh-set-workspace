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
import { mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
export const name = 'dsh-set-workspace';
export const inject = ['webServer'];
const RUNTIME_DIR = join(homedir(), '.dsh', 'dsh-set-workspace');
const RUNTIME_FILE = join(RUNTIME_DIR, 'runtime.json');
/**
 * Find the Electron app executable that launched this node host. The DSH
 * Desktop layout is `<app>/resources/node/node.exe` with the GUI at
 * `<app>/<AppName>.exe`, so we walk three levels up and pick the app exe.
 * Returns an empty string when the heuristic does not apply.
 */
function findLauncher() {
    try {
        const appRoot = dirname(dirname(dirname(process.execPath)));
        const conventional = join(appRoot, basename(appRoot) + '.exe');
        if (statSync(conventional).isFile())
            return conventional;
        for (const name of readdirSync(appRoot)) {
            if (name.toLowerCase().endsWith('.exe') && !name.toLowerCase().includes('uninstall')) {
                return join(appRoot, name);
            }
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