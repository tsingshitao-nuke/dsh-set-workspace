#!/usr/bin/env node
/**
 * Install / uninstall the Windows File Explorer context menu for
 * dsh-set-workspace (HKCU only — no admin rights needed).
 *
 *   node install-context-menu.cjs             install
 *   node install-context-menu.cjs --uninstall remove
 *
 * The bridge script and the whale icon are copied to a stable, space-free
 * location (~/.dsh/dsh-set-workspace/) so the registry command and icon path
 * never contain spaces, and the entries survive package reinstalls.
 */
'use strict'

const { spawnSync } = require('node:child_process')
const { copyFileSync, mkdirSync, existsSync } = require('node:fs')
const { join, dirname } = require('node:path')
const { homedir } = require('node:os')

const uninstall = process.argv.includes('--uninstall')
const SRC = __dirname
const DEST = join(homedir(), '.dsh', 'dsh-set-workspace')
const NODE = process.execPath
const MENU_LABEL = '设为 DSH 工作区'

const SCOPES = [
  ['Directory', '%1'],
  ['Directory\\Background', '%V'],
]

function reg(args) {
  const r = spawnSync('reg.exe', args, { stdio: 'ignore', windowsHide: true })
  return r.status === 0 || r.status === null ? 0 : r.status
}

function registryKey(scope) {
  return `HKCU\\Software\\Classes\\${scope}\\shell\\dshSetWorkspace`
}

if (uninstall) {
  for (const [scope] of SCOPES) {
    reg(['delete', registryKey(scope), '/f'])
  }
  console.log('removed dsh-set-workspace context menu entries')
  process.exit(0)
}

mkdirSync(DEST, { recursive: true })
copyFileSync(join(SRC, 'set-workspace.cjs'), join(DEST, 'set-workspace.cjs'))

const icoSrc = join(dirname(SRC), 'assets', 'dsh-whale.ico')
if (existsSync(icoSrc)) copyFileSync(icoSrc, join(DEST, 'dsh-whale.ico'))
const ico = join(DEST, 'dsh-whale.ico')
const bridge = join(DEST, 'set-workspace.cjs')

for (const [scope, arg] of SCOPES) {
  const key = registryKey(scope)
  if (reg(['add', key, '/ve', '/t', 'REG_SZ', '/d', MENU_LABEL, '/f']) !== 0) {
    console.error(`failed to write ${key}`)
    process.exit(1)
  }
  if (existsSync(ico)) reg(['add', key, '/v', 'Icon', '/t', 'REG_SZ', '/d', ico, '/f'])
  const cmd = `"${NODE}" "${bridge}" "${arg}"`
  if (reg(['add', `${key}\\command`, '/ve', '/t', 'REG_SZ', '/d', cmd, '/f']) !== 0) {
    console.error(`failed to write ${key}\\command`)
    process.exit(1)
  }
}

console.log('installed dsh-set-workspace context menu')
console.log('  label:  ' + MENU_LABEL)
console.log('  node:   ' + NODE)
console.log('  dest:   ' + DEST)
console.log('  command: ' + `"${NODE}" "${bridge}" "%1"`)
