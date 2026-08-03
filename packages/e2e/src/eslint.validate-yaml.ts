import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.validate-yaml'

// TODO enable when e2e memfs config URIs can be loaded by the extension file API
export const skip = 1

export const test: Test = async ({
  Command,
  Editor,
  FileSystem,
  Main,
  Workspace,
}) => {
  const tmpDir = await FileSystem.getTmpDir({ scheme: 'file' })
  const eslintDirectory = `${tmpDir}/node_modules/eslint`
  const eslintEntry = decodeURIComponent(
    new URL(
      import.meta.resolve('../../../node_modules/eslint/lib/api.js'),
    ).pathname.replace(/^\/remote/, ''),
  )
  await FileSystem.mkdir(`${tmpDir}/node_modules`)
  await FileSystem.mkdir(eslintDirectory)
  await FileSystem.setFiles([
    {
      content: JSON.stringify({ main: 'index.cjs', name: 'eslint' }),
      uri: `${eslintDirectory}/package.json`,
    },
    {
      content: `module.exports = require(${JSON.stringify(eslintEntry)})`,
      uri: `${eslintDirectory}/index.cjs`,
    },
  ])
  await FileSystem.writeFiles([
    {
      content: `export default [{ files: ['**/*.yml'], plugins: { demo: { processors: { yaml: { preprocess() { return ['debugger'] }, postprocess(messages) { return messages[0] } } } } }, processor: 'demo/yaml', rules: { 'no-debugger': 'error' } }]`,
      uri: `${tmpDir}/eslint.config.js`,
    },
    {
      content: 'name: yaml lint test',
      uri: `${tmpDir}/test.yml`,
    },
  ])
  await Workspace.setPath(tmpDir)
  const uri = `${tmpDir}/test.yml`
  await Main.openUri(uri)

  await Command.executeExtensionCommand('eslint.lint')
  await Editor.shouldHaveDiagnostics([
    {
      columnIndex: 0,
      endColumnIndex: 8,
      endRowIndex: 0,
      message: "Unexpected 'debugger' statement.",
      rowIndex: 0,
      source: 'no-debugger',
      type: 'error',
    },
  ])
}
