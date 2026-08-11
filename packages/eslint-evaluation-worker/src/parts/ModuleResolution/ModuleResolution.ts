import type { ModuleGraph } from '../ModuleGraph/ModuleGraph.ts'
import * as Rpc from '../Rpc/Rpc.ts'

export const loadEslintConfig = (
  path: string,
  filePath: string,
): Promise<ModuleGraph> => {
  return Rpc.invoke('ModuleResolution.loadEslintConfig', path, filePath)
}

export const loadEslintModule = (
  path: string,
  projectPath?: string,
): Promise<ModuleGraph> => {
  return projectPath
    ? Rpc.invoke('ModuleResolution.loadEslintModule', path, projectPath)
    : Rpc.invoke('ModuleResolution.loadEslintModule', path)
}
