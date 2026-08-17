#!/usr/bin/env node
/**
 * Install / uninstall the Windows File Explorer context menu for
 * dsh-set-workspace (HKCU only — no admin rights needed).
 *
 *   node install-context-menu.cjs                install
 *   node install-context-menu.cjs --browser      install, focus via browser page
 *   node install-context-menu.cjs --uninstall    remove
 *
 * The bridge, the whale icon, and a hidden-window launcher (VBS) are copied to
 * a stable, space-free location (~/.dsh/dsh-set-workspace/), and the registry
 * command runs the launcher through wscript.exe so no console window flashes.
 * The menu label follows the OS UI language (zh / en). `--browser` writes
 * config.json so the bridge focuses the DSH page in the browser instead of the
 * Desktop window.
 */
'use strict'

const { spawnSync } = require('node:child_process')
const { copyFileSync, mkdirSync, existsSync, writeFileSync, rmSync } = require('node:fs')
const { join, dirname } = require('node:path')
const { homedir } = require('node:os')

const uninstall = process.argv.includes('--uninstall')
const useBrowser = process.argv.includes('--browser')
const SRC = __dirname
const DEST = join(homedir(), '.dsh', 'dsh-set-workspace')
const NODE = process.execPath
const WSCRIPT = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe')

function detectLang() {
  if (process.env.DSW_LANG === 'zh' || process.env.DSW_LANG === 'en') return process.env.DSW_LANG
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale || ''
    return loc.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  } catch {
    return 'en'
  }
}

const LABEL = detectLang() === 'zh' ? '在此处打开 DSH 工作区' : 'Open DSH Workspace Here'

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
// Clean up the obsolete external-focus helper from earlier versions.
rmSync(join(DEST, 'focus-dsh.ps1'), { force: true })

if (useBrowser) {
  writeFileSync(join(DEST, 'config.json'), JSON.stringify({ ui: 'browser' }, null, 2) + '\n', 'utf8')
}

const icoSrc = join(dirname(SRC), 'assets', 'dsh-whale.ico')
if (existsSync(icoSrc)) copyFileSync(icoSrc, join(DEST, 'dsh-whale.ico'))
const ico = join(DEST, 'dsh-whale.ico')
const bridge = join(DEST, 'set-workspace.cjs')
const launcher = join(DEST, 'launch-hidden.vbs')

writeFileSync(
  launcher,
  [
    "' dsh-set-workspace hidden launcher (no console flash)",
    'Set args = WScript.Arguments',
    'If args.Count < 1 Then WScript.Quit 1',
    'Set sh = CreateObject("WScript.Shell")',
    `sh.Run """${NODE}"" ""${bridge}"" """ & args(0) & """", 0, False`,
    '',
  ].join('\r\n'),
  'utf8',
)

for (const [scope, arg] of SCOPES) {
  const key = registryKey(scope)
  if (reg(['add', key, '/ve', '/t', 'REG_SZ', '/d', LABEL, '/f']) !== 0) {
    console.error(`failed to write ${key}`)
    process.exit(1)
  }
  if (existsSync(ico)) reg(['add', key, '/v', 'Icon', '/t', 'REG_SZ', '/d', ico, '/f'])
  const cmd = `"${WSCRIPT}" "${launcher}" "${arg}"`
  if (reg(['add', `${key}\\command`, '/ve', '/t', 'REG_SZ', '/d', cmd, '/f']) !== 0) {
    console.error(`failed to write ${key}\\command`)
    process.exit(1)
  }
}

console.log('installed dsh-set-workspace context menu')
console.log('  label:  ' + LABEL)
console.log('  node:   ' + NODE)
console.log('  launcher:' + launcher)
console.log('  command: ' + `"${WSCRIPT}" "${launcher}" "%1"`)
