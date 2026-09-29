#!/usr/bin/env node
/**
 * Cross-platform build for dsh-set-workspace.
 *
 *   node scripts/build.mjs            host + client
 *   node scripts/build.mjs --host     src/index.ts  -> lib/index.js (+ lib/types)
 *   node scripts/build.mjs --client   src/client/index.ts -> lib/client.js (tsdown)
 *
 * The host half is plain `tsc`; the client half is bundled by tsdown into the
 * `window.__ModuleLoader__` wrapper the DSH web client expects.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const host = args.size === 0 || args.has('--host')
const client = args.size === 0 || args.has('--client')

function run(label, command, commandArgs) {
  console.log(`=== ${label} ===`)
  const r = spawnSync(command, commandArgs, { cwd: ROOT, stdio: 'inherit' })
  if (r.error) throw r.error
  if (r.status !== 0) process.exit(r.status ?? 1)
}

const tsc = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
/** tsdown renamed its CLI entry across 0.2x releases; accept both. */
const tsdownCandidates = [
  join(ROOT, 'node_modules', 'tsdown', 'dist', 'run.mjs'),
  join(ROOT, 'node_modules', 'tsdown', 'dist', 'cli.mjs'),
]

if (host) {
  if (!existsSync(tsc)) {
    console.error('build: typescript not installed (run: npm install)')
    process.exit(1)
  }
  run('host: tsc', process.execPath, [tsc, '-p', 'tsconfig.json'])
}

if (client) {
  const tsdown = tsdownCandidates.find((p) => existsSync(p))
  if (!tsdown) {
    console.error('build: tsdown not installed (run: npm install)')
    process.exit(1)
  }
  run('client: tsdown', process.execPath, [tsdown])
}

console.log('=== build complete ===')
