const roundNumber = (value: number): number => {
  return Math.round(value * 1000) / 1000
}

export const stringifyPerformanceTrace = (trace: object): string => {
  return JSON.stringify(
    trace,
    (_key, value: unknown) =>
      typeof value === 'number' ? roundNumber(value) : value,
    2,
  )
}
