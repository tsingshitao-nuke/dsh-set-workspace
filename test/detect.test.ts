/**
 * Launch-detection tests for the host half.
 *
 * The fixtures are synthetic directories inside a temp folder, so the tests run
 * anywhere. They cover every layout the plugin supports:
 * - official Electron Desktop (the `@deepseek-ai/dsh-desktop` app.asar build),
 * - legacy Tauri Desktop (`dsh-desktop` + `dsh-tauri-app.exe`),
 * - official CLI/npm (`@deepseek-ai/dsh/lib/bin.js`).
 *
 *   node --test test/
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { findLaunch } from '../src/index.ts'

const cleanups = []
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'dsw-detect-'))
  cleanups.push(dir)
  return dir
}
process.on('exit', () => {
  for (const dir of cleanups) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
})

/**
 * Minimal ASAR container: header (pickle) + JSON directory index + payload.
 * The official build stores `package.json` in the index payload, which is what
 * the host reads.
 */
function writeAsar(file, entries) {
  const payload = Buffer.concat(entries.map((e) => Buffer.from(e.content, 'utf8')))
  let offset = 0
  const index = { files: {} }
  for (const entry of entries) {
    const parts = entry.path.split('/')
    let node = index
    for (const part of parts.slice(0, -1)) {
      node.files[part] ??= { files: {} }
      node = node.files[part]
    }
    const size = Buffer.byteLength(entry.content, 'utf8')
    node.files[parts.at(-1)] = { size, offset }
    offset += size
  }
  const json = Buffer.from(JSON.stringify(index), 'utf8')
  const padding = (4 - (json.length % 4)) % 4
  const headerSize = 4 + 4 + json.length + padding
  const header = Buffer.alloc(16)
  header.writeUInt32LE(4, 0)
  header.writeUInt32LE(headerSize, 4)
  header.writeUInt32LE(headerSize - 4, 8)
  header.writeUInt32LE(json.length, 12)
  writeFileSync(file, Buffer.concat([header, json, Buffer.alloc(padding), payload]))
}

/** Build an official-Electron-layout installation under `root`. */
function writeElectronInstall(root) {
  mkdirSync(join(root, 'resources'), { recursive: true })
  writeAsar(join(root, 'resources', 'app.asar'), [
    {
      path: 'package.json',
      content: JSON.stringify({ name: '@deepseek-ai/dsh-desktop', main: 'lib/main.js' }),
    },
  ])
  writeFileSync(join(root, 'DeepSeek Harness.exe'), 'MZ')
  writeFileSync(join(root, 'Uninstall DeepSeek Harness.exe'), 'MZ')
  return root
}

test('official Electron Desktop: kernel entry argument', () => {
  const root = writeElectronInstall(fixture())
  const entry = join(
    root,
    'resources',
    'app.asar',
    'dsh',
    'node_modules',
    '@deepseek-ai',
    'dsh-desktop-host',
    'lib',
    'index.js',
  )
  const launch = findLaunch(19387, {
    argv: ['E:\\deepseek-harness\\DeepSeek Harness.exe', entry],
    execPath: join(root, 'DeepSeek Harness.exe'),
    skipRegistry: true,
  })
  assert.equal(launch.type, 'exe')
  assert.equal(launch.command, join(root, 'DeepSeek Harness.exe'))
  assert.equal(launch.source, 'electron-desktop-host')
  assert.equal(launch.installLocation, root)
  assert.equal(launch.productName, 'DeepSeek Harness')
})

test('official Electron Desktop: registry install location', () => {
  const root = writeElectronInstall(fixture())
  const appData = join(root, 'unrelated', 'node.exe')
  mkdirSync(join(root, 'unrelated'), { recursive: true })
  writeFileSync(appData, 'MZ')
  // No argv anchor; the registry fallback is stubbed by pointing execPath at
  // the app exe, which is the "run the app directly" shape.
  const launch = findLaunch(19387, {
    argv: [join(root, 'DeepSeek Harness.exe')],
    execPath: join(root, 'DeepSeek Harness.exe'),
    skipRegistry: true,
  })
  assert.equal(launch.command, join(root, 'DeepSeek Harness.exe'))
})

test('legacy Tauri Desktop layout still resolves', () => {
  const root = fixture()
  mkdirSync(join(root, 'dsh-desktop', 'vendor', 'node'), { recursive: true })
  writeFileSync(join(root, 'dsh-tauri-app.exe'), 'MZ')
  const entry = join(root, 'dsh-desktop', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  const launch = findLaunch(2761, {
    argv: [join(root, 'dsh-desktop', 'vendor', 'node', 'node.exe'), entry],
    execPath: join(root, 'dsh-desktop', 'vendor', 'node', 'node.exe'),
    skipRegistry: true,
  })
  assert.equal(launch.type, 'exe')
  assert.equal(launch.command, join(root, 'dsh-tauri-app.exe'))
  assert.equal(launch.source, 'tauri-desktop')
})

test('official CLI/npm install resolves to a dsh web relaunch', () => {
  const root = fixture()
  const bin = join(root, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  mkdirSync(join(root, 'node_modules', '@deepseek-ai', 'dsh', 'lib'), { recursive: true })
  writeFileSync(bin, '//')
  const node = join(root, 'node.exe')
  writeFileSync(node, 'MZ')
  const launch = findLaunch(3080, { argv: [node, bin], execPath: node, skipRegistry: true })
  assert.equal(launch.type, 'cli')
  assert.equal(launch.command, node)
  assert.deepEqual(launch.args, [bin, 'web', '--no-open', '--host', '127.0.0.1', '--port', '3080'])
})

test('no anchors: nothing is invented', () => {
  const root = fixture()
  const launch = findLaunch(0, {
    argv: ['C:\\Windows\\System32\\where.exe'],
    execPath: 'C:\\Windows\\System32\\where.exe',
    skipRegistry: true,
  })
  assert.equal(launch.type, 'none')
  assert.equal(launch.command, '')
})

test('a product-name match beats an unrelated executable', () => {
  const root = writeElectronInstall(fixture())
  writeFileSync(join(root, 'lantern-installer.exe'), 'MZ')
  writeFileSync(join(root, 'node.exe'), 'MZ')
  const launch = findLaunch(19387, {
    argv: [join(root, 'DeepSeek Harness.exe')],
    execPath: join(root, 'DeepSeek Harness.exe'),
    skipRegistry: true,
  })
  assert.equal(launch.command, join(root, 'DeepSeek Harness.exe'))
})
