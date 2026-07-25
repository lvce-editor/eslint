import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.no-constant-condition'

const expectedDiagnostics = [
  {
    source: 'no-constant-condition',
    type: 'error',
  },
]

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
  const tmpDir = await FileSystem.getTmpDir()
  const uri = `${tmpDir}/test.js`
  await FileSystem.writeFiles([
    {
      content: `export default [{ rules: { 'no-constant-condition': 'error' } }]`,
      uri: `${tmpDir}/eslint.config.js`,
    },
    { content: 'if (true) {}', uri },
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
