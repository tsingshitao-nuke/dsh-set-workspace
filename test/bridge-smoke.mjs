#!/usr/bin/env node
/**
 * dsh-set-workspace — bridge smoke test.
 *
 *   node test/bridge-smoke.mjs
 *
 * Runs bin/set-workspace.cjs against a fixed throwaway folder and asserts that
 * it reached a live DSH host (any loopback port) and received a workspace id.
 * Because the folder is fixed, repeated runs reuse the same workspace entry
 * (workspace/create is idempotent); remove it from DSH's workspace list
 * afterwards if you do not want it there.
 *
 * Skips (exit 0) when no DSH host is listening, so it never fails a machine
 * without DSH running.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HOME = process.env.USERPROFILE ?? process.env.HOME ?? ''
const RUNTIME_FILE = join(HOME, '.dsh', 'dsh-set-workspace', 'runtime.json')

const folder = join(tmpdir(), 'dsh-set-workspace-smoke')
mkdirSync(folder, { recursive: true })

const bridge = join(ROOT, 'bin', 'set-workspace.cjs')
const run = spawnSync(process.execPath, [bridge, folder], {
  encoding: 'utf8',
  env: { ...process.env, DSW_NO_NOTIFY: '1' },
})

const stdout = run.stdout || ''
const output = `${stdout}${run.stderr || ''}`.trim()
const match = /^OK (\S+) (.*) \(port (\d+)\)/m.exec(stdout)

if (!match) {
  const unreachable = /workspace\.create failed|Cannot reach DSH|unreachable|ECONNREFUSED|fetch failed/i.test(output)
  console.log(`bridge: no live DSH host (exit ${run.status}) — skipping`)
  if (output) console.log(output.split('\n').slice(0, 3).join('\n'))
  process.exit(unreachable ? 0 : 1)
}

const port = Number(match[3])
console.log(`bridge OK: workspace resolved on port ${port}`)
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`bridge returned an invalid port: ${match[3]}`)
  process.exit(1)
}

try {
  const runtime = JSON.parse(readFileSync(RUNTIME_FILE, 'utf8'))
  console.log(
    `runtime.json: port=${runtime.port} profile=${runtime.profile || '?'} launch=${runtime.launchCommand || '(none)'}`,
  )
} catch {
  console.log('runtime.json: not readable (DSH never ran on this machine?)')
}

process.exit(0)
