import { CommandNotFoundError } from '../CommandNotFoundError/CommandNotFoundError.ts'
import * as FileSystem from '../FileSystem/FileSystem.ts'
import * as Lint from '../Lint/Lint.ts'

const log = (message: string): void => {
  // eslint-disable-next-line no-console
  console.info(message)
}

export const getFn = (
  method: string,
): ((...args: readonly unknown[]) => unknown) => {
  switch (method) {
    case 'OutputChannel.log':
      // @ts-ignore
      return log
    case 'Lint.lint':
      // @ts-ignore
      return Lint.lint
    case 'FileSystem.readFile':
      // @ts-ignore
      return FileSystem.readFile
    case 'FileSystem.readDirWithFileTypes':
      // @ts-ignore
      return FileSystem.readDirWithFileTypes
    case 'FileSystem.stat':
      // @ts-ignore
      return FileSystem.stat
    default:
      throw new CommandNotFoundError(method)
  }
}
