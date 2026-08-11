/* eslint-disable unicorn/no-global-object-property-assignment */
import { createNodeAssert } from './parts/NodeAssert/NodeAssert.ts'
import { installNodeBuffer } from './parts/NodeBuffer/NodeBuffer.ts'
import { createNodeCrypto } from './parts/NodeCrypto/NodeCrypto.ts'
import { createNodeEvents } from './parts/NodeEvents/NodeEvents.ts'
import { createNodeFs } from './parts/NodeFs/NodeFs.ts'
import { createNodeFsPromises } from './parts/NodeFsPromises/NodeFsPromises.ts'
import { createNodeModule } from './parts/NodeModule/NodeModule.ts'
import { createNodeOs } from './parts/NodeOs/NodeOs.ts'
import { createNodePath } from './parts/NodePath/NodePath.ts'
import { installNodeProcess } from './parts/NodeProcess/NodeProcess.ts'
import { createNodeStream } from './parts/NodeStream/NodeStream.ts'
import { createNodeTty } from './parts/NodeTty/NodeTty.ts'
import { createNodeUrl } from './parts/NodeUrl/NodeUrl.ts'
import { createNodeUtil } from './parts/NodeUtil/NodeUtil.ts'
import { createNodeWorkerThreads } from './parts/NodeWorkerThreads/NodeWorkerThreads.ts'

// This entrypoint is bundled and injected as a banner by esbuild.
if (globalThis.modules === undefined) {
  globalThis.modules = {}
}

const { modules } = globalThis

modules['node:assert'] = createNodeAssert()
modules['node:crypto'] = createNodeCrypto()
modules['node:events'] = createNodeEvents()
modules['node:fs'] = createNodeFs()
modules['node:fs/promises'] = createNodeFsPromises()
modules['node:module'] = createNodeModule()
modules['node:os'] = createNodeOs()
modules['node:path'] = createNodePath()
modules['node:stream'] = createNodeStream()
modules['node:tty'] = createNodeTty()
modules['node:url'] = createNodeUrl()
modules['node:util'] = createNodeUtil()
modules['node:worker_threads'] = createNodeWorkerThreads()

installNodeBuffer()
installNodeProcess()

for (const name of [
  'assert',
  'crypto',
  'events',
  'fs',
  'module',
  'os',
  'path',
  'stream',
  'tty',
  'url',
  'util',
  'worker_threads',
]) {
  modules[name] = modules[`node:${name}`]
}

// Make require() work for both node: and non-prefixed modules.
if (globalThis.require === undefined) {
  globalThis.require = (id: string): unknown => {
    const module = modules[id]
    if (module) {
      return module
    }
    throw new Error(`Cannot find module '${id}'`)
  }
}
