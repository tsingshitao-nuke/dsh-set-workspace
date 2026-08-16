#!/usr/bin/env node
/**
 * dsh-set-workspace shell bridge.
 *
 * Registers a folder as a DSH workspace by calling the running host's
 * existing `workspace.create` RPC over its loopback /api endpoint. The port
 * is discovered from the runtime file the host plugin publishes
 * (~/.dsh/dsh-set-workspace/runtime.json), with 10736 as a fallback.
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

function discoverPort() {
  try {
    const rt = JSON.parse(readFileSync(join(homedir(), '.dsh', 'dsh-set-workspace', 'runtime.json'), 'utf8'))
    if (Number.isInteger(rt.port) && rt.port > 0) return rt.port
  } catch {}
  return 10736
}

function notify(title, message, icon) {
  // Best-effort visible feedback. stdio:'ignore' keeps this dependency-free
  // and non-blocking; if PowerShell is unavailable we fall back to the log.
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

async function main() {
  const port = discoverPort()
  const url = `http://127.0.0.1:${port}/api/workspace.create`

  let body
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: 'dsh-set-workspace-' + Date.now(),
        method: 'workspace.create',
        payload: { path },
      }),
    })
    body = await res.json()
  } catch (error) {
    const msg = String((error && error.message) || error)
    notify('设置 DSH 工作区失败', `无法连接 DSH（端口 ${port}）。\n请先启动 DSH。\n\n${msg}`, 16)
    console.error(`DSH not reachable at ${url}: ${msg}`)
    process.exit(1)
  }

  const result = body && body.result
  if (result && result.ok) {
    const w = result.value.workspace
    notify('已设为 DSH 工作区', `${w.title}\n${w.path}`, 64)
    console.log(`OK ${w.workspaceId} ${w.title} ${w.path}`)
    process.exit(0)
  }

  const msg = (result && result.error && result.error.message) || '未知错误'
  notify('设置 DSH 工作区失败', `${path}\n\n${msg}`, 16)
  console.error(`FAILED ${msg}`)
  process.exit(1)
}

main()
