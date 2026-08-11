import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const createBenchmarkTest = async (
  directory: string,
  workspace: string,
  uri: string,
): Promise<void> => {
  const sourceDirectory = join(directory, 'src')
  await mkdir(sourceDirectory, { recursive: true })
  const source = `export const name = 'eslint.benchmark'

export const test = async ({ Command, FileSystem, Main, Workspace }) => {
  const workspace = ${JSON.stringify(workspace)}
  const uri = ${JSON.stringify(uri)}
  await Workspace.setPath(workspace)
  await Main.openUri(uri)
  const text = await FileSystem.readFile(uri)
  await Command.executeExtensionCommand('eslint.lint', { text, uri })
}
`
  await writeFile(join(sourceDirectory, 'eslint.benchmark.ts'), source)
}
