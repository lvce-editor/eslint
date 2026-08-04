import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.plugin-yml'

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
  const workspacePath = decodeURIComponent(
    new URL('../fixtures/eslint-plugin-yml', import.meta.url).pathname.replace(
      /^\/remote/,
      '',
    ),
  )
  const uri = `${workspacePath}/test.yml`
  await Workspace.setPath(workspacePath)
  await Main.openUri(uri)

  const text = await FileSystem.readFile(uri)
  const diagnostics = (await Command.executeExtensionCommand('eslint.lint', {
    text,
    uri,
  })) as readonly { readonly source: string; readonly type: string }[]
  const actual = diagnostics.map(({ source, type }) => ({ source, type }))
  const expected = [{ source: 'yml/no-empty-document', type: 'error' }]
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected diagnostics: ${JSON.stringify(diagnostics)}`)
  }
}
