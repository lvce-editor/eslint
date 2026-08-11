const unavailable = async (method: string): Promise<never> => {
  throw new Error(`fs.promises.${method} is not available in web worker`)
}

export const createNodeFsPromises = () => ({
  readdir: async (): Promise<never> => unavailable('readdir'),
  readFile: async (): Promise<never> => unavailable('readFile'),
  stat: async (): Promise<never> => unavailable('stat'),
  writeFile: async (): Promise<never> => unavailable('writeFile'),
})
