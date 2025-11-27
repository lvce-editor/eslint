import * as FileSystem from '../FileSystem/FileSystem.ts'

export const loadEslintConfig = async (
  configFilePath: string,
): Promise<unknown> => {
  const content = await FileSystem.readFile(configFilePath)

  // Handle JSON config files
  if (
    configFilePath.endsWith('.json') ||
    configFilePath.endsWith('.eslintrc')
  ) {
    return JSON.parse(content)
  }

  // Handle YAML config files (basic support)
  if (configFilePath.endsWith('.yaml') || configFilePath.endsWith('.yml')) {
    // For now, we'll need a YAML parser. For simplicity, we'll throw an error
    // and suggest using JSON instead
    throw new Error(
      'YAML config files are not yet supported. Please use JSON format.',
    )
  }

  // Handle JavaScript config files
  // Note: In a web worker, we can't easily evaluate JS code.
  // This would require either:
  // 1. Loading the config on the server side and passing the evaluated result
  // 2. Using a bundler that can handle dynamic imports
  // 3. Using eval() (not recommended for security reasons)
  if (
    configFilePath.endsWith('.js') ||
    configFilePath.endsWith('.mjs') ||
    configFilePath.endsWith('.cjs')
  ) {
    // For now, we'll try to use dynamic import if the file is accessible as a URL
    // This might work if the bundler handles it, but likely won't work in a web worker
    // A better approach would be to load and evaluate on the server side
    throw new Error(
      'JavaScript config files require server-side evaluation. Please use JSON format or implement server-side config loading.',
    )
  }

  // Default: try to parse as JSON
  try {
    return JSON.parse(content)
  } catch {
    throw new Error(`Unable to parse config file: ${configFilePath}`)
  }
}

