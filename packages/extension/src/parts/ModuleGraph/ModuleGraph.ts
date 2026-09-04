interface EncodedVirtualFile {
  readonly content: string
  readonly encoding: 'base64'
}

type VirtualFile = EncodedVirtualFile | string

export interface ModuleGraph {
  readonly entry: string
  readonly files?: Readonly<Record<string, VirtualFile>>
  readonly id: string
  readonly lazyModules?: Readonly<Record<string, string>>
  readonly modules: Readonly<Record<string, string>>
  readonly resolutions: Readonly<Record<string, string>>
}
