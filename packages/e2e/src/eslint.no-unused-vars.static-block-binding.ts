import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.no-unused-vars.static-block-binding'

const expectedDiagnostics = [{ source: 'no-unused-vars', type: 'warning' }]

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
  const tmpDir = await FileSystem.getTmpDir()
  const uri = `${tmpDir}/test.js`
  const text = 'class Example { static { const unused = 1 } } new Example()'
  await FileSystem.writeFile(uri, text)
  await Workspace.setPath(tmpDir)
  await Main.openUri(uri)

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
