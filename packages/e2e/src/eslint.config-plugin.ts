import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.config-plugin'

export const test: Test = async ({
  Editor,
  expect,
  FileSystem,
  Locator,
  Main,
  Workspace,
}) => {
  const tmpDir = await FileSystem.getTmpDir()
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
  await Editor.enableDiagnostics()

  await Main.openUri(`${tmpDir}/test.js`)

  const diagnostic = Locator('.Diagnostic')
  await expect(diagnostic).toHaveCount(1)
  await Editor.shouldHaveDiagnostics([
    {
      columnIndex: 7,
      endColumnIndex: 10,
      endRowIndex: 1,
      message: 'Do not use foo',
      rowIndex: 1,
      source: 'demo/no-foo',
      type: 'error',
    },
  ])
}
