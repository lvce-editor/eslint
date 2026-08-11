export const createNodeTty = () => ({
  isatty: (): boolean => false,
  ReadStream: class {},
  WriteStream: class {},
})
