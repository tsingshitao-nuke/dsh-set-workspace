#!/usr/bin/env node
/**
 * dsh-set-workspace shell bridge.
 *
 * "Open DSH Workspace Here": registers a folder as a DSH workspace, starts a
 * session in it (session id carries a `dsw-open-` prefix so the DSH client
 * auto-switches to it), and reports the result in a MessageBox.
 *
 * Focus strategy (mirrors VS Code's "Open with Code"): launching the DSH
 * Desktop executable always puts the UI in front — when DSH is down it boots,
 * and when it is already running the app's own single-instance handler
 * (`requestSingleInstanceLock` + `second-instance`, used by both the official
 * Electron Desktop and the legacy Tauri shell) restores + shows + focuses its
 * window from inside the app process, which is immune to the Windows
 * foreground lock.
 *
 * When DSH is served into a regular browser instead, set
 * ~/.dsh/dsh-set-workspace/config.json to { "ui": "browser" } (or install
 * with --browser); the bridge then focuses the browser page via the loopback
 * URL instead of the Desktop window.
 *
 * Self-healing: the runtime file is written by the host plugin of whichever
 * DSH build last ran. When that build was replaced (for example an old Tauri
 * "DSH Desktop" folder upgraded to the official Electron "DeepSeek Harness"),
 * the recorded port and executable are both stale. The bridge therefore
 * re-discovers the live loopback port and, when the recorded launcher is gone,
 * finds the installed application again.
 *
 * Usage: node set-workspace.cjs <folder-path>
 */
'use strict'

const { homedir } = require('node:os')
const { readFileSync, existsSync, readdirSync } = require('node:fs')
const { join, dirname, basename } = require('node:path')
const { createHash, createHmac } = require('node:crypto')
const { spawn, spawnSync } = require('node:child_process')

const path = process.argv[2]
if (!path) {
  console.error('usage: node set-workspace.cjs <folder-path>')
  process.exit(2)
}

const DEST = join(homedir(), '.dsh', 'dsh-set-workspace')
const RUNTIME_FILE = join(DEST, 'runtime.json')
const CONFIG_FILE = join(DEST, 'config.json')
const CREDENTIALS_FILE = join(homedir(), '.dsh', '.credentials.yaml')
const PROFILES_DIR = join(homedir(), '.dsh', 'profiles')
const LAUNCH_TIMEOUT_MS = 90_000
const POLL_MS = 1500
/** Ports tried after the recorded one: DSH Web (3080) and Desktop (19387). */
const DEFAULT_PORTS = [3080, 19387]

// ---------------------------------------------------------------------------
// Web API authentication. The loopback API is protected by a browser-session
// cookie: GET /?token=<launchToken> mints it in a browser, but the launch token
// lives only in the app process memory. The bridge instead re-mints the cookie
// itself from the signing secret the app stores in ~/.dsh/.credentials.yaml
// under `client-connection/browser-session` — the cookie payload is
// `v1.<base64url(json)>.<hmac-sha256>` with name `dsh-auth-<sha256(authority)>`
// (authority = `127.0.0.1:<port>`). The secret is shared by every DSH build in
// the same home, which lets the bridge probe several ports.
// Pre-auth builds have no credentials file and their API is open; the bridge
// then sends no cookie and keeps working.
// ---------------------------------------------------------------------------

function encodeB64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

/** Read the browser-session signing secret from the credential store. */
function readAuthSecret() {
  try {
    const text = readFileSync(CREDENTIALS_FILE, 'utf8')
    const lines = text.split(/\r?\n/)
    let inRecord = false
    for (const line of lines) {
      const trimmed = line.trim()
      if (!inRecord && trimmed === 'client-connection/browser-session:') {
        inRecord = true
        continue
      }
      if (inRecord && trimmed.startsWith('secret:')) return trimmed.slice('secret:'.length).trim() || undefined
    }
  } catch {}
  return undefined
}

let AUTH_SECRET

