const toHex = (bytes: Uint8Array): string => {
  let result = ''
  for (const byte of bytes) {
    result += byte.toString(16).padStart(2, '0')
  }
  return result
}

export const computeBytesHash = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new Uint8Array(bytes).buffer,
  )
  return toHex(new Uint8Array(digest))
}

export const computeTextHash = (text: string): Promise<string> => {
  return computeBytesHash(new TextEncoder().encode(text))
}
