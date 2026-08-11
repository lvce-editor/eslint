import { access, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { PreparedRepository } from './types.ts'
import { runProcess } from './process.ts'

const isLocalDirectory = async (source: string): Promise<boolean> => {
  try {
    const sourceStat = await stat(resolve(source))
    return sourceStat.isDirectory()
  } catch {
    return false
  }
}

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export const prepareRepository = async (
  source: string,
): Promise<PreparedRepository> => {
  if (await isLocalDirectory(source)) {
    return {
      cleanup: async () => {},
      path: resolve(source),
      source,
    }
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), 'eslint-benchmark-'))
  const repositoryPath = join(temporaryRoot, 'repository')
  try {
    process.stdout.write(`Cloning ${source}\n`)
    await runProcess('git', [
      'clone',
      '--depth=1',
      '--single-branch',
      source,
      repositoryPath,
    ])
    if (await fileExists(join(repositoryPath, 'package-lock.json'))) {
      process.stdout.write('Installing benchmark repository dependencies\n')
      await runProcess('npm', ['ci'], repositoryPath)
    }
    return {
      cleanup: () => rm(temporaryRoot, { force: true, recursive: true }),
      path: repositoryPath,
      source,
    }
  } catch (error) {
    await rm(temporaryRoot, { force: true, recursive: true })
    throw error
  }
}

export const resolveBenchmarkFile = async (
  repositoryPath: string,
  file: string,
): Promise<string> => {
  if (isAbsolute(file)) {
    throw new Error('--file must be relative to the repository root')
  }
  const filePath = resolve(repositoryPath, file)
  const relativePath = relative(repositoryPath, filePath)
  if (
    !relativePath ||
    relativePath.startsWith('..') ||
    isAbsolute(relativePath)
  ) {
    throw new Error('--file must resolve to a file inside the repository')
  }
  let fileStat
  try {
    fileStat = await stat(filePath)
  } catch {
    fileStat = undefined
  }
  if (!fileStat?.isFile()) {
    throw new Error(`Benchmark file does not exist: ${filePath}`)
  }
  return filePath
}
