import type { ModuleGraph } from '../ModuleGraph/ModuleGraph.ts'
import * as Rpc from '../Rpc/Rpc.ts'

export interface ErrorDetails {
  readonly code?: string | number
  readonly message: string
  readonly name: string
  readonly stack?: string
}

interface FileRead {
  readonly contentLength?: number
  readonly durationMs: number
  readonly error?: string
  readonly path: string
}

export interface ResolutionStats {
  readonly durationMs: number
  readonly fileReadCount: number
  readonly files: readonly FileRead[]
  readonly totalContentLength: number
  readonly uniqueFileCount: number
}

export interface ModuleResolutionTrace {
  readonly error?: ErrorDetails
  readonly graph?: ModuleGraph
  readonly stats: ResolutionStats
}

export function loadEslintConfig(
  path: string,
  filePath: string,
  captureStats: true,
): Promise<ModuleResolutionTrace>
export function loadEslintConfig(
  path: string,
  filePath: string,
  captureStats?: false,
): Promise<ModuleGraph>
export function loadEslintConfig(
  path: string,
  filePath: string,
  captureStats = false,
): Promise<ModuleGraph | ModuleResolutionTrace> {
  // eslint-disable-next-line sonarjs/no-selector-parameter
  return captureStats
    ? Rpc.invoke('ModuleResolution.loadEslintConfig', path, filePath, true)
    : Rpc.invoke('ModuleResolution.loadEslintConfig', path, filePath)
}

export function loadEslintModule(
  path: string,
  projectPath: string | undefined,
  captureStats: true,
): Promise<ModuleResolutionTrace>
export function loadEslintModule(
  path: string,
  projectPath?: string,
  captureStats?: false,
): Promise<ModuleGraph>
export function loadEslintModule(
  path: string,
  projectPath?: string,
  captureStats = false,
): Promise<ModuleGraph | ModuleResolutionTrace> {
  if (captureStats) {
    return Rpc.invoke(
      'ModuleResolution.loadEslintModule',
      path,
      projectPath,
      true,
    )
  }
  return projectPath
    ? Rpc.invoke('ModuleResolution.loadEslintModule', path, projectPath)
    : Rpc.invoke('ModuleResolution.loadEslintModule', path)
}
