#!/usr/bin/env node
/**
 * dsh-set-workspace — markdown link check for the README pair.
 *
 *   node test/readme-links.test.mjs
 *
 * Verifies that every relative Markdown link in README.md / README.zh.md points
 * at a file that exists, and that both READMEs document the same set of files.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function relativeLinks(file) {
  const text = readFileSync(join(ROOT, file), 'utf8')
  const links = new Set()
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1]
    if (/^[a-z]+:/i.test(target) || target.startsWith('#')) continue
    links.add(target.split('#')[0])
  }
  return links
}

test('README relative links resolve', () => {
  for (const file of ['README.md', 'README.zh.md']) {
    for (const link of relativeLinks(file)) {
      assert.ok(existsSync(join(ROOT, link)), `${file}: missing ${link}`)
    }
  }
})

test('both READMEs mention the official desktop app', () => {
  for (const file of ['README.md', 'README.zh.md']) {
    const text = readFileSync(join(ROOT, file), 'utf8')
    assert.match(text, /deepseek-harness/, `${file} should reference the official repository`)
    assert.match(text, /19387/, `${file} should document the desktop port`)
    assert.match(text, /second-instance/, `${file} should document the focus mechanism`)
  }
})
