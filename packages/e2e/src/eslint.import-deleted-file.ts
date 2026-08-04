import type {
  Diagnostic,
  Test,
  TestApi,
} from '@lvce-editor/test-with-playwright'

export const name = 'eslint.import-deleted-file'

const lint = async (
  Command: TestApi['Command'],
  FileSystem: TestApi['FileSystem'],
  uri: string,
): Promise<readonly Diagnostic[]> => {
  const text = await FileSystem.readFile(uri)
  return (await Command.executeExtensionCommand('eslint.lint', {
    text,
    uri,
  })) as readonly Diagnostic[]
}

const expectNoDiagnostics = (diagnostics: readonly Diagnostic[]): void => {
  if (diagnostics.length > 0) {
    throw new Error(`Unexpected diagnostics: ${JSON.stringify(diagnostics)}`)
  }
}

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
  const tmpDir = await FileSystem.getTmpDir({ scheme: 'file' })
  const eslintDirectory = `${tmpDir}/node_modules/eslint`
  const eslintEntry = decodeURIComponent(
    new URL(
      import.meta.resolve('../../../node_modules/eslint/lib/api.js'),
    ).pathname.replace(/^\/remote/, ''),
  )
  const mainUri = `${tmpDir}/main.ts`
  const importedUri = `${tmpDir}/a.ts`
  await FileSystem.mkdir(`${tmpDir}/node_modules`)
  await FileSystem.mkdir(eslintDirectory)
  await FileSystem.writeFiles([
    {
      content: JSON.stringify({ main: 'index.cjs', name: 'eslint' }),
      uri: `${eslintDirectory}/package.json`,
    },
    {
      content: `module.exports = require(${JSON.stringify(eslintEntry)})`,
      uri: `${eslintDirectory}/index.cjs`,
    },
    {
      content: `const fs = require('node:fs'); const importPlugin = { rules: { 'no-unresolved': { create(context) { return { ImportDeclaration(node) { const specifier = node.source.value; if (typeof specifier !== 'string' || !specifier.startsWith('./')) return; const directory = context.filename.slice(0, context.filename.lastIndexOf('/')); const resolved = directory + '/' + specifier.slice(2); if (!fs.existsSync(resolved)) context.report({ node: node.source, message: \`Unable to resolve path to module '\${specifier}'.\` }) } } } } } }; module.exports = [{ files: ['**/*.ts'], plugins: { import: importPlugin }, rules: { 'import/no-unresolved': 'error' } }]`,
      uri: `${tmpDir}/eslint.config.js`,
    },
    {
      content: `import { value } from './a.ts'; value.toString()`,
      uri: mainUri,
    },
    { content: `export const value = 1`, uri: importedUri },
  ])
  await Workspace.setPath(tmpDir)
  await Main.openUri(mainUri)

  expectNoDiagnostics(await lint(Command, FileSystem, mainUri))

  const deletedUri = `${tmpDir}/a.deleted`
  await FileSystem.rename(importedUri, deletedUri)
  const diagnosticsAfterDelete = await lint(Command, FileSystem, mainUri)
  if (
    diagnosticsAfterDelete.length !== 1 ||
    diagnosticsAfterDelete[0].source !== 'import/no-unresolved' ||
    diagnosticsAfterDelete[0].message !==
      `Unable to resolve path to module './a.ts'.`
  ) {
    throw new Error(
      `Unexpected diagnostics after delete: ${JSON.stringify(diagnosticsAfterDelete)}`,
    )
  }

  await FileSystem.writeFile(importedUri, `export const value = 1`)
  expectNoDiagnostics(await lint(Command, FileSystem, mainUri))
}
