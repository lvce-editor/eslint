import * as CacheExpiration from '../CacheExpiration/CacheExpiration.ts'

const compressionThreshold = 16 * 1024
const encodingHeader = 'X-Eslint-Cache-Encoding'

export const create = async (
  content: string,
  contentType: string,
): Promise<Response> => {
  const bytes = new TextEncoder().encode(content)
  let body: Uint8Array<ArrayBuffer> = bytes
  let compressed = false
  if (bytes.byteLength >= compressionThreshold) {
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new CompressionStream('gzip'))
    const packed = new Uint8Array(await new Response(stream).arrayBuffer())
    if (packed.byteLength < bytes.byteLength) {
      body = packed
      compressed = true
    }
  }
  return new Response(body, {
    headers: {
      'Content-Length': String(body.byteLength),
      'Content-Type': contentType,
      Expires: CacheExpiration.getExpirationDate(),
      ...(compressed && { [encodingHeader]: 'gzip' }),
    },
  })
}

export const readText = async (response: Response): Promise<string> => {
  if (response.headers.get(encodingHeader) === 'gzip' && response.body) {
    return new Response(
      response.body.pipeThrough(new DecompressionStream('gzip')),
    ).text()
  }
  return response.text()
}

export const readJson = async (response: Response): Promise<unknown> => {
  return JSON.parse(await readText(response))
}
