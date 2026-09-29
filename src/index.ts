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
import { homedir } from 'node:os'
import { mkdirSync, writeFileSync, readdirSync, copyFileSync, readFileSync, existsSync, openSync, readSync, closeSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-set-workspace'
export const inject = ['webServer']

const RUNTIME_DIR = join(homedir(), '.dsh', 'dsh-set-workspace')
const RUNTIME_FILE = join(RUNTIME_DIR, 'runtime.json')

/** Paths and names the official Electron Desktop build is built around. */
const ELECTRON_INSTALL_DIR_NAMES = ['dsh-desktop', 'deepseek-harness-desktop']
const ELECTRON_MAIN_BUNDLE = join('lib', 'main.js')

function isDshBinEntry(p: unknown): p is string {
  return typeof p === 'string' && /[\\/](?:@deepseek-ai[\\/])?dsh[\\/]lib[\\/]bin\.js$/i.test(p)
}

/** True when `p` is the kernel entry of the official Electron Desktop host. */
function isDesktopHostEntry(p: unknown): p is string {
  return (
    typeof p === 'string' &&
    /[\\/]node_modules[\\/]@deepseek-ai[\\/]dsh-desktop-host[\\/]lib[\\/]index\.js$/i.test(p)
  )
}

/**
 * Heuristic guard that a candidate executable belongs to DeepSeek Harness.
 * Used only with a deliberate filename allow-list; it never selects a file by
 * size or recency.
 */
function isPlausibleExeName(name: string): boolean {
  return /dsh|deepseek|harness/i.test(name) && !/uninstall|^node|setup|installer/i.test(name)
}

/**
 * Read an Electron `app.asar` directory index. The ASAR header is a
 * documented, versionless format: a pickle whose payload offset is the third
 * 32-bit word, followed by the JSON directory index and then the file payloads.
 * Returns the parsed index and the absolute offset of the payload region, or
 * null when the file is not a readable ASAR.
 */
function readAsarIndex(
  asarPath: string,
): { tree: any; baseOffset: number } | null {
  let fd: number | undefined
  try {
    fd = openSync(asarPath, 'r')
    const head = Buffer.alloc(16)
    if (readSync(fd, head, 0, 16, 0) < 16) return null
    const headerSize = head.readUInt32LE(4)
    const jsonSize = head.readUInt32LE(12)
    if (jsonSize <= 0 || jsonSize > 64 * 1024 * 1024) return null
    const raw = Buffer.alloc(jsonSize)
    if (readSync(fd, raw, 0, jsonSize, 16) < jsonSize) return null
    return { tree: JSON.parse(raw.toString('utf8')), baseOffset: 8 + headerSize }
  } catch {
    return null
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {
        /* ignore */
      }
    }
  }
}

