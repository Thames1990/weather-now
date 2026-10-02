import { parseIpLocationResult } from '~/utils/provider-validation'

export default defineEventHandler(async () => {
  let payload: unknown
  try {
    payload = await $fetch<unknown>('https://ipinfo.io/json')
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Upstream IP location provider unavailable' })
  }

  try {
    return parseIpLocationResult(payload)
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Invalid IP location provider response' })
  }
})
