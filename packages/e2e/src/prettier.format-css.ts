import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'prettier.format-css'

export const skip = 1

export const test: Test = async ({
  Editor,
  expect,
  FileSystem,
  Locator,
  Main,
}) => {
  // arrange
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
  await FileSystem.writeFile(
    `${tmpDir}/test.css`,
    `h1 {
  font-size:10px
}`,
  )
  await Main.openUri(`${tmpDir}/test.css`)

  // act
  await Editor.format()

  // assert
  const editor = Locator('.Editor')
  await expect(editor).toHaveText(`h1 {  font-size: 10px;}`)
}