/** Read one entry out of an ASAR index produced by `readAsarIndex`. */
function readAsarFile(
  asarPath: string,
  index: { tree: any; baseOffset: number },
  entryPath: string,
  maxBytes = 1 << 20,
): string | undefined {
  let node = index.tree
  for (const part of entryPath.split('/')) {
    node = node?.files?.[part]
    if (!node) return undefined
  }
  if (typeof node.size !== 'number' || typeof node.offset !== 'number') return undefined
  if (node.size > maxBytes) return undefined
  let fd: number | undefined
  try {
    fd = openSync(asarPath, 'r')
    const buf = Buffer.alloc(node.size)
    if (readSync(fd, buf, 0, node.size, index.baseOffset + node.offset) < node.size) return undefined
    return buf.toString('utf8')
  } catch {
    return undefined
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Read the `name`/`main` fields of the application manifest packaged in an
 * Electron `app.asar`. The manifest is located through the parsed directory
 * index (never by pattern-matching arbitrary bytes), so unrelated JSON in the
 * payload cannot be mistaken for the manifest.
 */
function readAsarManifest(asarPath: string): { name?: string; main?: string } {
  const index = readAsarIndex(asarPath)
  if (!index) return {}
  const text = readAsarFile(asarPath, index, 'package.json', 256 * 1024)
  if (!text) return {}
  try {
    const manifest = JSON.parse(text)
    return {
      name: typeof manifest?.name === 'string' ? manifest.name : undefined,
      main: typeof manifest?.main === 'string' ? manifest.main : undefined,
    }
  } catch {
    return {}
  }
}

/**
 * Locate the executable of an Electron Desktop installation whose app root
 * (`<install>/resources/app.asar`) is `root`. The application product name is
 * preferred: it comes from the packaged manifest at `resources/app.asar`
 * (`@deepseek-ai/dsh-desktop` in the official 0.2.x build), and it is turned
 * into the executable filename the installer used ("DeepSeek Harness.exe").
 */
function findElectronExe(root: string, asarPath: string): string {
  let names: string[] = []
  try {
    names = readdirSync(root)
  } catch {
    return ''
  }
  const exes = names
    .filter((n) => /\.exe$/i.test(n))
    .filter((n) => !/uninstall/i.test(n))
    .filter((n) => !/^node/i.test(n))
  if (exes.length === 0) return ''

  let product = ''
  const appName = readAsarManifest(asarPath).name ?? ''
  if (appName) {
    const leaf = appName.includes('/') ? appName.slice(appName.lastIndexOf('/') + 1) : appName
    const stripped = leaf.replace(/^dsh-/, '').replace(/^deepseek-/, '')
    product = stripped === 'desktop' ? 'deepseek harness' : stripped.replace(/-/g, ' ')
  }

  const normalize = (s: string): string =>
    s
      .toLowerCase()
      .replace(/\.exe$/, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()

  if (product) {
    const wanted = normalize(product)
    const exact = exes.find((n) => normalize(n) === wanted)
    if (exact) return join(root, exact)
    // Tolerate installer variations such as "DeepSeek Harness 0.2.0.exe".
    const extended = exes.find((n) => normalize(n).startsWith(wanted))
    if (extended) return join(root, extended)
  }

  const likely = exes.filter((n) => isPlausibleExeName(n))
  if (likely.length === 1) return join(root, likely[0])
  if (likely.length > 1) {
    // Deterministic tie-break: lexicographically first (never by size/mtime).
    return join(root, [...likely].sort()[0])
  }
  return ''
}

/**
 * Find the root of the running official Electron Desktop application. Anchors,
 * in priority order:
 * 1. The sibling `@deepseek-ai/dsh-desktop-host` entry recorded in
 *    `process.argv[1]`: the official Desktop Host spawns the kernel as
 *    `<install>/DeepSeek Harness.exe <install>/resources/app.asar/dsh/node_modules/
 *    @deepseek-ai/dsh-desktop-host/lib/index.js …`, so walking up to
 *    `resources/` yields the application root. Deliberately NOT a blind upward
 *    scan: the parent chain is verified to contain `resources/app.asar`.
 * 2. `process.execPath` for an unpackaged Electron run of the same layout.
 * 3. Per-user install registrations whose location contains a Desktop layout.
 * Returns `null` when the running DSH is not inside an Electron Desktop tree.
 */
function findElectronAppRoot(options: DetectOptions): string | null {
  const candidates: string[] = []
  const argv = options.argv ?? process.argv
  const entry = typeof argv[1] === 'string' ? argv[1] : ''
  if (entry) candidates.push(entry)
  const execPath = options.execPath ?? process.execPath
  if (execPath) candidates.push(execPath)
  for (const candidate of candidates) {
    const root = electronRootFromPath(candidate)
    if (root) return root
  }
  if (!options.skipRegistry) {
    for (const root of registeredInstallLocations()) {
      const normalized = normalizeElectronRoot(root)
      if (normalized) return normalized
    }
  }
  return null
}

/**
 * Walk up from a file path until a directory that contains
 * `resources/app.asar` is found; that directory is the Electron app root.
 */
function electronRootFromPath(filePath: string): string | null {
  let dir = ''
  try {
    dir = dirname(filePath)
  } catch {
    return null
  }
  for (let i = 0; i < 12 && dir; i++) {
    if (hasDesktopResources(dir)) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

function hasDesktopResources(dir: string): boolean {
  return existsSync(join(dir, 'resources', 'app.asar'))
}

/** Accept a registered path (install directory or application exe). */
function normalizeElectronRoot(pathLike: string): string | null {
  if (!pathLike || !existsSync(pathLike)) return null
  let dir = pathLike
  if (/\.exe$/i.test(pathLike)) {
    const fromFile = electronRootFromPath(pathLike)
    return fromFile || null
  }
  if (hasDesktopResources(dir)) return dir
  // Some registrations point one level above the app directory.
  try {
    for (const name of readdirSync(dir)) {
      const child = join(dir, name)
      if (hasDesktopResources(child)) return child
    }
  } catch {
    /* ignore */
  }
  return null
}

/**
 * Per-user/global install registrations for a DeepSeek Harness application.
 * The official NSIS installer records `DisplayIcon` (the application exe) and
 * `UninstallString` even when it omits `InstallLocation`, so all three values
 * are collected and validated by the caller. Registry access is best-effort:
 * a missing `reg.exe` or a non-Windows host yields an empty list.
 */
function registeredInstallLocations(): string[] {
  if (process.platform !== 'win32') return []
  const roots = [
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ]
  const found: string[] = []
  const push = (value: string): void => {
    const trimmed = value.trim().replace(/^"|"$/g, '')
    if (trimmed && !found.includes(trimmed)) found.push(trimmed)
  }
  try {
    for (const root of roots) {
      const r = spawnSync('reg.exe', ['query', root, '/s', '/f', 'DeepSeek Harness', '/d'], {
        encoding: 'utf8',
        windowsHide: true,
      })
      if (r.status !== 0 || !r.stdout) continue
      for (const line of r.stdout.split(/\r?\n/)) {
        const location = /InstallLocation\s+REG_SZ\s+(.+)$/i.exec(line.trim())
        if (location) {
          push(location[1])
          continue
        }
        const icon = /DisplayIcon\s+REG_SZ\s+(.+)$/i.exec(line.trim())
        if (icon) {
          push(icon[1].replace(/,\d+$/, ''))
          continue
        }
        const uninstall = /UninstallString\s+REG_SZ\s+(.+)$/i.exec(line.trim())
        if (uninstall) {
          const exe = /^"?([^"]+\.exe)"?/i.exec(uninstall[1].trim())
          if (exe) push(exe[1])
        }
      }
    }
  } catch {
    /* ignore */
  }
  return found
}

/**
 * Locate the legacy Tauri Desktop shell (`<root>/dsh-desktop` + an exe) or, as
 * the last resort, any plausible DSH executable at `root`. Returns '' when the
 * directory holds nothing that looks like a launchable DSH application.
 */
function findDesktopExeAt(root: string): string {
  if (!root || !existsSync(root)) return ''
  let names: string[]
  try {
    names = readdirSync(root)
  } catch {
    return ''
  }
  const exes = names.filter((n) => /\.exe$/i.test(n) && !/uninstall|^node|setup|installer/i.test(n))
  const tauri = exes.find((n) => /dsh-tauri-app/i.test(n))
  if (tauri) return join(root, tauri)
  const plausible = exes.filter((n) => isPlausibleExeName(n))
  if (plausible.length === 1) return join(root, plausible[0])
  if (plausible.length > 1) return join(root, [...plausible].sort()[0])
  return ''
}

export type LaunchKind = 'exe' | 'cli' | 'none'

export interface Launch {
  type: LaunchKind
  command: string
  args: string[]
  /** Where the launcher came from — useful in logs and runtime.json diagnostics. */
  source?:
    | 'electron-desktop-host'
    | 'electron-registry'
    | 'electron-exec-path'
    | 'tauri-desktop'
    | 'exe-scan'
    | 'cli'
    | 'none'
  /** Application root of the detected installation, when one was identified. */
  installLocation?: string
  /** Display/product name of the detected application, when one was identified. */
  productName?: string
}

interface DetectOptions {
  argv?: string[]
  execPath?: string
  /** Skip Windows install-registry discovery (used by tests for determinism). */
  skipRegistry?: boolean
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
export function findLaunch(port: number, options: DetectOptions = {}): Launch {
  // 1. Electron Desktop (official build). Recognized from the running kernel's
  //    own arguments, then from the running executable, then from the per-user
  //    install registry. Only layout-verified directories are accepted.
  const electronRoot = findElectronAppRoot(options)
  if (electronRoot) {
    const exe = findElectronExe(electronRoot, join(electronRoot, 'resources', 'app.asar'))
    if (exe) {
      const source = isDesktopHostEntry((options.argv ?? process.argv)[1])
        ? 'electron-desktop-host'
        : hasDesktopResources(dirname((options.execPath ?? process.execPath) || ''))
          ? 'electron-exec-path'
          : 'electron-registry'
      return {
        type: 'exe',
        command: exe,
        args: [],
        source,
        installLocation: electronRoot,
        productName: basename(exe).replace(/\.exe$/i, ''),
      }
    }
  }

  // 2. Legacy Tauri Desktop shell inside a layout-verified application root.
  const legacyRoot = findTauriAppRoot(options)
  if (legacyRoot) {
    const exe = findDesktopExeAt(legacyRoot)
    if (exe) {
      return {
        type: 'exe',
        command: exe,
        args: [],
        source: 'tauri-desktop',
        installLocation: legacyRoot,
        productName: basename(exe).replace(/\.exe$/i, ''),
      }
    }
  }

  // 3. Official CLI/npm install: re-launch the same entry the kernel was
  //    started from, so a stopped DSH can be booted again (same invocation the
  //    DSH Desktop supervisor uses: `node bin.js web --no-open --host ...`).
  const argv = options.argv ?? process.argv
  if (isDshBinEntry(argv[1])) {
    const args = [argv[1], 'web', '--no-open', '--host', '127.0.0.1']
    if (port > 0) args.push('--port', String(port))
    return { type: 'cli', command: options.execPath ?? process.execPath, args, source: 'cli' }
  }

  return { type: 'none', command: '', args: [], source: 'none' }
}

/**
 * Legacy Tauri Desktop root: the kernel runs from
 * `<app>/dsh-desktop/...`, and the shell exe sits next to `dsh-desktop`.
 * `process.cwd()` is the Desktop supervisor's working directory for that build.
 */
function findTauriAppRoot(options: DetectOptions): string | null {
  const argv = options.argv ?? process.argv
  const entry = typeof argv[1] === 'string' ? argv[1] : ''
  if (entry) {
    let d = dirname(entry)
    for (let i = 0; i < 8; i++) {
      const nm = basename(d)
      if (nm === 'dsh-desktop' || nm === 'resources') return dirname(d)
      if (nm === 'node_modules' || nm === 'lib' || nm === 'bin' || nm === 'dsh' || nm.startsWith('@')) {
        d = dirname(d)
        continue
      }
      break
    }
  }
  try {
    const cwd = process.cwd()
    const base = cwd ? basename(cwd) : ''
    if (base === 'dsh-desktop' || base === 'resources') return dirname(cwd)
  } catch {
    /* ignore */
  }
  try {
    const execPath = options.execPath ?? process.execPath
    const nodeDir = dirname(execPath)
    if (basename(nodeDir) === 'node' && basename(dirname(nodeDir)) === 'resources') {
      return dirname(dirname(nodeDir))
    }
  } catch {
    /* ignore */
  }
  return null
}

function publishRuntime(ctx: any, port: number): void {
  try {
    const actualPort = typeof port === 'number' && port > 0 ? port : 0
    const launch = findLaunch(actualPort)
    mkdirSync(RUNTIME_DIR, { recursive: true })
    writeFileSync(
      RUNTIME_FILE,
      JSON.stringify(
        {
          host: '127.0.0.1',
          port: actualPort,
          // Profile that owns this host. When a web host and a desktop host run
          // side by side, the bridge uses it to prefer the desktop instance.
          profile: process.env.DSH_PROFILE || '',
          execPath: process.execPath,
          launchType: launch.type,
          launchCommand: launch.command,
          launchArgs: launch.args,
          launchSource: launch.source,
          // Consumed by the bridge when it must re-discover a moved or
          // upgraded installation (app root, product/process name).
          ...(launch.installLocation ? { installLocation: launch.installLocation } : {}),
          ...(launch.productName ? { productName: launch.productName } : {}),
          cwd: process.cwd(),
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf8',
    )
    // Keep the standalone bridge in sync: upgrading the bundle must also
    // upgrade the copy the Explorer menu invokes (it lives outside the bundle).
    const pkg = join(dirname(fileURLToPath(import.meta.url)), '..')
    copyFileSync(join(pkg, 'bin', 'set-workspace.cjs'), join(RUNTIME_DIR, 'set-workspace.cjs'))
  } catch (error) {
    ctx.logger?.warn?.(`dsh-set-workspace: cannot write runtime.json: ${String(error)}`)
  }
}

export function apply(ctx: any): void {
  const port = ctx.webServer?.port
  if (typeof port === 'number' && port > 0) {
    // The webserver is initialized before this plugin (declared in `inject`),
    // so its port is already known here. Write it once; every boot rewrites it.
    publishRuntime(ctx, port)
    return
  }
  // Some hosts boot the application before the listener is bound. Retry
  // asynchronously so a slow start still publishes a usable runtime file.
  let attempts = 0
  const timer = setInterval(() => {
    attempts += 1
    const late = ctx.webServer?.port
    if (typeof late === 'number' && late > 0) {
      clearInterval(timer)
      publishRuntime(ctx, late)
      return
    }
    if (attempts >= 20) {
      clearInterval(timer)
      ctx.logger?.warn?.('dsh-set-workspace: webserver port unavailable; runtime.json not updated')
    }
  }, 500)
  timer.unref?.()
  ctx.effect?.(
    () => () => clearInterval(timer),
    'dsh-set-workspace: runtime publish retry',
  )
}
