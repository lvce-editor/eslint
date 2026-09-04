import type { CDPSession } from 'playwright'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { finished } from 'node:stream/promises'

// cspell:ignore evaluationworker

interface TargetInfo {
  readonly targetId: string
  readonly title: string
  readonly type: string
  readonly url: string
}

interface HeapSnapshot {
  readonly edges: readonly number[]
  readonly nodes: readonly number[]
  readonly snapshot: {
    readonly meta: {
      readonly edge_fields: readonly string[]
      readonly node_fields: readonly string[]
      readonly node_types: readonly (readonly string[])[]
    }
  }
  readonly strings: readonly string[]
}

interface LargeDuplicate {
  readonly count: number
  readonly preview: string
  readonly shallowSize: number
}

export interface HeapSummary {
  readonly duplicateLargeModuleScripts: readonly LargeDuplicate[]
  readonly evaluatorScriptSource: number
  readonly retainedGraphSource: number
  readonly stringShallowSize: number
  readonly totalHeap: number
  readonly typeScriptCatalogs: number
}

const findEvaluationWorker = (targets: readonly TargetInfo[]): TargetInfo => {
  const worker = targets.find((target) => {
    const description = `${target.title} ${target.url}`
      .toLowerCase()
      .replaceAll(/[^a-z]/g, '')
    return (
      target.type.includes('worker') &&
      description.includes('eslint') &&
      description.includes('evaluationworker')
    )
  })
  if (!worker) {
    throw new Error(
      `Cannot find builtin.eslint.evaluation-worker among Chromium targets: ${targets
        .map((target) => `${target.type}:${target.title || target.url}`)
        .join(', ')}`,
    )
  }
  return worker
}

const writeSnapshot = async (
  cdp: CDPSession,
  sessionId: string,
  outputPath: string,
): Promise<void> => {
  let commandId = 0
  const pending = new Map<
    number,
    {
      readonly reject: (error: Error) => void
      readonly resolve: () => void
    }
  >()
  const output = createWriteStream(outputPath, { encoding: 'utf8' })
  const writeChunk = (chunk: string): void => {
    output.write(chunk)
  }
  const onMessage = (event: {
    readonly message: string
    readonly sessionId: string
  }): void => {
    if (event.sessionId !== sessionId) {
      return
    }
    const message = JSON.parse(event.message) as {
      readonly error?: { readonly message?: string }
      readonly id?: number
      readonly method?: string
      readonly params?: { readonly chunk?: string }
    }
    if (message.method === 'HeapProfiler.addHeapSnapshotChunk') {
      writeChunk(message.params?.chunk ?? '')
      return
    }
    if (message.id === undefined) {
      return
    }
    const command = pending.get(message.id)
    if (!command) {
      return
    }
    pending.delete(message.id)
    if (message.error) {
      command.reject(new Error(message.error.message || 'CDP command failed'))
    } else {
      command.resolve()
    }
  }
  cdp.on('Target.receivedMessageFromTarget', onMessage)
  const send = (method: string, params: object = {}): Promise<void> => {
    const id = ++commandId
    const response = new Promise<void>((resolvePromise, reject) => {
      pending.set(id, { reject, resolve: resolvePromise })
    })
    void cdp
      .send('Target.sendMessageToTarget', {
        message: JSON.stringify({ id, method, params }),
        sessionId,
      })
      .catch((error: Error) => pending.get(id)?.reject(error))
    return response
  }
  try {
    await send('HeapProfiler.enable')
    await send('HeapProfiler.collectGarbage')
    await send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
  } finally {
    cdp.off('Target.receivedMessageFromTarget', onMessage)
    output.end()
    await finished(output)
  }
}

const getFieldIndex = (fields: readonly string[], name: string): number => {
  const index = fields.indexOf(name)
  if (index === -1) {
    throw new Error(`Heap snapshot does not contain ${name}`)
  }
  return index
}

const getGraphSourceNodes = (
  snapshot: HeapSnapshot,
  nodeFieldCount: number,
  edgeFieldCount: number,
  edgeCountIndex: number,
  edgeNameIndex: number,
  edgeToNodeIndex: number,
): ReadonlySet<number> => {
  const graphSources = new Set<number>()
  const edgeStarts = new Uint32Array(snapshot.nodes.length / nodeFieldCount)
  let edgeOffset = 0
  for (
    let nodeOffset = 0;
    nodeOffset < snapshot.nodes.length;
    nodeOffset += nodeFieldCount
  ) {
    edgeStarts[nodeOffset / nodeFieldCount] = edgeOffset
    edgeOffset += snapshot.nodes[nodeOffset + edgeCountIndex] * edgeFieldCount
  }
  edgeOffset = 0
  for (
    let nodeOffset = 0;
    nodeOffset < snapshot.nodes.length;
    nodeOffset += nodeFieldCount
  ) {
    const edgeCount = snapshot.nodes[nodeOffset + edgeCountIndex]
    for (let index = 0; index < edgeCount; index++) {
      const currentEdge = edgeOffset + index * edgeFieldCount
      const name = snapshot.strings[snapshot.edges[currentEdge + edgeNameIndex]]
      if (['files', 'modules', 'lazyModules'].includes(name)) {
        const recordOffset = snapshot.edges[currentEdge + edgeToNodeIndex]
        const recordEdgeStart = edgeStarts[recordOffset / nodeFieldCount]
        const recordEdgeCount = snapshot.nodes[recordOffset + edgeCountIndex]
        for (
          let recordIndex = 0;
          recordIndex < recordEdgeCount;
          recordIndex++
        ) {
          graphSources.add(
            snapshot.edges[
              recordEdgeStart + recordIndex * edgeFieldCount + edgeToNodeIndex
            ],
          )
        }
      }
    }
    edgeOffset += edgeCount * edgeFieldCount
  }
  return graphSources
}

