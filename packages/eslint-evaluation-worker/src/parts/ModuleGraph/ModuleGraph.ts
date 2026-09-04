export interface ModuleGraph {
  readonly entry: string
  readonly files?: Readonly<Record<string, string>>
  readonly id: string
  readonly lazyModules?: Readonly<Record<string, string>>
  readonly modules: Readonly<Record<string, string>>
  readonly resolutions: Readonly<Record<string, string>>
}
