import * as ModuleResolution from '../ModuleResolution/ModuleResolution.ts'
import * as Worker from '../Worker/Worker.ts'

export const commandMap: Readonly<Record<string, unknown>> = {
  'ModuleResolution.invalidateCacheKeys': ModuleResolution.invalidateCacheKeys,
  'ModuleResolution.invalidateForFileChanges':
    ModuleResolution.invalidateForFileChanges,
  'ModuleResolution.loadEslintConfig': ModuleResolution.loadEslintConfig,
  'ModuleResolution.loadEslintModule': ModuleResolution.loadEslintModule,
  'Worker.dispose': Worker.dispose,
}
