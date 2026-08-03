import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.no-debugger-class-method'

const expectedDiagnostics = [{ source: 'no-debugger', type: 'error' }]

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
  const tmpDir = await FileSystem.loadFixture(
    import.meta.resolve('../fixtures/eslint-project'),
  )
  const uri = `${tmpDir}/test.js`
  await FileSystem.writeFile(
    uri,
    'class Example { run() { debugger } }\nnew Example().run()',
  )
  await Workspace.setPath(tmpDir)
  await Main.openUri(uri)

  const text = await FileSystem.readFile(uri)
  const diagnostics = (await Command.executeExtensionCommand('eslint.lint', {
    text,
    uri,
  })) as readonly { source: string; type: string }[]
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
