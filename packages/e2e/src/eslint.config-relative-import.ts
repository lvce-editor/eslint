import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.config-relative-import'

export const skip = 1

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
  const tmpDir = await FileSystem.loadFixture(
    import.meta.resolve('../fixtures/eslint-project'),
  )
  await FileSystem.writeFiles([
    {
      content: `import rules from './rules.js'; export default [{ rules }]`,
      uri: `${tmpDir}/eslint.config.js`,
    },
    {
      content: `export default { 'no-empty': 'error' }`,
      uri: `${tmpDir}/rules.js`,
    },
    { content: 'if (true) {}', uri: `${tmpDir}/test.js` },
  ])
  await Workspace.setPath(tmpDir)
  await Main.openUri(`${tmpDir}/test.js`)

  const uri = `${tmpDir}/test.js`
  const text = await FileSystem.readFile(uri)
  const diagnostics = (await Command.executeExtensionCommand('eslint.lint', {
    text,
    uri,
  })) as any[]
  if (diagnostics.length !== 1 || diagnostics[0].source !== 'no-empty') {
    throw new Error(`Unexpected diagnostics: ${JSON.stringify(diagnostics)}`)
  }
}
