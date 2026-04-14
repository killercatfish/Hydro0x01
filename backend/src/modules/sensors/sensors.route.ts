import { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { validateEnv } from '../../config/env.js'
import { mqttPublish } from '../../services/mqtt.service.js'
import { getSensorStatus } from '../../services/sensor-status-cache.js'
import { waitForStatusJson } from '../../services/mqtt-command-waiter.js'

const env = validateEnv()

const CALIBRATION_TIMEOUT_MS = 10_000

async function waitForFreshSensorStatus(deviceId: string, sinceMs: number) {
  const deadline = Date.now() + CALIBRATION_TIMEOUT_MS
  while (Date.now() < deadline) {
    const row = getSensorStatus(deviceId)
    if (row && row.updatedAt >= sinceMs) {
      return row
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  return getSensorStatus(deviceId)
}

function phResponsePredicate(point: string) {
  return (d: Record<string, unknown>) => {
    if (typeof d.ph_cal !== 'string') return false
    if (point === 'mid') return d.ph_cal === 'mid_done'
    if (point === 'low') return d.ph_cal === 'complete'
    if (point === 'reset') return d.ph_cal === 'reset'
    return false
  }
}

function ecResponsePredicate(point: string) {
  return (d: Record<string, unknown>) => {
    if (typeof d.ec_cal !== 'string') return false
    if (point === 'dry') return d.ec_cal === 'dry_done'
    if (point === 'solution') return d.ec_cal === 'complete'
    if (point === 'reset') return d.ec_cal === 'reset'
    return false
  }
}

export async function sensorsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>()

  app.get(
    '/api/sensors/status',
    {
      schema: {
        querystring: z.object({
          deviceId: z.string().min(1),
          refresh: z
            .union([z.enum(['true', 'false']), z.boolean(), z.string()])
            .optional()
            .transform((v) => {
              if (v === undefined || v === null || v === '') return false
              if (typeof v === 'boolean') return v
              const s = String(v).toLowerCase()
              return s === 'true' || s === '1' || s === 'yes'
            }),
        }),
      },
    },
    async (request, reply) => {
      const { deviceId, refresh } = request.query
      if (refresh) {
        const t0 = Date.now()
        await mqttPublish(`${env.MQTT_BASE_TOPIC}/${deviceId}/cmd/sensors`, JSON.stringify({ action: 'status' }))
        const row = await waitForFreshSensorStatus(deviceId, t0)
        if (!row) {
          return reply.status(504).send({ error: 'No sensor status received within timeout' })
        }
        return { deviceId, ...row.payload, updatedAt: row.updatedAt }
      }
      const row = getSensorStatus(deviceId)
      if (!row) {
        return reply.status(404).send({ error: 'No cached sensor status; try refresh=true' })
      }
      return { deviceId, ...row.payload, updatedAt: row.updatedAt }
    }
  )

  app.post(
    '/api/calibrate/ph',
    {
      schema: {
        body: z.object({
          deviceId: z.string(),
          point: z.enum(['mid', 'low', 'reset']),
          standard: z.number().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { deviceId, point, standard } = request.body
      const cached = getSensorStatus(deviceId)
      if (!cached) {
        return reply.status(404).send({
          error: 'No sensor status cache. Call GET /api/sensors/status?deviceId=…&refresh=true first.',
        })
      }
      if (!cached.payload?.ph?.enabled) {
        return reply.status(400).send({ error: 'pH sensor is not enabled on this device.' })
      }
      const payload: Record<string, unknown> = { action: 'calibrate', point }
      if (standard !== undefined) payload.standard = standard
      const wait = waitForStatusJson(deviceId, phResponsePredicate(point), CALIBRATION_TIMEOUT_MS)
      try {
        await mqttPublish(`${env.MQTT_BASE_TOPIC}/${deviceId}/cmd/ph`, JSON.stringify(payload))
        const result = await wait
        return { ok: true, deviceId, result }
      } catch (e: any) {
        const msg = String(e?.message ?? e)
        if (msg.includes('pending command')) {
          return reply.status(409).send({ error: msg })
        }
        return reply.status(504).send({ error: msg })
      }
    }
  )

  app.post(
    '/api/calibrate/ec',
    {
      schema: {
        body: z.object({
          deviceId: z.string(),
          point: z.enum(['dry', 'solution', 'reset']),
          standard: z.number().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { deviceId, point, standard } = request.body
      const cached = getSensorStatus(deviceId)
      if (!cached) {
        return reply.status(404).send({
          error: 'No sensor status cache. Call GET /api/sensors/status?deviceId=…&refresh=true first.',
        })
      }
      if (!cached.payload?.ec?.enabled) {
        return reply.status(400).send({ error: 'EC sensor is not enabled on this device.' })
      }
      const payload: Record<string, unknown> = { action: 'calibrate', point }
      if (standard !== undefined) payload.standard = standard
      const wait = waitForStatusJson(deviceId, ecResponsePredicate(point), CALIBRATION_TIMEOUT_MS)
      try {
        await mqttPublish(`${env.MQTT_BASE_TOPIC}/${deviceId}/cmd/ec`, JSON.stringify(payload))
        const result = await wait
        return { ok: true, deviceId, result }
      } catch (e: any) {
        const msg = String(e?.message ?? e)
        if (msg.includes('pending command')) {
          return reply.status(409).send({ error: msg })
        }
        return reply.status(504).send({ error: msg })
      }
    }
  )
}
