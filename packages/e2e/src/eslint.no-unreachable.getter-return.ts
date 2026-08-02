import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.no-unreachable.getter-return'

const expectedDiagnostics = [{ source: 'no-unreachable', type: 'error' }]

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
  const tmpDir = await FileSystem.getTmpDir()
  const uri = `${tmpDir}/test.js`
  const text =
    'class Example { get value() { return 1; 2 } } new Example().value'
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
