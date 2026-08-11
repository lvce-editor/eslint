import { buildSync } from 'esbuild'
import { fileURLToPath } from 'node:url'

const entryPoint = fileURLToPath(
  import.meta.resolve('@lvce-editor/node-shims/banner'),
)

export const getNodeShimsBanner = (): string => {
  const result = buildSync({
    bundle: true,
    entryPoints: [entryPoint],
    format: 'iife',
    logLevel: 'silent',
    platform: 'browser',
    write: false,
  })
  const outputFile = result.outputFiles[0]
  if (!outputFile) {
    throw new Error('Failed to build the Node.js shim banner')
  }
  return outputFile.text
}
