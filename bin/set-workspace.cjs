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
 * and when it is already running the app's own single-instance
 * (`second-instance`) handler restores + shows + focuses its window from
 * inside the app process, which is immune to the Windows foreground lock.
 *
 * When DSH is served into a regular browser instead, set
 * ~/.dsh/dsh-set-workspace/config.json to { "ui": "browser" } (or install
 * with --browser); the bridge then focuses the browser page via the loopback
 * URL instead of the Desktop window.
 *
 * Usage: node set-workspace.cjs <folder-path>
 */
'use strict'

const { homedir } = require('node:os')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { createHash, createHmac } = require('node:crypto')

const path = process.argv[2]
if (!path) {
  console.error('usage: node set-workspace.cjs <folder-path>')
  process.exit(2)
}

const DEST = join(homedir(), '.dsh', 'dsh-set-workspace')
const RUNTIME_FILE = join(DEST, 'runtime.json')
const CONFIG_FILE = join(DEST, 'config.json')
const CREDENTIALS_FILE = join(homedir(), '.dsh', '.credentials.yaml')
const LAUNCH_TIMEOUT_MS = 90_000
const POLL_MS = 1500

// ---------------------------------------------------------------------------
// Web API authentication (newer DSH builds). The loopback API is protected by
// a browser-session cookie: GET /?token=<launchToken> mints it in a browser,
// but the launch token lives only in the app process memory. The bridge
// instead re-mints the cookie itself from the signing secret the app stores in
// ~/.dsh/.credentials.yaml under `client-connection/browser-session` — the
// cookie payload is `v1.<base64url(json)>.<hmac-sha256>` with name
// `dsh-auth-<sha256(authority)>` (authority = `127.0.0.1:<port>`).
// Pre-auth builds have no credentials file and their API is open; the bridge
// then sends no cookie and keeps working.
// ---------------------------------------------------------------------------

let AUTH_COOKIE = ''

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

/** Mint a valid browser-session cookie for the loopback API ('' when pre-auth). */
function authCookie(port) {
  const secret = readAuthSecret()
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
  },
  en: {
    okTitle: 'DSH Workspace Opened',
    okBody: (title, p) => `${title}\n${p}`,
    failTitle: 'Failed to Open DSH Workspace',
    failBody: (p, msg) => `${p}\n\n${msg}`,
    unreachable: (port, msg) => `Cannot reach DSH (port ${port}).\nStart DSH first.\n\n${msg}`,
    launchTimeout: 'DSH was launched, but timed out waiting for it to become ready. Try again shortly.',
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
    port: Number.isInteger(rt.port) && rt.port > 0 ? rt.port : 2761,
    // Backward compat: a pre-0.7 runtime.json only has launchCommand -> exe.
    launchType: rt.launchType === 'exe' || rt.launchType === 'cli' ? rt.launchType : hasCommand ? 'exe' : 'none',
    launchCommand: typeof rt.launchCommand === 'string' ? rt.launchCommand : '',
    launchArgs: Array.isArray(rt.launchArgs) ? rt.launchArgs : [],
  }
}

function readConfig() {
  return readJson(CONFIG_FILE, {})
}

function notify(title, message, icon) {
  if (process.env.DSW_NO_NOTIFY) return
  try {
    const { spawn } = require('node:child_process')
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
    const { spawn } = require('node:child_process')
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
    const { spawn } = require('node:child_process')
    const ps = `Start-Process 'http://127.0.0.1:${port}'`
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-Command', ps],
      { stdio: 'ignore', detached: true, windowsHide: true },
    )
    child.unref()
  } catch {}
}

/**
 * Refuse to launch an obviously-wrong executable recorded in a stale
 * runtime.json (observed: an old findLaunch picked `D:\lantern-installer.exe`
 * off the drive root). The Desktop exe name must look like DSH; a CLI boot
 * must re-enter the dsh bin.js.
 */
