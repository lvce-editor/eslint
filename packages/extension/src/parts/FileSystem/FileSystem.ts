export const readFile = async (path: string): Promise<string> => {
  // @ts-ignore
  return await vscode.executeCommand('FileSystem.readFile', path)
}

export const readDirWithFileTypes = async (
  path: string,
): Promise<
  Array<{
    name: string
    isFile: boolean
    isDirectory: boolean
  }>
> => {
  // @ts-ignore
  return await vscode.executeCommand('FileSystem.readDirWithFileTypes', path)
}

export const stat = async (
  path: string,
): Promise<{
  isFile: boolean
  isDirectory: boolean
}> => {
  // @ts-ignore
  return await vscode.executeCommand('FileSystem.stat', path)
}