/** Mint a valid browser-session cookie for the loopback API ('' when pre-auth). */
function authCookie(port) {
  if (AUTH_SECRET === undefined) AUTH_SECRET = readAuthSecret()
  const secret = AUTH_SECRET
  if (!secret) return ''
  try {
    const authority = `127.0.0.1:${port}`
    const name = 'dsh-auth-' + encodeB64Url(createHash('sha256').update(authority).digest())
    const now = Date.now()
    const payload = { version: 1, authority, issuedAt: now, expiresAt: now + 60 * 60 * 1000 }
    const body = encodeB64Url(Buffer.from(JSON.stringify(payload), 'utf8'))
    const key = Buffer.from(secret.replaceAll('-', '+').replaceAll('_', '/'), 'base64')
    const sig = encodeB64Url(createHmac('sha256', key).update(body).digest())
    return `${name}=v1.${body}.${sig}`
  } catch {
    return ''
  }
}

function detectLang() {
  if (process.env.DSW_LANG === 'zh' || process.env.DSW_LANG === 'en') return process.env.DSW_LANG
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale || ''
    return loc.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  } catch {
    return 'en'
  }
}

const T = {
  zh: {
    okTitle: '已打开 DSH 工作区',
    okBody: (title, p) => `${title}\n${p}`,
    failTitle: '打开 DSH 工作区失败',
    failBody: (p, msg) => `${p}\n\n${msg}`,
    unreachable: (port, msg) => `无法连接 DSH（端口 ${port}）。\n请先启动 DSH。\n\n${msg}`,
    launchTimeout: 'DSH 已启动，但等待其就绪超时。请稍后再试。',
    staleLaunch: (cmd) => `记录的 DSH 启动程序不存在：\n${cmd}\n请先启动 DSH，再重试。`,
  },
  en: {
    okTitle: 'DSH Workspace Opened',
    okBody: (title, p) => `${title}\n${p}`,
    failTitle: 'Failed to Open DSH Workspace',
    failBody: (p, msg) => `${p}\n\n${msg}`,
    unreachable: (port, msg) => `Cannot reach DSH (port ${port}).\nStart DSH first.\n\n${msg}`,
    launchTimeout: 'DSH was launched, but timed out waiting for it to become ready. Try again shortly.',
    staleLaunch: (cmd) => `The recorded DSH launcher no longer exists:\n${cmd}\nStart DSH once, then retry.`,
  },
}[detectLang()]

function readJson(file, fallback) {
  try {
    return { ...fallback, ...JSON.parse(readFileSync(file, 'utf8')) }
  } catch {
    return fallback
  }
}

function readRuntime() {
  const rt = readJson(RUNTIME_FILE, {})
  const hasCommand = typeof rt.launchCommand === 'string' && rt.launchCommand !== ''
  return {
    port: Number.isInteger(rt.port) && rt.port > 0 ? rt.port : 0,
    // Backward compat: a pre-0.7 runtime.json only has launchCommand -> exe.
    launchType: rt.launchType === 'exe' || rt.launchType === 'cli' ? rt.launchType : hasCommand ? 'exe' : 'none',
    launchCommand: typeof rt.launchCommand === 'string' ? rt.launchCommand : '',
    launchArgs: Array.isArray(rt.launchArgs) ? rt.launchArgs : [],
    launchSource: typeof rt.launchSource === 'string' ? rt.launchSource : '',
    profile: typeof rt.profile === 'string' ? rt.profile : '',
    execPath: typeof rt.execPath === 'string' ? rt.execPath : '',
    cwd: typeof rt.cwd === 'string' ? rt.cwd : '',
    // Win32 process names (no extension) of live candidates for port discovery.
    electronExes: typeof rt.electronExes === 'string' ? rt.electronExes : '',
    productName: typeof rt.productName === 'string' ? rt.productName : '',
    installLocation: typeof rt.installLocation === 'string' ? rt.installLocation : '',
    updatedAt: typeof rt.updatedAt === 'string' ? rt.updatedAt : '',
  }
}

function readConfig() {
  return readJson(CONFIG_FILE, {})
}

function notify(title, message, icon) {
  if (process.env.DSW_NO_NOTIFY) return
  try {
    const ps =
      'Add-Type -AssemblyName System.Windows.Forms; ' +
      `[System.Windows.Forms.MessageBox]::Show(${JSON.stringify(message)}, ${JSON.stringify(title)}, 0, ${icon})`
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { stdio: 'ignore', detached: true, windowsHide: true },
    )
    child.unref()
  } catch {}
}

