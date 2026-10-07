import { isValidCoordinates } from '~/utils/provider-validation'

export function parseCoordinates(latitude: unknown, longitude: unknown): { latitude: number; longitude: number } {
  const parsedLatitude = Number(latitude)
  const parsedLongitude = Number(longitude)
  if (!isValidCoordinates(parsedLatitude, parsedLongitude)) {
    throw createError({ statusCode: 400, statusMessage: 'latitude and longitude must be valid coordinates' })
  }
  return { latitude: parsedLatitude, longitude: parsedLongitude }
}

export async function fetchAndParseProviderResponse<T>(
  request: () => Promise<unknown>,
  parse: (payload: unknown) => T,
  providerName: string
): Promise<T> {
  let payload: unknown
  try {
    payload = await request()
  } catch {
    throw createError({ statusCode: 502, statusMessage: `Upstream ${providerName} provider unavailable` })
  }

  try {
    return parse(payload)
  } catch {
    throw createError({ statusCode: 502, statusMessage: `Invalid ${providerName} provider response` })
  }
}
