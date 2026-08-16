export const dispose = (): void => {
  setTimeout(() => {
    globalThis.close()
  }, 0)
}