function launchDsh(command, args = []) {
  if (!command) return false
  try {
    // A CLI boot writes kernel logs to the user profile, never the clicked
    // folder, so pin the cwd for command launches.
    const cwd = args.length ? homedir() : undefined
    const child = spawn(command, args, { detached: true, stdio: 'ignore', cwd })
    child.unref()
    return true
  } catch {
    return false
  }
}

/** Open / focus the DSH page in the default browser. */
function openUrl(port) {
  try {
    const ps = `Start-Process 'http://127.0.0.1:${port}'`
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-Command', ps],
      { stdio: 'ignore', detached: true, windowsHide: true },
    )
    child.unref()
  } catch {}
}

// ---------------------------------------------------------------------------
// Launcher discovery — a second chance when runtime.json is stale.
// ---------------------------------------------------------------------------

function isDshBinEntry(entry) {
  return typeof entry === 'string' && /[\\/](?:@deepseek-ai[\\/])?dsh[\\/]lib[\\/]bin\.js$/i.test(entry)
}

function isPlausibleExeName(name) {
  return /dsh|deepseek|harness/i.test(name) && !/uninstall|^node|setup|installer/i.test(name)
}

function exeExists(file) {
  try {
    return Boolean(file) && existsSync(file)
  } catch {
    return false
  }
}

