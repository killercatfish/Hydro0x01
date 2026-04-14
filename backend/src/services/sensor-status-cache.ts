/**
 * Latest JSON payload from device .../sensors/status (in-memory).
 */

export interface SensorStatusPayload {
  ultrasonic?: { enabled?: boolean; ok?: boolean; error?: string }
  ph?: { enabled?: boolean; ok?: boolean; error?: string }
  ec?: { enabled?: boolean; ok?: boolean; error?: string }
  temperature?: { enabled?: boolean; ok?: boolean; error?: string }
  air?: { enabled?: boolean; ok?: boolean; error?: string }
  [key: string]: unknown
}

const cache = new Map<string, { payload: SensorStatusPayload; updatedAt: number }>()

export function setSensorStatus(deviceId: string, payload: SensorStatusPayload) {
  cache.set(deviceId, { payload, updatedAt: Date.now() })
}

export function getSensorStatus(deviceId: string) {
  return cache.get(deviceId) ?? null
}
