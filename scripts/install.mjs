#!/usr/bin/env node
/**
 * dsh-set-workspace — one-click installer (Windows, cross-shell).
 *
 *   node scripts/install.mjs                 install into the detected profile(s)
 *   node scripts/install.mjs --browser       focus the DSH page in the browser
 *   node scripts/install.mjs --uninstall     remove the Explorer menu
 *
 * The bundle is added to every existing DSH profile (the official Desktop app
 * uses `desktop`; `dsh web` uses `web`), because a right-click should work
 * whichever install is running. `dsh plugin --profile <p> add …` is a no-op when
 * the bundle is already present, so re-running this script is safe.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const REPO = 'github:tsingshitao-nuke/dsh-set-workspace'
const PROFILES_DIR = join(homedir(), '.dsh', 'profiles')
const uninstall = process.argv.includes('--uninstall')
const browser = process.argv.includes('--browser')

/** Profile directories that look like a DSH profile (own package.json). */
function profileNames() {
  const names = []
  try {
    for (const name of readdirSync(PROFILES_DIR)) {
      if (existsSync(join(PROFILES_DIR, name, 'package.json'))) names.push(name)
    }
  } catch {
    /* no profiles yet */
  }
  return names
}

function pluginDir(profile) {
  return join(PROFILES_DIR, profile, 'node_modules', 'dsh-set-workspace')
}

function hasPlugin(profile) {
  try {
    const pkg = JSON.parse(readFileSync(join(pluginDir(profile), 'package.json'), 'utf8'))
    return pkg.name === 'dsh-set-workspace'
  } catch {
    return false
  }
}

function run(label, command, args) {
  console.log(`==> ${label}`)
  const r = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })
  return r.status === 0
}

const profiles = profileNames()
if (profiles.length === 0) profiles.push('web')

for (const profile of profiles) {
  if (uninstall) {
    if (hasPlugin(profile)) run(`uninstalling from profile "${profile}"`, 'dsh', ['plugin', '--profile', profile, 'remove', 'dsh-set-workspace'])
    continue
  }
  if (hasPlugin(profile)) {
    console.log(`==> profile "${profile}": already installed`)
    continue
  }
  run(`installing into profile "${profile}"`, 'dsh', ['plugin', '--profile', profile, 'add', REPO])
}

const installed = profiles.filter(hasPlugin)
if (installed.length === 0) {
  console.error('')
  console.error('No profile has the bundle installed. Install it manually first, for example:')
  console.error(`  dsh plugin --profile desktop add ${REPO}`)
  process.exit(1)
}

// One Explorer registration is shared by every DSH install on this machine.
const menuArgs = [join(pluginDir(installed[0]), 'bin', 'install-context-menu.cjs')]
if (uninstall) menuArgs.push('--uninstall')
else if (browser) menuArgs.push('--browser')
run(uninstall ? 'removing the Explorer context menu' : 'registering the Explorer context menu', process.execPath, menuArgs)

console.log('')
if (uninstall) {
  console.log('Done. The Explorer context menu was removed.')
} else {
  console.log(`Done. Profiles with the bundle: ${installed.join(', ')}`)
  console.log("Right-click a folder in File Explorer -> '在此处打开 DSH 工作区' / 'Open DSH Workspace Here'")
  console.log('Restart DSH (Desktop: quit from the tray, then relaunch) so the host half publishes its port.')
}