function isPlausibleDshCommand(runtime) {
  if (runtime.launchType === 'cli') {
    const entry = runtime.launchArgs && runtime.launchArgs[0]
    return typeof entry === 'string' && /[\\/](?:@deepseek-ai[\\/])?dsh[\\/]lib[\\/]bin\.js$/i.test(entry)
  }
  return /dsh|deepseek|harness/i.test(runtime.launchCommand || '')
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * POST one RPC envelope and return the parsed JSON. Non-JSON bodies (401/403
 * plain-text rejection, 404) throw an Error carrying the HTTP status.
 */
async function postJson(url, body) {
  const headers = { 'Content-Type': 'application/json' }
  if (AUTH_COOKIE) headers.Cookie = AUTH_COOKIE
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`)
  }
}

/**
 * Call one RPC with the current api-gateway endpoint shape first — endpoint
 * `workspace/create`, payload `{ args: { request: ... } }` — then fall back to
 * the legacy dotted endpoint (`workspace.create`) with the args as the payload
 * for pre-gateway builds. Returns the parsed server envelope.
 */
async function callRpc(endpoint, args, port) {
  const legacy = endpoint.replace('/', '.')
  const variants = [
    { path: `/api/${endpoint}`, method: endpoint, payload: { args } },
    { path: `/api/${legacy}`, method: legacy, payload: args },
  ]
  let lastError
  for (const variant of variants) {
    let json
    try {
      json = await postJson(`http://127.0.0.1:${port}${variant.path}`, {
        type: 'client-request',
        rpcId: 'dsh-set-workspace-' + Date.now() + '-' + Math.random().toString(36).slice(2),
        method: variant.method,
        payload: variant.payload,
      })
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

/**
 * Run `fn` (the API call), launching DSH and polling until reachable when the
 * host is down. A network error triggers the launch (boot); a host response
 * (any HTTP status) is returned as-is.
 */
async function withApi(fn, runtime) {
  const deadline = Date.now() + LAUNCH_TIMEOUT_MS
  let launched = false
  let lastError

  for (;;) {
    try {
      return await fn(runtime.port)
    } catch (error) {
      lastError = error
      if (!launched && isPlausibleDshCommand(runtime)) {
        launched = launchDsh(runtime.launchCommand, runtime.launchArgs)
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
  AUTH_COOKIE = authCookie(runtime.port)
  // Desktop shell (exe): launching the exe boots DSH when down, and triggers
  // the app's own single-instance focus when it is already running (VS Code
  // pattern). Official CLI installs (cli): no pre-launch — withApi launches
  // the recorded CLI command only when the port is unreachable, so a second
  // kernel never races the first; focus happens in the browser page.
  if (runtime.launchType === 'exe') {
    if (isPlausibleDshCommand(runtime)) {
      launchDsh(runtime.launchCommand, runtime.launchArgs)
    } else {
      console.error(`skip launching invalid exe recorded in runtime.json: ${runtime.launchCommand}`)
    }
  }

  let created
  try {
    created = await withApi(() => callRpc('workspace/create', { request: { path } }, runtime.port), runtime)
  } catch (error) {
    const msg = String((error && error.message) || error)
    notify(T.failTitle, T.unreachable(runtime.port, msg), 16)
    console.error(`workspace.create failed: ${msg}`)
    process.exitCode = 1
    return
  }

  const result = created && created.result
  if (!result || !result.ok) {
    const msg = (result && result.error && result.error.message) || 'unknown error'
    notify(T.failTitle, T.failBody(path, msg), 16)
    console.error(`FAILED ${msg}`)
    process.exitCode = 1
    return
  }

  const workspace = result.value.workspace

  // Focus: the browser page when the user asked for it (config.json) or when
  // there is no Desktop window to focus (cli / none); the Desktop app already
  // focused itself via single-instance.
  const openBrowser = config.ui === 'browser' || runtime.launchType !== 'exe'
  if (openBrowser) openUrl(runtime.port)

  try {
    await callRpc(
      'session/create',
      { request: { workspaceId: workspace.workspaceId, sessionId: `dsw-open-${Date.now()}` } },
      runtime.port,
    )
  } catch (error) {
    // The workspace is registered; a session-start failure is non-fatal.
    console.error(`session.create failed: ${String((error && error.message) || error)}`)
  }

  notify(T.okTitle, T.okBody(workspace.title, workspace.path), 64)
  console.log(`OK ${workspace.workspaceId} ${workspace.title} ${workspace.path}`)
}

main()
