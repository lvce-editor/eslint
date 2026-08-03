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
  const tmpDir = await FileSystem.loadFixture(
    import.meta.resolve('../fixtures/eslint-project'),
  )
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
