const getMissingDependency = (message: string): string | undefined => {
  if (message.startsWith('Cannot find ESLint in project node_modules for ')) {
    return 'eslint'
  }
  const match = /^Cannot resolve module '([^']+)' from /.exec(message)
  const specifier = match?.[1]
  if (
    !specifier ||
    !/^(@[\w.-]+\/)?[\w-][\w.-]*(\/[\w.-]+)*$/.test(specifier)
  ) {
    return undefined
  }
  return specifier
}

export const getEslintErrorMessage = (
  message: string,
  hasConfig: boolean,
): string => {
  const dependency = getMissingDependency(message)
  if (dependency) {
    return `ESLint could not find "${dependency}". Project dependencies may not be installed. Run "npm ci" (or "npm install" if there is no package-lock.json) in the project folder.`
  }
  return hasConfig
    ? `ESLint configuration error: ${message}`
    : `ESLint: ${message}`
}
