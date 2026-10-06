export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export const UPSTREAM_TIMEOUT_MS = 8000
const MAX_BODY_BYTES = 1_000_000

export async function fetchJson(url: URL): Promise<unknown> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ApiError(504, 'upstream_timeout', 'Provider request timed out'))
      controller.abort()
    }, UPSTREAM_TIMEOUT_MS)
  })

  const operation = async (): Promise<unknown> => {
    let response: Response
    try {
      response = await fetch(url.toString(), {
        signal: controller.signal,
        redirect: 'manual',
        headers: { Accept: 'application/json' }
      })
    } catch {
      throw new ApiError(502, 'upstream_network', 'Provider unavailable')
    }
    if (!response.ok) {
      await response.body?.cancel()
      if (response.status === 429) {
        throw new ApiError(429, 'upstream_rate_limited', 'Provider rate limit reached')
      }
      throw new ApiError(502, 'upstream_status', 'Provider returned an unsuccessful response')
    }
    if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json' || !response.body) {
      await response.body?.cancel()
      throw new ApiError(502, 'upstream_invalid', 'Invalid provider response')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let bytes = 0
    let text = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > MAX_BODY_BYTES) {
          await reader.cancel()
          throw new ApiError(502, 'upstream_invalid', 'Provider response exceeds size limit')
        }
        text += decoder.decode(value, { stream: true })
      }
      text += decoder.decode()
      return JSON.parse(text) as unknown
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw new ApiError(502, 'upstream_invalid', 'Invalid provider response')
    } finally {
      reader.releaseLock()
    }
  }

  try {
    return await Promise.race([operation(), deadline])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
