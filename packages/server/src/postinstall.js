// import { readFile, readdir, writeFile } from 'node:fs/promises'
// import { join } from 'node:path'
// import { pathToFileURL } from 'node:url'

// const __dirname = import.meta.dirname

// const root = join(__dirname, '..', '..', '..')

// export const getRemoteUrl = (path) => {
//   const url = pathToFileURL(path).toString().slice(8)
//   return `/remote/${url}`
// }

// const nodeModulesPath = join(root, 'packages', 'server', 'node_modules')

// const workerPath = join(root, '.tmp', 'dist', 'dist', 'explorerViewWorkerMain.js')

// const serverStaticPath = join(nodeModulesPath, '@lvce-editor', 'static-server', 'static')

// const RE_COMMIT_HASH = /^[a-z\d]+$/
// const isCommitHash = (dirent) => {
//   return dirent.length === 7 && dirent.match(RE_COMMIT_HASH)
// }

// const dirents = await readdir(serverStaticPath)
// const commitHash = dirents.find(isCommitHash) || ''
// const rendererWorkerMainPath = join(serverStaticPath, commitHash, 'packages', 'renderer-worker', 'dist', 'rendererWorkerMain.js')

// const content = await readFile(rendererWorkerMainPath, 'utf-8')

// const remoteUrl = getRemoteUrl(workerPath)
// if (!content.includes('// const explorerWorkerUrl = ')) {
//   const occurrence = `const explorerWorkerUrl = \`\${assetDir}/packages/explorer-worker/dist/explorerViewWorkerMain.js\``
//   const replacement = `// const explorerWorkerUrl = \`\${assetDir}/packages/explorer-worker/dist/explorerViewWorkerMain.js\`
// const explorerWorkerUrl = \`${remoteUrl}\``

//   const newContent = content.replace(occurrence, replacement)
//   await writeFile(rendererWorkerMainPath, newContent)
// }
