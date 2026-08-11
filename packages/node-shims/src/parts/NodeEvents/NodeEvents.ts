class EventEmitter {
  private readonly listeners = new Map<
    string,
    Array<(...args: unknown[]) => void>
  >()

  on(event: string, listener: (...args: unknown[]) => void): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)?.push(listener)
    return this
  }

  emit(event: string, ...args: unknown[]): boolean {
    const listeners = this.listeners.get(event) || []
    for (const listener of listeners) {
      listener(...args)
    }
    return listeners.length > 0
  }

  removeListener(event: string, listener: (...args: unknown[]) => void): this {
    const listeners = this.listeners.get(event) || []
    const index = listeners.indexOf(listener)
    if (index !== -1) {
      listeners.splice(index, 1)
    }
    return this
  }
}

export const createNodeEvents = () => ({ EventEmitter })
