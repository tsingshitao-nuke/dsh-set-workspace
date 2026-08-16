/**
 * dsh-set-workspace — host half.
 *
 * A Windows shell integration for DSH: right-click a folder in File Explorer
 * and pick "设为 DSH 工作区" to register it as a workspace. This host plugin
 * has a single job — publish the live webserver port to a well-known runtime
 * file so the standalone shell bridge (bin/set-workspace.cjs) can discover
 * the API endpoint without hardcoding a port.
 *
 * The actual workspace registration rides the EXISTING `workspace.create`
 * RPC (already served over /api), so this plugin adds no storage, no schema,
 * and no new tools — it only bridges the OS shell to the running host.
 * @module dsh-set-workspace
 */
import { homedir } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export const name = 'dsh-set-workspace';
export const inject = ['webServer'];
const RUNTIME_DIR = join(homedir(), '.dsh', 'dsh-set-workspace');
const RUNTIME_FILE = join(RUNTIME_DIR, 'runtime.json');
function publishRuntime(ctx) {
    try {
        const port = ctx.webServer?.port;
        mkdirSync(RUNTIME_DIR, { recursive: true });
        writeFileSync(RUNTIME_FILE, JSON.stringify({
            host: '127.0.0.1',
            port: typeof port === 'number' && port > 0 ? port : 0,
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