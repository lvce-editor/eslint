/* eslint-disable unicorn/no-top-level-side-effects */
// Load Node.js module shims first, before any other imports
import '@lvce-editor/node-shims'
export { activate, deactivate } from './parts/Main/Main.ts'
import { activate } from './parts/Main/Main.ts'

await activate()
