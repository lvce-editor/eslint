import * as FileSystem from '../FileSystem/FileSystem.ts'

const configFileNames = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yaml',
  '.eslintrc.yml',
  '.eslintrc',
]

export const findEslintConfig = async (
  filePath: string,
): Promise<string | null> => {
  const pathParts = filePath.split('/')
  const fileName = pathParts.pop()
  if (!fileName) {
    return null
  }

  let currentDir = pathParts.join('/')
  if (!currentDir) {
    currentDir = '/'
  }

  // Search up the directory tree
  const maxDepth = 10
  let depth = 0

  while (depth < maxDepth) {
    try {
      const entries = await FileSystem.readDirWithFileTypes(currentDir)
      const configFile = entries.find(
        (entry) => entry.isFile && configFileNames.includes(entry.name),
      )

      if (configFile) {
        return `${currentDir}/${configFile.name}`
      }

      // Move up one directory
      if (currentDir === '/' || currentDir === '') {
        break
      }
      const parts = currentDir.split('/')
      parts.pop()
      currentDir = parts.length > 0 ? parts.join('/') : '/'
      depth++
    } catch {
      // Directory doesn't exist or can't be read
      break
    }
  }

  return null
}
