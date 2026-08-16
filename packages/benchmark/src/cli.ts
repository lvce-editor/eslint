import { resolve } from 'node:path'
import type { BenchmarkOptions } from './types.ts'

const invocationDirectory = process.env['INIT_CWD'] || process.cwd()

const takeValue = (
  argv: readonly string[],
  index: number,
  flag: string,
): string => {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`)
  }
  return value
}

const parseTimeout = (value: string): number => {
  const timeout = Number(value)
  if (
    !Number.isSafeInteger(timeout) ||
    timeout < 1 ||
    String(timeout) !== value
  ) {
    throw new Error('--timeout must be a positive integer')
  }
  return timeout
}

interface MutableOptions {
  file: string
  headed: boolean
  output: string
  reload: boolean
  repo: string
  timeout: number
}

const parseArgument = (
  options: MutableOptions,
  argv: readonly string[],
  index: number,
): number => {
  const argument = argv[index]
  switch (argument) {
    case '--file':
      options.file = takeValue(argv, index, argument)
      return index + 2
    case '--headed':
      options.headed = true
      return index + 1
    case '--output':
      options.output = resolve(
        invocationDirectory,
        takeValue(argv, index, argument),
      )
      return index + 2
    case '--reload':
      options.reload = true
      return index + 1
    case '--repo':
      options.repo = takeValue(argv, index, argument)
      return index + 2
    case '--timeout':
      options.timeout = parseTimeout(takeValue(argv, index, argument))
      return index + 2
    case '--help':
    case '-h':
      throw new Error(getHelpText())
    default:
      throw new Error(`Unknown argument ${argument}`)
  }
}

export const parseArgs = (argv: readonly string[]): BenchmarkOptions => {
  const options: MutableOptions = {
    file: '',
    headed: false,
    output: resolve(invocationDirectory, '.tmp', 'benchmark-results'),
    reload: false,
    repo: '',
    timeout: 120_000,
  }
  let index = 0
  while (index < argv.length) {
    index = parseArgument(options, argv, index)
  }

  if (!options.repo) {
    throw new Error('Missing required option --repo')
  }
  if (!options.file) {
    throw new Error('Missing required option --file')
  }

  return options
}

const getHelpText =
  (): string => `Usage: npm run benchmark -- --repo <repository> --file <relative-path> [options]

Options:
  --repo <repository>   Git URL to clone or local repository path
  --file <path>         File to open, relative to the repository root
  --output <directory>  Results directory (default: .tmp/benchmark-results)
  --reload              Warm caches, then profile a renderer reload
  --timeout <ms>        Editor and lint timeout (default: 120000)
  --headed              Show the Chromium window
`
