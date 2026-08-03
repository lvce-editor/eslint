import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.no-undef.for-of-source'

const expectedDiagnostics = [{ source: 'no-undef', type: 'error' }]

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
  const tmpDir = await FileSystem.loadFixture(
    import.meta.resolve('../fixtures/eslint-project'),
  )
  const uri = `${tmpDir}/test.js`
  const text = 'for (const value of missing) { value }'
  await FileSystem.writeFile(uri, text)
  await Workspace.setPath(tmpDir)
  await Main.openUri(uri)

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
