import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.no-duplicate-case.async-bigint'

const expectedDiagnostics = [{ source: 'no-duplicate-case', type: 'error' }]

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
  const tmpDir = await FileSystem.getTmpDir()
  const uri = `${tmpDir}/test.js`
  const text =
    'async function choose(value) { switch (value) { case 1n: return 1; case 1n: return 2 } } choose(1n)'
  await FileSystem.writeFiles([
    {
      content: "export default [{ rules: { 'no-duplicate-case': 'error' } }]",
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
