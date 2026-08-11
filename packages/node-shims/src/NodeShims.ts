/* eslint-disable unicorn/no-global-object-property-assignment */
import { createNodeAssert } from './parts/NodeAssert/NodeAssert.ts'
import { createNodeFs } from './parts/NodeFs/NodeFs.ts'
import { createNodeFsPromises } from './parts/NodeFsPromises/NodeFsPromises.ts'
import { createNodeOs } from './parts/NodeOs/NodeOs.ts'
import { createNodePath } from './parts/NodePath/NodePath.ts'
import { createNodeUtil } from './parts/NodeUtil/NodeUtil.ts'

// Node.js module shims for web worker environments.
if (globalThis.modules === undefined) {
  globalThis.modules = {}
}

globalThis.modules['node:assert'] = createNodeAssert()
globalThis.modules['node:fs'] = createNodeFs()
globalThis.modules['node:fs/promises'] = createNodeFsPromises()
globalThis.modules['node:os'] = createNodeOs()
globalThis.modules['node:path'] = createNodePath()
globalThis.modules['node:util'] = createNodeUtil()

// Make require() work for node: modules.
if (globalThis.require === undefined) {
  globalThis.require = (id: string): unknown => {
    if (id.startsWith('node:')) {
      const module = globalThis.modules[id]
      if (module) {
        return module
      }
    }
    throw new Error(`Cannot find module '${id}'`)
  }
}
