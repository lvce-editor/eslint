import { CommandNotFoundError } from '../CommandNotFoundError/CommandNotFoundError.ts'
import * as FileSystem from '../FileSystem/FileSystem.ts'

const log = (message: string): void => {
  // eslint-disable-next-line no-console
  console.info(message)
}

export const getFn = (
  method: string,
): ((...args: readonly unknown[]) => unknown) => {
  switch (method) {
    case 'FileSystem.readDirWithFileTypes':
      // @ts-ignore
      return FileSystem.readDirWithFileTypes
    case 'FileSystem.readFile':
      // @ts-ignore
      return FileSystem.readFile
    case 'FileSystem.readFileAsBase64':
      // @ts-ignore
      return FileSystem.readFileAsBase64
    case 'FileSystem.stat':
      // @ts-ignore
      return FileSystem.stat
    case 'OutputChannel.log':
      // @ts-ignore
      return log
    default:
      throw new CommandNotFoundError(method)
  }
}
