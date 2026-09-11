export default defineEventHandler(async () => {
  try {
    const place = await $fetch<{ city?: string; country?: string; loc?: string }>('https://ipinfo.io/json')
    const [latitude, longitude] = (place.loc || '').split(',').map(Number)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw createError({ statusCode: 502, statusMessage: 'IP location coordinates unavailable' })
    }
    return { name: place.city || '', country: place.country || '', latitude, longitude }
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Upstream IP location provider unavailable' })
  }
})
