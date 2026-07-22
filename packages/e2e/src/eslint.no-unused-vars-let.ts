import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.no-unused-vars-let'

export const skip = 1

const expectedDiagnostics = [
  {
    message: "'unused' is defined but never used.",
    severity: 'warning',
    source: 'no-unused-vars',
  },
]

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
  const tmpDir = await FileSystem.getTmpDir()
  const uri = `${tmpDir}/test.js`
  await FileSystem.writeFile(uri, 'let unused')
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