export const summarizeHeapSnapshot = (snapshot: HeapSnapshot): HeapSummary => {
  const nodeFields = snapshot.snapshot.meta.node_fields
  const edgeFields = snapshot.snapshot.meta.edge_fields
  const nodeFieldCount = nodeFields.length
  const edgeFieldCount = edgeFields.length
  const typeIndex = getFieldIndex(nodeFields, 'type')
  const nameIndex = getFieldIndex(nodeFields, 'name')
  const shallowSizeIndex = getFieldIndex(nodeFields, 'self_size')
  const edgeCountIndex = getFieldIndex(nodeFields, 'edge_count')
  const edgeNameIndex = getFieldIndex(edgeFields, 'name_or_index')
  const edgeToNodeIndex = getFieldIndex(edgeFields, 'to_node')
  const nodeTypes = snapshot.snapshot.meta.node_types[typeIndex]
  const graphSourceNodes = getGraphSourceNodes(
    snapshot,
    nodeFieldCount,
    edgeFieldCount,
    edgeCountIndex,
    edgeNameIndex,
    edgeToNodeIndex,
  )
  const duplicateCandidates = new Map<
    string,
    { count: number; preview: string; shallowSize: number }
  >()
  let evaluatorScriptSource = 0
  let retainedGraphSource = 0
  let stringShallowSize = 0
  let totalHeap = 0
  let typeScriptCatalogs = 0
  for (
    let nodeOffset = 0;
    nodeOffset < snapshot.nodes.length;
    nodeOffset += nodeFieldCount
  ) {
    const shallowSize = snapshot.nodes[nodeOffset + shallowSizeIndex]
    totalHeap += shallowSize
    const type = nodeTypes[snapshot.nodes[nodeOffset + typeIndex]]
    if (
      type !== 'string' &&
      type !== 'concatenated string' &&
      type !== 'sliced string'
    ) {
      continue
    }
    stringShallowSize += shallowSize
    if (graphSourceNodes.has(nodeOffset)) {
      retainedGraphSource += shallowSize
    }
    const value = snapshot.strings[snapshot.nodes[nodeOffset + nameIndex]]
    if (
      value.startsWith(
        '(function anonymous(global,process,clearImmediate,setImmediate,SharedArrayBuffer',
      )
    ) {
      evaluatorScriptSource += shallowSize
    }
    if (value.includes('"ALL_COMPILER_OPTIONS_6917"')) {
      typeScriptCatalogs += shallowSize
    }
    if (shallowSize >= 256 * 1024) {
      const hash = createHash('sha256').update(value).digest('hex')
      const candidate = duplicateCandidates.get(hash)
      duplicateCandidates.set(hash, {
        count: (candidate?.count ?? 0) + 1,
        preview: value.slice(0, 120),
        shallowSize: (candidate?.shallowSize ?? 0) + shallowSize,
      })
    }
  }
  return {
    duplicateLargeModuleScripts: duplicateCandidates
      .values()
      .filter((candidate) => candidate.count > 1)
      .toArray()
      .toSorted((left, right) => right.shallowSize - left.shallowSize),
    evaluatorScriptSource,
    retainedGraphSource,
    stringShallowSize,
    totalHeap,
    typeScriptCatalogs,
  }
}

export const captureHeapSnapshot = async (
  cdp: CDPSession,
  snapshotPath: string,
  summaryPath: string,
): Promise<HeapSummary> => {
  await cdp.send('Target.setDiscoverTargets', { discover: true })
  const { targetInfos } = (await cdp.send('Target.getTargets')) as {
    readonly targetInfos: readonly TargetInfo[]
  }
  const target = findEvaluationWorker(targetInfos)
  const { sessionId } = (await cdp.send('Target.attachToTarget', {
    flatten: false,
    targetId: target.targetId,
  })) as { readonly sessionId: string }
  try {
    await writeSnapshot(cdp, sessionId, snapshotPath)
  } finally {
    await cdp.send('Target.detachFromTarget', { sessionId })
  }
  const snapshot = JSON.parse(
    await readFile(snapshotPath, 'utf8'),
  ) as HeapSnapshot
  const summary = summarizeHeapSnapshot(snapshot)
  await writeFile(summaryPath, `${JSON.stringify(summary, undefined, 2)}\n`)
  return summary
}
