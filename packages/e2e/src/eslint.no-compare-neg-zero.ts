import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.no-compare-neg-zero'

const expectedDiagnostics = [
  {
    source: 'no-compare-neg-zero',
    type: 'error',
  },
]

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
  const tmpDir = await FileSystem.getTmpDir()
  const uri = `${tmpDir}/test.js`
  await FileSystem.writeFiles([
    {
      content: `export default [{ rules: { 'no-compare-neg-zero': 'error' } }]`,
      uri: `${tmpDir}/eslint.config.js`,
    },
    { content: 'value === -0', uri },
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