/** App root of an Electron install: the directory holding resources/app.asar. */
function electronRootFromPath(filePath) {
  let dir = ''
  try {
    dir = dirname(filePath)
  } catch {
    return ''
  }
  for (let i = 0; i < 12 && dir; i++) {
    if (existsSync(join(dir, 'resources', 'app.asar'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return ''
}

/** Pick the application executable inside an Electron app root. */
function findElectronExe(root) {
  let names
  try {
    names = readdirSync(root)
  } catch {
    return ''
  }
  const exes = names
    .filter((n) => /\.exe$/i.test(n))
    .filter((n) => !/uninstall|^node|setup|installer/i.test(n))
  if (exes.length === 0) return ''
  const normalized = (s) => s.toLowerCase().replace(/\.exe$/, '').replace(/[^a-z0-9]+/g, ' ').trim()
  const preferred = ['deepseek harness', 'deepseek harness desktop', 'dsh desktop', 'deepseek dsh']
  for (const want of preferred) {
    const hit = exes.find((n) => normalized(n) === want)
    if (hit) return join(root, hit)
  }
  const likely = exes.filter((n) => isPlausibleExeName(n))
  if (likely.length > 0) return join(root, [...likely].sort()[0])
  return ''
}

/** Per-user/global install registrations for a DeepSeek Harness application. */
function registeredInstallLocations() {
  if (process.platform !== 'win32') return []
  const roots = [
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ]
  const locations = []
  for (const root of roots) {
    const r = spawnSync('reg.exe', ['query', root, '/s', '/f', 'DeepSeek Harness', '/d'], {
      encoding: 'utf8',
      windowsHide: true,
    })
    if (r.status !== 0 || !r.stdout) continue
    for (const line of r.stdout.split(/\r?\n/)) {
      const m = /InstallLocation\s+REG_SZ\s+(.+)$/i.exec(line.trim())
      if (m && m[1]) locations.push(m[1].trim())
    }
  }
  return locations
}

/**
 * Recover the launcher for a stale runtime file: the recorded command is gone,
 * so look for the current installation. Order:
 * 1. config.json `launch.exe` (an explicit user override wins),
 * 2. a live Desktop process image (its path is authoritative),
 * 3. the install location registered for the product in runtime.json,
 * 4. Windows install registrations,
 * 5. sibling directories of the previously recorded launcher.
 * Only names that look like DSH are accepted.
 */
function recoverLauncher(runtime, config) {
  const override = config && config.launch && typeof config.launch.exe === 'string' ? config.launch.exe : ''
  if (exeExists(override)) return override

  for (const p of liveDshProcessPaths(runtime)) {
    if (exeExists(p) && isPlausibleExeName(basename(p))) return p
  }

  const roots = []
  const recorded = runtime.launchCommand
  if (recorded) {
    // "E:\dir\App\App.exe" -> "E:\dir\App" and "E:\dir"
    roots.push(dirname(recorded), dirname(dirname(recorded)))
  }
  const registered = runtime.installLocation
  if (registered) roots.push(registered)
  roots.push(...registeredInstallLocations())

  for (const root of roots) {
    if (!root || !existsSync(root)) continue
    const electronRoot = existsSync(join(root, 'resources', 'app.asar'))
      ? root
      : electronRootFromPath(root)
    if (electronRoot) {
      const exe = findElectronExe(electronRoot)
      if (exe) return exe
    }
    // Legacy Tauri layout: the shell exe sits next to `dsh-desktop`.
    if (existsSync(join(root, 'dsh-desktop'))) {
      const exe = findElectronExe(root)
      if (exe) return exe
    }
    try {
      for (const name of readdirSync(root)) {
        const child = join(root, name)
        const childExe = findElectronExe(child)
        if (childExe) return childExe
      }
    } catch {}
  }
  return ''
}

/** Image paths of live processes whose name matches DSH / DeepSeek Harness. */
function liveDshProcessPaths(runtime) {
  if (process.platform !== 'win32') return []
  const wanted = new Set()
  for (const raw of [runtime.productName, runtime.electronExes].filter(Boolean)) {
    for (const part of String(raw).split('|')) {
      const name = part.trim().toLowerCase().replace(/\.exe$/, '')
      if (name) wanted.add(name)
    }
  }
  if (wanted.size === 0) {
    wanted.add('deepseek harness')
    wanted.add('dsh-desktop')
    wanted.add('dsh-tauri-app')
  }
  const found = []
  try {
    // tasklist truncates image names, so match on the requested names and let
    // the caller verify the file exists on disk.
    const r = spawnSync('tasklist.exe', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
    if (r.status !== 0 || !r.stdout) return []
    const pids = []
    for (const line of r.stdout.split(/\r?\n/)) {
      const m = /^"([^"]+)","(\d+)"/.exec(line.trim())
      if (!m) continue
      const image = m[1].toLowerCase().replace(/\.exe$/, '')
      if ([...wanted].some((w) => image === w || image.startsWith(w) || w.startsWith(image))) pids.push(m[2])
    }
    for (const pid of pids.slice(0, 8)) {
      const q = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).Path`,
        ],
        { encoding: 'utf8', windowsHide: true },
      )
      const p = (q.stdout || '').trim()
      if (p && exeExists(p)) found.push(p)
    }
    // Also accept the DSH Desktop Host child process ("... Harness.exe ... index.js").
    const w = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'dsh-desktop-host' } | Select-Object -First 1 -ExpandProperty ExecutablePath",
      ],
      { encoding: 'utf8', windowsHide: true },
    )
    const hostExe = (w.stdout || '').trim()
    if (hostExe && exeExists(hostExe)) found.push(hostExe)
  } catch {}
  return [...new Set(found)]
}

/**
 * Refuse to launch an obviously-wrong executable recorded in a stale
 * runtime.json (observed: an old findLaunch picked `D:\lantern-installer.exe`
 * off the drive root). The Desktop exe name must look like DSH AND exist; a CLI
 * boot must re-enter the dsh bin.js. Returns { command, args, type } or null.
 */
function resolveLauncher(runtime, config) {
  const type = runtime.launchType
  const command = runtime.launchCommand
  if (type === 'cli') {
    const entry = runtime.launchArgs && runtime.launchArgs[0]
    if (isDshBinEntry(entry) && exeExists(runtime.execPath)) {
      return { type: 'cli', command: runtime.execPath, args: runtime.launchArgs }
    }
  }
  if (command && isPlausibleExeName(command) && exeExists(command)) {
    return { type: 'exe', command, args: runtime.launchArgs || [] }
  }
  const recovered = recoverLauncher(runtime, config)
  if (recovered) return { type: 'exe', command: recovered, args: [] }
  return null
}

// ---------------------------------------------------------------------------
// Port discovery — a live DSH host may listen somewhere other than the
// recorded port (the recorded file belongs to whichever build ran last).
// ---------------------------------------------------------------------------

/** Ports recorded by every DSH profile in this home. */
function profilePorts() {
  const ports = []
  try {
    for (const name of readdirSync(PROFILES_DIR)) {
      const file = join(PROFILES_DIR, name, 'runtime.json')
      try {
        const rt = JSON.parse(readFileSync(file, 'utf8'))
        if (Number.isInteger(rt.port) && rt.port > 0) ports.push(rt.port)
      } catch {}
    }
  } catch {}
  return ports
}

/** Loopback ports owned by a live DSH process (netstat + PID image check). */
function livePorts() {
  if (process.platform !== 'win32') return []
  const r = spawnSync('netstat.exe', ['-ano', '-p', 'TCP'], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
  if (r.status !== 0 || !r.stdout) return []
  const byPid = new Map()
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = /^\s*TCP\s+127\.0\.0\.1:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i.exec(line)
    if (!m) continue
    const port = Number(m[1])
    const pid = m[2]
    if (!byPid.has(pid)) byPid.set(pid, [])
    byPid.get(pid).push(port)
  }
  if (byPid.size === 0) return []
  const ps = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      "Get-Process | Where-Object { $_.ProcessName -match 'Harness|dsh|DeepSeek|electron' } | ForEach-Object { \"$($_.Id) $($_.ProcessName)\" }",
    ],
    { encoding: 'utf8', windowsHide: true },
  )
  const dshPids = new Set()
  for (const line of (ps.stdout || '').split(/\r?\n/)) {
    const m = /^(\d+)\s+(.+)$/.exec(line.trim())
    if (m && /harness|dsh|deepseek|electron/i.test(m[2])) dshPids.add(m[1])
  }
  const ports = []
  for (const [pid, list] of byPid) {
    if (dshPids.has(pid)) ports.push(...list)
  }
  return [...new Set(ports)]
}

/** Ordered, de-duplicated candidate ports for the live DSH loopback API. */
function candidatePorts(runtime, config) {
  const configured =
    config && config.api && Number.isInteger(config.api.port) && config.api.port > 0 ? [config.api.port] : []
  const seen = new Set()
  const out = []
  const push = (p) => {
    if (Number.isInteger(p) && p > 0 && p < 65536 && !seen.has(p)) {
      seen.add(p)
      out.push(p)
    }
  }
  for (const p of configured) push(p)
  if (runtime.port > 0) push(runtime.port)
  for (const p of profilePorts()) push(p)
  for (const p of livePorts()) push(p)
  for (const p of DEFAULT_PORTS) push(p)
  return out
}

// ---------------------------------------------------------------------------
// RPC
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function rpcId() {
  return 'dsh-set-workspace-' + Date.now() + '-' + Math.random().toString(36).slice(2)
}

/**
 * POST one RPC envelope and return the parsed JSON. Non-JSON bodies (401/403
 * plain-text rejection, 404) throw an Error carrying the HTTP status.
 */
async function postJson(url, body, cookie) {
  const headers = { 'Content-Type': 'application/json' }
  if (cookie) headers.Cookie = cookie
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    const error = new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`)
    error.httpStatus = res.status
    throw error
  }
}

/**
 * Call one RPC with the current api-gateway endpoint shape first — endpoint
 * `workspace/create`, payload `{ args: { request: ... } }` — then fall back to
 * the legacy dotted endpoint (`workspace.create`) with the args as the payload
 * for pre-gateway builds. Returns the parsed server envelope.
 */
async function callRpc(endpoint, args, port, cookie) {
  const legacy = endpoint.replace('/', '.')
  const variants = [
    { path: `/api/${endpoint}`, method: endpoint, payload: { args } },
    { path: `/api/${legacy}`, method: legacy, payload: args },
  ]
  let lastError
  for (const variant of variants) {
    let json
    try {
      json = await postJson(
        `http://127.0.0.1:${port}${variant.path}`,
        {
          type: 'client-request',
          rpcId: rpcId(),
          method: variant.method,
          payload: variant.payload,
        },
        cookie,
      )
    } catch (error) {
      lastError = error
      continue
    }
    const error = json && json.result && json.result.error
    const mismatch =
      json && json.result && json.result.ok === false &&
      /method|endpoint|invocation|not ?found|bad-request/i.test(JSON.stringify(error || {}))
    if (!mismatch) return json
    lastError = new Error((error && error.message) || 'bad request')
  }
  throw lastError || new Error('RPC failed')
}

/** Resolve the workspace on every answering loopback port (idempotent). */
async function createOnAllPorts(ports, folderPath) {
  const settled = await Promise.allSettled(
    ports.map(async (port) => {
      const cookie = authCookie(port)
      const json = await callRpc('workspace/create', { request: { path: folderPath } }, port, cookie)
      const result = json && json.result
      if (!result || !result.ok) {
        const message = (result && result.error && result.error.message) || 'unknown error'
        throw new Error(message)
      }
      return { port, cookie, workspace: result.value.workspace }
    }),
  )
  const hits = []
  let lastError
  for (const entry of settled) {
    if (entry.status === 'fulfilled') hits.push(entry.value)
    else lastError = entry.reason
  }
  if (hits.length === 0) throw lastError || new Error('no DSH host answered on the loopback ports')
  return hits
}

/**
 * Run `fn` (the API call), launching DSH and polling until reachable when the
 * host is down. A network error triggers the launch (boot); a host response
 * (any HTTP status) is returned as-is.
 */
async function withApi(fn, launcher, preferredPort) {
  const deadline = Date.now() + LAUNCH_TIMEOUT_MS
  let launched = false
  let lastError

  for (;;) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (!launched && launcher && launcher.command) {
        launched = launchDsh(launcher.command, launcher.args)
      }
      if (Date.now() >= deadline) {
        throw launched ? new Error(T.launchTimeout) : lastError
      }
      await sleep(POLL_MS)
    }
  }
}

