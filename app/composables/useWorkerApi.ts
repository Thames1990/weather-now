import { createWorkerApi, type WorkerApiCooldown } from '~/utils/worker-api'

export function useWorkerApi(baseUrl: string) {
  const cooldown = useState<WorkerApiCooldown>('weather-now:worker-api-cooldown', () => ({
    blockedUntil: 0,
    blockedReason: 'rate-limited'
  }))
  return createWorkerApi(baseUrl, $fetch, Date.now, cooldown.value)
}
