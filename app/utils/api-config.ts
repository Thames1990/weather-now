export const apiModes = ['server', 'external', 'worker'] as const
export type ApiMode = typeof apiModes[number]

export type ApiConfig = {
  apiMode: ApiMode
  apiBaseUrl: string
}

function isApiMode(value: string): value is ApiMode {
  return (apiModes as readonly string[]).includes(value)
}

/**
 * Resolves the public API settings from build-time environment variables.
 * Invalid combinations fail the build instead of shipping a frontend that silently calls the wrong backend.
 */
export function resolveApiConfig(env: Record<string, string | undefined>): ApiConfig {
  const apiMode = env.NUXT_PUBLIC_API_MODE?.trim() || 'server'
  if (!isApiMode(apiMode)) {
    throw new Error(`NUXT_PUBLIC_API_MODE must be one of ${apiModes.join(', ')}; received "${apiMode}"`)
  }

  const rawBaseUrl = env.NUXT_PUBLIC_API_BASE_URL?.trim() || ''
  if (apiMode !== 'worker') return { apiMode, apiBaseUrl: rawBaseUrl.replace(/\/+$/, '') }

  let url: URL
  try {
    url = new URL(rawBaseUrl)
  } catch {
    throw new Error('NUXT_PUBLIC_API_BASE_URL must be an absolute URL when NUXT_PUBLIC_API_MODE=worker')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('NUXT_PUBLIC_API_BASE_URL must use http or https')
  }
  if (url.search || url.hash || url.username || url.password) {
    throw new Error('NUXT_PUBLIC_API_BASE_URL must not contain credentials, a query string, or a fragment')
  }
  return { apiMode, apiBaseUrl: url.href.replace(/\/+$/, '') }
}
