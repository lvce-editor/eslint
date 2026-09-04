export interface BenchmarkOptions {
  readonly extension: string
  readonly file: string
  readonly headed: boolean
  readonly heap: boolean
  readonly output: string
  readonly reload: boolean
  readonly repo: string
  readonly timeout: number
}

export interface PreparedRepository {
  readonly cleanup: () => Promise<void>
  readonly path: string
  readonly source: string
}

export interface RunningServer {
  readonly close: () => Promise<void>
  readonly url: string
}
