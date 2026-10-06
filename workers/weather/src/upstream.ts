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

export type FetchJsonOptions = {
  /** Reads a provider 400 JSON body and returns true when it means the requested resource does not exist. */
  isNotFound?: (payload: unknown) => boolean
}

async function readJson(response: Response): Promise<unknown> {
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

export async function fetchJson(url: URL, options: FetchJsonOptions = {}): Promise<unknown> {
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
    if (response.status === 400 && options.isNotFound) {
      let payload: unknown
      try {
        payload = await readJson(response)
      } catch {
        throw new ApiError(502, 'upstream_status', 'Provider returned an unsuccessful response')
      }
      if (options.isNotFound(payload)) throw new ApiError(404, 'location_not_found', 'Location not found')
      throw new ApiError(502, 'upstream_status', 'Provider returned an unsuccessful response')
    }
    if (!response.ok) {
      await response.body?.cancel()
      if (response.status === 429) {
        throw new ApiError(429, 'upstream_rate_limited', 'Provider rate limit reached')
      }
      throw new ApiError(502, 'upstream_status', 'Provider returned an unsuccessful response')
    }
    return await readJson(response)
  }

  try {
    return await Promise.race([operation(), deadline])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
