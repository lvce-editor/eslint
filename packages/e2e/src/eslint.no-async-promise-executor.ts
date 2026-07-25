import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.no-async-promise-executor'

const expectedDiagnostics = [
  {
    source: 'no-async-promise-executor',
    type: 'error',
  },
]

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
  const tmpDir = await FileSystem.getTmpDir()
  const uri = `${tmpDir}/test.js`
  await FileSystem.writeFiles([
    {
      content: `export default [{ rules: { 'no-async-promise-executor': 'error' } }]`,
      uri: `${tmpDir}/eslint.config.js`,
    },
    { content: 'new Promise(async (resolve) => resolve())', uri },
  ])
  await Workspace.setPath(tmpDir)
  await Main.openUri(uri)

  const text = await FileSystem.readFile(uri)
  const { result: diagnostics } = (await Command.executeExtensionCommand(
    'eslint.lint',
    { text, uri },
  )) as { result: readonly { source: string; type: string }[] }
  const actualDiagnostics = diagnostics.map(({ source, type }) => ({
    source,
    type,
  }))
  if (
    JSON.stringify(actualDiagnostics) !== JSON.stringify(expectedDiagnostics)
  ) {
    throw new Error(`Unexpected diagnostics: ${JSON.stringify(diagnostics)}`)
  }
}
