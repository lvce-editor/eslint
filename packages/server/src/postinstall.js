import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', '..', '..')
const staticPath = join(
  root,
  'node_modules',
  '@lvce-editor',
  'static-server',
  'static',
)
const directories = await readdir(staticPath)
const commitHash = directories.find((name) => /^[a-f0-9]{7}$/.test(name))
if (!commitHash) throw new Error('Static server commit directory not found')
const testWorkerPath = join(
  staticPath,
  commitHash,
  'packages',
  'test-worker',
  'dist',
  'testWorkerMain.js',
)
const content = await readFile(testWorkerPath, 'utf8')
const marker =
  '// Await streamed diagnostics before checking the cached result.'
if (!content.includes(marker)) {
  const pattern =
    /const shouldHaveDiagnostics = async expectedDiagnostics => \{\n  const key = await getEditorKey\(\);\n  const diagnostics = await (invoke\$\d+)\('Editor.getDiagnostics', key\);/
  if (!pattern.test(content))
    throw new Error('Expected diagnostic assertion helper not found')
  const replacement = content.replace(
    pattern,
    (
      _match,
      invoke,
    ) => `const shouldHaveDiagnostics = async expectedDiagnostics => {
  const key = await getEditorKey();
  ${marker}
  await ${invoke}('Editor.waitForDiagnostics', key);
  const diagnostics = await ${invoke}('Editor.getDiagnostics', key);`,
  )
  await writeFile(testWorkerPath, replacement)
}
