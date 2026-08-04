// Load Node.js module shims first, before any other imports
import '@lvce-editor/node-shims'
import { activate } from './parts/Main/Main.ts'

await activate()
