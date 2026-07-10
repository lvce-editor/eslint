import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.config-plugin-exports'

export const test: Test = async ({ Editor, FileSystem, Main, Workspace }) => {
  const tmpDir = await FileSystem.getTmpDir()
  const pluginDir = `${tmpDir}/node_modules/eslint-plugin-demo`
  await FileSystem.mkdir(`${tmpDir}/node_modules`)
  await FileSystem.mkdir(pluginDir)
  await FileSystem.writeFiles([
    {
      content: `import demo from 'eslint-plugin-demo'; export default [{ plugins: { demo }, rules: { 'demo/no-bar': 'warn' } }]`,
      uri: `${tmpDir}/eslint.config.js`,
    },
    {
      content: `export default { rules: { 'no-bar': { create(context) { return { Identifier(node) { if (node.name === 'bar') context.report({ node, message: 'Avoid bar' }) } } } } } }`,
      uri: `${pluginDir}/browser.js`,
    },
    {
      content: `{"exports":{".":{"import":"./browser.js","require":"./node.cjs"}}}`,
      uri: `${pluginDir}/package.json`,
    },
    { content: 'const bar = 1', uri: `${tmpDir}/test.js` },
  ])
  await Workspace.setPath(tmpDir)
  await Editor.enableDiagnostics()

  await Main.openUri(`${tmpDir}/test.js`)

  await Editor.shouldHaveDiagnostics([
    {
      columnIndex: 7,
      endColumnIndex: 10,
      endRowIndex: 1,
      message: 'Avoid bar',
      rowIndex: 1,
      source: 'demo/no-bar',
      type: 'warning',
    },
  ])
}
