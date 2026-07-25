import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.default-case-last'

const expectedDiagnostics = [
  {
    source: 'default-case-last',
    type: 'error',
  },
]

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
  const tmpDir = await FileSystem.getTmpDir()
  const uri = `${tmpDir}/test.js`
  await FileSystem.writeFiles([
    {
      content: `export default [{ rules: { 'default-case-last': 'error' } }]`,
      uri: `${tmpDir}/eslint.config.js`,
    },
    {
      content: 'switch (value) { default: break; case 1: break }',
      uri,
    },
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
