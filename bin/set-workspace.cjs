#!/usr/bin/env node
/**
 * dsh-set-workspace shell bridge.
 *
 * "Open DSH Workspace Here": registers a folder as a DSH workspace, starts a
 * session in it (session id carries a `dsw-open-` prefix so the DSH client
 * auto-switches to it), and reports the result in a MessageBox.
 *
 * If DSH is not running, the bridge launches it first (using the launch
 * command the host half published in ~/.dsh/dsh-set-workspace/runtime.json),
 * waits for the loopback API to come up, then proceeds.
 *
 * Usage: node set-workspace.cjs <folder-path>
 */
'use strict'

const { homedir } = require('node:os')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const path = process.argv[2]
if (!path) {
  console.error('usage: node set-workspace.cjs <folder-path>')
  process.exit(2)
}

const RUNTIME_FILE = join(homedir(), '.dsh', 'dsh-set-workspace', 'runtime.json')
const LAUNCH_TIMEOUT_MS = 90_000
const POLL_MS = 1500

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
    unreachable: (port, msg) => `无法连接 DSH（端口 ${port}）。\n\n${msg}`,
    launchTimeout: 'DSH 已启动，但等待其就绪超时。请稍后再试。',
  },
  en: {
    okTitle: 'DSH Workspace Opened',
    okBody: (title, p) => `${title}\n${p}`,
    failTitle: 'Failed to Open DSH Workspace',
    failBody: (p, msg) => `${p}\n\n${msg}`,
    unreachable: (port, msg) => `Cannot reach DSH (port ${port}).\n\n${msg}`,
    launchTimeout: 'DSH was launched, but timed out waiting for it to become ready. Try again shortly.',
  },
}[detectLang()]

function readRuntime() {
  let rt = {}
  try {
    rt = JSON.parse(readFileSync(RUNTIME_FILE, 'utf8'))
  } catch {}
  return {
    port: Number.isInteger(rt.port) && rt.port > 0 ? rt.port : 10736,
    launchCommand: typeof rt.launchCommand === 'string' ? rt.launchCommand : '',
  }
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

function launchDsh(launchCommand) {
  if (!launchCommand) return false
  try {
    const { spawn } = require('node:child_process')
    const child = spawn(launchCommand, [], { detached: true, stdio: 'ignore' })
    child.unref()
    return true
  } catch {
    return false
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function call(method, payload, port) {
  const body = {
    type: 'client-request',
    rpcId: 'dsh-set-workspace-' + Date.now() + '-' + Math.random().toString(36).slice(2),
    method,
    payload,
  }
  return fetch(`http://127.0.0.1:${port}/api/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((res) => res.json())
}

/**
 * Run `fn` (the API call), launching DSH and polling until reachable when the
 * host is down. A network error triggers the launch; a host response (any HTTP
 * status) is returned as-is.
 */
async function withLaunch(fn, runtime) {
  const deadline = Date.now() + LAUNCH_TIMEOUT_MS
  let launched = false
  let lastError

  for (;;) {
    try {
      return { result: await fn(runtime.port), launched }
    } catch (error) {
      lastError = error
      if (!launched && runtime.launchCommand) {
        launched = true
        launchDsh(runtime.launchCommand)
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

  let created
  try {
    ;({ result: created } = await withLaunch(() => call('workspace.create', { path }, runtime.port), runtime))
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

  try {
    await call('session.create', { workspaceId: workspace.workspaceId, sessionId: `dsw-open-${Date.now()}` }, runtime.port)
  } catch (error) {
    // The workspace is registered; a session-start failure is non-fatal.
    console.error(`session.create failed: ${String((error && error.message) || error)}`)
  }

  notify(T.okTitle, T.okBody(workspace.title, workspace.path), 64)
  console.log(`OK ${workspace.workspaceId} ${workspace.title} ${workspace.path}`)
}

main()
