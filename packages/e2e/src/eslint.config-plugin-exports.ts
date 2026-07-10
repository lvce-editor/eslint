import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.config-plugin-exports'

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
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
  await Main.openUri(`${tmpDir}/test.js`)

  const uri = `${tmpDir}/test.js`
  const text = await FileSystem.readFile(uri)
  const diagnostics = (await Command.executeExtensionCommand('eslint.lint', {
    text,
    uri,
  })) as any[]
  if (diagnostics.length !== 1 || diagnostics[0].source !== 'demo/no-bar') {
    throw new Error(`Unexpected diagnostics: ${JSON.stringify(diagnostics)}`)
  }
}
