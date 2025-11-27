import { CommandNotFoundError } from '../CommandNotFoundError/CommandNotFoundError.ts'
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
    default:
      throw new CommandNotFoundError(method)
  }
}
