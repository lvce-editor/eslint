import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.validate-javascript'

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
  const tmpDir = await FileSystem.getTmpDir()
  await FileSystem.writeFile(`${tmpDir}/test.js`, 'debugger')
  await Workspace.setPath(tmpDir)
  await Main.openUri(`${tmpDir}/test.js`)

  const uri = `${tmpDir}/test.js`
  const text = await FileSystem.readFile(uri)
  const diagnostics = (await Command.executeExtensionCommand(
    'eslint.lint',
    {
      text,
      uri,
    },
  )) as any[]
  if (diagnostics.length !== 1 || diagnostics[0].source !== 'no-debugger') {
    throw new Error(`Unexpected diagnostics: ${JSON.stringify(diagnostics)}`)
  }
}
