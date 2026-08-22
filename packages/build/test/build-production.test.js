import assert from 'node:assert/strict'
import { test } from 'node:test'
import { replaceNodeBuiltins } from '../src/build-production.ts'

test('replaces node-prefixed built-in module imports', () => {
  const source = `
const fs = require('node:fs')
import buffer from 'node:buffer'
import { createRequire as createRequire2 } from 'node:module'
import * as path from 'node:path'
`

  assert.equal(
    replaceNodeBuiltins(source),
    `
const fs = globalThis.require("node:fs")
const buffer = globalThis.require("node:buffer")
const { createRequire: createRequire2 } = globalThis.require("node:module")
const path = globalThis.require("node:path")
`,
  )
})

test('replaces unprefixed built-in module imports', () => {
  const source = `
const fs = require('fs')
import buffer from 'buffer'
import { createRequire, isBuiltin as isBuiltin2 } from 'module'
import * as path from 'path'
`

  assert.equal(
    replaceNodeBuiltins(source),
    `
const fs = globalThis.require('fs')
const buffer = globalThis.require('buffer')
const { createRequire, isBuiltin: isBuiltin2 } = globalThis.require('module')
const path = globalThis.require('path')
`,
  )
})

test('leaves other modules unchanged', () => {
  const source = `import value from 'other-module'`

  assert.equal(replaceNodeBuiltins(source), source)
})
