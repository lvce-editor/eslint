import { WebWorkerRpcClient } from '@lvce-editor/rpc'
import * as CommandMap from './parts/CommandMap/CommandMap.ts'

export { commandMap } from './parts/CommandMap/CommandMap.ts'

if (!globalThis.rpc) {
  // eslint-disable-next-line unicorn/no-global-object-property-assignment
  globalThis.rpc = await WebWorkerRpcClient.create({
    commandMap: CommandMap.commandMap,
  })
}
