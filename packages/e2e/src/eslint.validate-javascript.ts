import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.validate-javascript'

export const test: Test = async ({
  FileSystem,
  Main,
  Editor,
  Locator,
  expect,
}) => {
  // arrange
  await Editor.enableDiagnostics()
  const tmpDir = await FileSystem.getTmpDir()
  await FileSystem.writeFile(
    `${tmpDir}/test.js`,
    `let x = '1'

x++`,
  )
  await Main.openUri(`${tmpDir}/test.js`)

  // act
  // await Editor.format()

  // // assert
  // const editor = Locator('.Editor')
  // await expect(editor).toHaveText(`h1 {  font-size: 10px;}`)

  // TODO check for diagnostics
}
