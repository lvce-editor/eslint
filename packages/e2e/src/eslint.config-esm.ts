import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.config-esm'

export const skip = 1

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
  const tmpDir = await FileSystem.loadFixture(
    import.meta.resolve('../fixtures/eslint-project'),
  )
  await FileSystem.writeFiles([
    {
      content: `export default [{ languageOptions: { globals: { value: 'readonly' } }, rules: { eqeqeq: 'error' } }]`,
      uri: `${tmpDir}/eslint.config.js`,
    },
    { content: 'if (value == null) {}', uri: `${tmpDir}/test.js` },
  ])
  await Workspace.setPath(tmpDir)
  await Main.openUri(`${tmpDir}/test.js`)

  const uri = `${tmpDir}/test.js`
  const text = await FileSystem.readFile(uri)
  const diagnostics = (await Command.executeExtensionCommand('eslint.lint', {
    text,
    uri,
  })) as any[]
  if (diagnostics.length !== 1 || diagnostics[0].source !== 'eqeqeq') {
    throw new Error(`Unexpected diagnostics: ${JSON.stringify(diagnostics)}`)
  }
}
