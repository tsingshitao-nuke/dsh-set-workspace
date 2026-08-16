#!/usr/bin/env node
/**
 * dsh-set-workspace shell bridge.
 *
 * "Open DSH Workspace Here": registers a folder as a DSH workspace, starts a
 * session in it (session id carries a `dsw-open-` prefix so the DSH client
 * auto-switches to it), and reports the result in a MessageBox.
 *
 * The port is discovered from ~/.dsh/dsh-set-workspace/runtime.json (published
 * by the host plugin), with 10736 as a fallback.
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
  },
  en: {
    okTitle: 'DSH Workspace Opened',
    okBody: (title, p) => `${title}\n${p}`,
    failTitle: 'Failed to Open DSH Workspace',
    failBody: (p, msg) => `${p}\n\n${msg}`,
    unreachable: (port, msg) => `Cannot reach DSH (port ${port}).\nStart DSH first.\n\n${msg}`,
  },
}[detectLang()]

function discoverPort() {
  try {
    const rt = JSON.parse(readFileSync(join(homedir(), '.dsh', 'dsh-set-workspace', 'runtime.json'), 'utf8'))
    if (Number.isInteger(rt.port) && rt.port > 0) return rt.port
  } catch {}
  return 10736
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

async function call(method, payload) {
  const port = discoverPort()
  const res = await fetch(`http://127.0.0.1:${port}/api/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: 'dsh-set-workspace-' + Date.now() + '-' + Math.random().toString(36).slice(2),
      method,
      payload,
    }),
  })
  return { body: await res.json(), port }
}

async function main() {
  let created
  try {
    ;({ body: created } = await call('workspace.create', { path }))
  } catch (error) {
    const msg = String((error && error.message) || error)
    notify(T.failTitle, T.unreachable(discoverPort(), msg), 16)
    console.error(`DSH not reachable: ${msg}`)
    process.exitCode = 1
    return
  }

  const result = created && created.result
  if (!result || !result.ok) {
    const msg = (result && result.error && result.error.message) || '未知错误 / unknown error'
    notify(T.failTitle, T.failBody(path, msg), 16)
    console.error(`FAILED ${msg}`)
    process.exitCode = 1
    return
  }

  const workspace = result.value.workspace

  try {
    await call('session.create', {
      workspaceId: workspace.workspaceId,
      sessionId: `dsw-open-${Date.now()}`,
    })
  } catch (error) {
    // The workspace is registered; a session-start failure is non-fatal.
    console.error(`session.create failed: ${String((error && error.message) || error)}`)
  }

  notify(T.okTitle, T.okBody(workspace.title, workspace.path), 64)
  console.log(`OK ${workspace.workspaceId} ${workspace.title} ${workspace.path}`)
}

main()
