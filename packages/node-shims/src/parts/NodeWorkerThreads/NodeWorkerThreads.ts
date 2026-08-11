class Worker {
  constructor() {
    throw new Error('Worker threads are not available in web worker')
  }
}

export const createNodeWorkerThreads = () => ({
  isMainThread: false,
  parentPort: null,
  Worker,
  workerData: null,
})
