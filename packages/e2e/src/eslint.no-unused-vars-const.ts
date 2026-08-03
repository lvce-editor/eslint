import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.no-unused-vars-const'

export const skip = 1

const expectedDiagnostics = [
  {
    message: "'unused' is assigned a value but never used.",
    severity: 'warning',
    source: 'no-unused-vars',
  },
]

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
  const tmpDir = await FileSystem.loadFixture(
    import.meta.resolve('../fixtures/eslint-project'),
  )
  const uri = `${tmpDir}/test.js`
  await FileSystem.writeFile(uri, 'const unused = 1')
  await Workspace.setPath(tmpDir)
  await Main.openUri(uri)

  const text = await FileSystem.readFile(uri)
  const diagnostics = (await Command.executeExtensionCommand('eslint.lint', {
    text,
    uri,
  })) as any[]
  const actualDiagnostics = diagnostics.map(
    ({ message, severity, source }) => ({ message, severity, source }),
  )
  if (
    JSON.stringify(actualDiagnostics) !== JSON.stringify(expectedDiagnostics)
  ) {
    throw new Error(`Unexpected diagnostics: ${JSON.stringify(diagnostics)}`)
  }
}
