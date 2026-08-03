import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.no-unreachable-after-return'

export const skip = 1

const expectedDiagnostics = [
  {
    message: 'Unreachable code.',
    severity: 'error',
    source: 'no-unreachable',
  },
]

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
  const tmpDir = await FileSystem.loadFixture(
    import.meta.resolve('../fixtures/eslint-project'),
  )
  const uri = `${tmpDir}/test.js`
  await FileSystem.writeFile(uri, 'function run() { return 1; 2 }\nrun()')
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
