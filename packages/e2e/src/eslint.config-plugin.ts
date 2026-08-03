import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.config-plugin'

export const skip = 1

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
  const tmpDir = await FileSystem.loadFixture(
    import.meta.resolve('../fixtures/eslint-project'),
  )
  const pluginDir = `${tmpDir}/node_modules/eslint-plugin-demo`
  await FileSystem.mkdir(`${tmpDir}/node_modules`)
  await FileSystem.mkdir(pluginDir)
  await FileSystem.writeFiles([
    {
      content: `import demo from 'eslint-plugin-demo'; export default [{ plugins: { demo }, rules: { 'demo/no-foo': 'error' } }]`,
      uri: `${tmpDir}/eslint.config.js`,
    },
    {
      content: `module.exports = { rules: { 'no-foo': { create(context) { return { Identifier(node) { if (node.name === 'foo') context.report({ node, message: 'Do not use foo' }) } } } } } }`,
      uri: `${pluginDir}/index.js`,
    },
    { content: `{"main":"index.js"}`, uri: `${pluginDir}/package.json` },
    { content: 'const foo = 1', uri: `${tmpDir}/test.js` },
  ])
  await Workspace.setPath(tmpDir)
  await Main.openUri(`${tmpDir}/test.js`)

  const uri = `${tmpDir}/test.js`
  const text = await FileSystem.readFile(uri)
  const diagnostics = (await Command.executeExtensionCommand('eslint.lint', {
    text,
    uri,
  })) as any[]
  if (diagnostics.length !== 1 || diagnostics[0].source !== 'demo/no-foo') {
    throw new Error(`Unexpected diagnostics: ${JSON.stringify(diagnostics)}`)
  }
}
