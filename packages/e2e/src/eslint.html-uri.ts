import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.html-uri'

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
  const workspaceName = `eslint-opfs-${Date.now()}`
  const workspaceUri = `html:///${workspaceName}`
  const opfsRoot = await FileSystem.getOpfsRoot()
  const directoryHandle = await opfsRoot.getDirectoryHandle(workspaceName, {
    create: true,
  })
  await Command.execute(
    'PersistentFileHandle.addHandle',
    workspaceUri,
    directoryHandle,
  )

  const eslintDirectory = `${workspaceUri}/node_modules/eslint`
  const eslintEntry = decodeURIComponent(
    new URL(
      import.meta.resolve('../../../node_modules/eslint/lib/api.js'),
    ).pathname.replace(/^\/remote/, ''),
  )
  await FileSystem.mkdir(`${workspaceUri}/node_modules`)
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
  const uri = `${workspaceUri}/test.js`
  const text = 'debugger'
  await FileSystem.writeFile(uri, text)
  await Workspace.setPath(workspaceUri)
  await Main.openUri(uri)

  const diagnostics = (await Command.executeExtensionCommand('eslint.lint', {
    text,
    uri,
  })) as readonly { source: string; type: string }[]
  const actualDiagnostics = diagnostics.map(({ source, type }) => ({
    source,
    type,
  }))
  const expectedDiagnostics = [{ source: 'no-debugger', type: 'error' }]
  if (
    JSON.stringify(actualDiagnostics) !== JSON.stringify(expectedDiagnostics)
  ) {
    throw new Error(`Unexpected diagnostics: ${JSON.stringify(diagnostics)}`)
  }
}
