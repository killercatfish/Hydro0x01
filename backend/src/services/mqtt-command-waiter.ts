/**
 * One-shot wait for a matching JSON payload on device .../status (calibration / tank acks).
 * Serialized per deviceId to avoid mixed responses.
 */

type Predicate = (data: Record<string, unknown>) => boolean

type Entry = {
  predicate: Predicate
  resolve: (v: Record<string, unknown>) => void
  timer: ReturnType<typeof setTimeout>
}

const pending = new Map<string, Entry>()

export function notifyStatusWaiters(deviceId: string, data: Record<string, unknown>) {
  const w = pending.get(deviceId)
  if (!w) return
  try {
    if (w.predicate(data)) {
      clearTimeout(w.timer)
      pending.delete(deviceId)
      w.resolve(data)
    }
  } catch {
    // ignore predicate errors
  }
}

export function waitForStatusJson(
  deviceId: string,
  predicate: Predicate,
  timeoutMs: number
): Promise<Record<string, unknown>> {
  if (pending.has(deviceId)) {
    return Promise.reject(new Error('Device has a pending command; wait and retry'))
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(deviceId)
      reject(new Error('Timeout waiting for device response'))
    }, timeoutMs)
    pending.set(deviceId, {
      predicate,
      resolve: (v) => {
        clearTimeout(timer)
        pending.delete(deviceId)
        resolve(v)
      },
      timer,
    })
  })
}
