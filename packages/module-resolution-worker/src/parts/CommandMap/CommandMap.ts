import * as ModuleResolution from '../ModuleResolution/ModuleResolution.ts'

export const commandMap: Readonly<Record<string, unknown>> = {
  'ModuleResolution.invalidateForFileChanges':
    ModuleResolution.invalidateForFileChanges,
  'ModuleResolution.loadEslintConfig': ModuleResolution.loadEslintConfig,
  'ModuleResolution.loadEslintModule': ModuleResolution.loadEslintModule,
}