async function main() {
  const runtime = readRuntime()
  const config = readConfig()
  const launcher = resolveLauncher(runtime, config)
  const ports = candidatePorts(runtime, config)

  // Desktop shell (exe): launching the exe boots DSH when down, and triggers
  // the app's own single-instance focus when it is already running (VS Code
  // pattern). Official CLI installs (cli): no pre-launch — the resolution
  // below launches the recorded CLI command only when no port answers, so a
  // second kernel never races the first; focus happens in the browser page.
  const desktopShell = Boolean(launcher && launcher.type === 'exe')
  if (desktopShell) {
    launchDsh(launcher.command, launcher.args)
  } else if (!launcher && runtime.launchCommand && runtime.launchType !== 'none') {
    console.error(`skip launching stale launcher recorded in runtime.json: ${runtime.launchCommand}`)
  }

  let hits
  try {
    hits = await withApi(() => createOnAllPorts(ports, path), launcher, runtime.port)
  } catch (error) {
    const msg = String((error && error.message) || error)
    const hint =
      !launcher && runtime.launchCommand
        ? `${T.staleLaunch(runtime.launchCommand)}\n\n${msg}`
        : T.unreachable(runtime.port || ports[0] || 0, msg)
    notify(T.failTitle, hint, 16)
    console.error(`workspace.create failed: ${msg}`)
    process.exitCode = 1
    return
  }

  // Several live hosts can answer on the loopback (a desktop instance and a
  // `dsh web` instance). The recorded port wins; otherwise prefer the highest
  // port, which is the Desktop default (19387) over the Web default (3080).
  const chosen =
    hits.find((h) => h.port === runtime.port) ??
    [...hits].sort((a, b) => b.port - a.port)[0]
  const activePort = chosen.port
  const workspace = chosen.workspace

  // Focus: the browser page when the user asked for it (config.json) or when
  // there is no Desktop window to focus (cli / none); the Desktop app already
  // focused itself via single-instance.
  const openBrowser = config.ui === 'browser' || !desktopShell
  if (openBrowser) openUrl(activePort)

  try {
    await callRpc(
      'session/create',
      { request: { workspaceId: workspace.workspaceId, sessionId: `dsw-open-${Date.now()}` } },
      activePort,
      chosen.cookie,
    )
  } catch (error) {
    // The workspace is registered; a session-start failure is non-fatal.
    console.error(`session.create failed: ${String((error && error.message) || error)}`)
  }

  notify(T.okTitle, T.okBody(workspace.title, workspace.path), 64)
  console.log(`OK ${workspace.workspaceId} ${workspace.title} ${workspace.path} (port ${activePort})`)
}

main()
