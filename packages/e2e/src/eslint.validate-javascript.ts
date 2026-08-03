import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.validate-javascript'

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
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
  await FileSystem.writeFile(`${tmpDir}/test.js`, 'debugger')
  await Workspace.setPath(tmpDir)
  await Main.openUri(`${tmpDir}/test.js`)

  const uri = `${tmpDir}/test.js`
  const text = await FileSystem.readFile(uri)
  const diagnostics = (await Command.executeExtensionCommand('eslint.lint', {
    text,
    uri,
  })) as any[]
  if (diagnostics.length !== 1 || diagnostics[0].source !== 'no-debugger') {
    throw new Error(`Unexpected diagnostics: ${JSON.stringify(diagnostics)}`)
  }
}
