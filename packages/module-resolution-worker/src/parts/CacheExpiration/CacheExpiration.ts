const duration = 90 * 24 * 60 * 60 * 1000

export const getExpirationDate = (now: number = Date.now()): string => {
  return new Date(now + duration).toUTCString()
}
