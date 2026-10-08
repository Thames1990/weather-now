import { parseIpLocationResult, type IpLocationResult } from '#shared/weather/provider-validation'
import { fetchAndParseProviderResponse } from '../utils/provider'

export default defineEventHandler(async (): Promise<IpLocationResult> => {
  return fetchAndParseProviderResponse(
    (): Promise<unknown> => $fetch<unknown>('https://ipinfo.io/json'),
    parseIpLocationResult,
    'IP location'
  )
})
