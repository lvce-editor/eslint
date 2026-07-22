import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.multiple-rules'

export const skip = 1

const expectedDiagnostics = [
  {
    message: "'unused' is assigned a value but never used.",
    severity: 'warning',
    source: 'no-unused-vars',
  },
  {
    message: "'missing' is not defined.",
    severity: 'error',
    source: 'no-undef',
  },
]

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
  const tmpDir = await FileSystem.getTmpDir()
  const uri = `${tmpDir}/test.js`
  await FileSystem.writeFile(uri, 'const unused = missing')
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
