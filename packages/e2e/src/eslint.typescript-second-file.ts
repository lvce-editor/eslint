import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.typescript-second-file'

export const test: Test = async ({ Command, FileSystem, Main, Workspace }) => {
  const workspacePath = decodeURIComponent(
    new URL('../fixtures/typescript-eslint', import.meta.url).pathname.replace(
      /^\/remote/,
      '',
    ),
  )
  await Workspace.setPath(workspacePath)
  for (const file of ['test.ts', 'second.ts']) {
    const uri = `${workspacePath}/${file}`
    await Main.openUri(uri)
    const text = await FileSystem.readFile(uri)
    const diagnostics = (await Command.executeExtensionCommand('eslint.lint', {
      text,
      uri,
    })) as readonly { readonly source: string; readonly type: string }[]
    const actual = diagnostics.map(({ source, type }) => ({ source, type }))
    const expected = [
      { source: '@typescript-eslint/no-explicit-any', type: 'error' },
    ]
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `Unexpected diagnostics for ${file}: ${JSON.stringify(diagnostics)}`,
      )
    }
  }
}
