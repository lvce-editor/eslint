import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'eslint.missing-node-modules-config-import'

export const test: Test = async ({
  expect,
  FileSystem,
  Locator,
  Main,
  Panel,
  Settings,
  Workspace,
}) => {
  const tmpDir = await FileSystem.getTmpDir({ scheme: 'file' })
  await FileSystem.writeFiles([
    {
      content:
        "import { defineConfig } from 'eslint/config'; export default defineConfig([])",
      uri: `${tmpDir}/eslint.config.js`,
    },
    {
      content: '{"private":true,"devDependencies":{"eslint":"^10.0.0"}}',
      uri: `${tmpDir}/package.json`,
    },
    { content: 'const value = 1', uri: `${tmpDir}/test.js` },
  ])
  await Workspace.setPath(tmpDir)
  await Settings.update({ 'editor.diagnostics': true })
  await Main.openUri(`${tmpDir}/test.js`)

  await Panel.open('Problems')
  const message =
    'ESLint could not find "eslint/config". Project dependencies may not be installed. Run "npm ci" (or "npm install" if there is no package-lock.json) in the project folder.'
  const dependencyProblem = Locator('.Problem', { hasText: message })
  await expect(dependencyProblem).toBeVisible()
  const configurationProblem = Locator('.Problem', {
    hasText: 'ESLint configuration error',
  })
  await expect(configurationProblem).toHaveCount(0)
}
