// Load Node.js module shims first, before any other imports
import './parts/NodeShims/NodeShims.ts'
import { activate } from './parts/Main/Main.ts'

await activate()
