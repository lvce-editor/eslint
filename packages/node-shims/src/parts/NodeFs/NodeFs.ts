const unavailable = (method: string): never => {
  throw new Error(`fs.${method} is not available in web worker`)
}

export const createNodeFs = () => ({
  closeSync: (): never => unavailable('closeSync'),
  constants: {
    O_RDONLY: 0,
    O_RDWR: 2,
    O_WRONLY: 1,
  },
  createReadStream: () => ({
    close: (): void => {},
    destroy: (): void => {},
    emit: (): void => {},
    fd: undefined,
    on: (): void => {},
    once: (): void => {},
  }),
  createWriteStream: () => ({
    close: (): void => {},
    destroy: (): void => {},
    emit: (): void => {},
    end: (): void => {},
    fd: undefined,
    on: (): void => {},
    once: (): void => {},
    write: (): void => {},
  }),
  existsSync: (): boolean => false,
  openSync: (): never => unavailable('openSync'),
  readdirSync: (): never => unavailable('readdirSync'),
  readFileSync: (): never => unavailable('readFileSync'),
  statSync: (): never => unavailable('statSync'),
  writeFileSync: (): never => unavailable('writeFileSync'),
})
