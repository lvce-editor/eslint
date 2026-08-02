import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.no-unsafe-finally.throw'

const expectedDiagnostics = [{ source: 'no-unsafe-finally', type: 'error' }]

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
  const tmpDir = await FileSystem.getTmpDir()
  const uri = `${tmpDir}/test.js`
  const text =
    "function run() { try { console.log(1) } finally { throw new Error('x') } } try { run() } catch (error) { console.log(error) }"
  await FileSystem.writeFiles([
    {
      content: "export default [{ rules: { 'no-unsafe-finally': 'error' } }]",
      uri: `${tmpDir}/eslint.config.js`,
    },
    { content: text, uri },
  ])
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
