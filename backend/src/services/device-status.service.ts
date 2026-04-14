import { prisma } from '../utils/prisma.js'
import { createLogger } from '../utils/logger.js'

const logger = createLogger()

export interface DeviceStatus {
  timestamp: number
  uptime: number
  state: string
  wifi: string
  mqtt: string
  pump: string
  errors: number
  heap: number
  firmware: string
}

/**
 * Full telemetry status from firmware uses `state`, `wifi`, `mqtt`, etc.
 * Small acks (calibration, pump toggle) omit `wifi` — merge into last_status and avoid setting row `status` to UNKNOWN.
 */
export async function updateDeviceStatus(deviceId: string, status: Record<string, unknown>) {
  try {
    const hasSystemState = typeof status.state === 'string'
    const lifecycle = typeof status.status === 'string' ? status.status : undefined

    if (hasSystemState) {
      const activeState = (status.state as string) || 'UNKNOWN'
      const device = await prisma.device.upsert({
        where: { device_id: deviceId },
        create: {
          device_id: deviceId,
          status: activeState,
          firmware_version: (typeof status.firmware === 'string' ? status.firmware : null) ?? 'unknown',
          last_seen: new Date(),
          last_status: status as object,
        },
        update: {
          status: activeState,
          ...(typeof status.firmware === 'string' ? { firmware_version: status.firmware } : {}),
          last_seen: new Date(),
          last_status: status as object,
        },
      })

      logger.debug(
        { deviceId, state: activeState, pump: status.pump, wifi: status.wifi },
        'Updated device status (full)'
      )

      return {
        id: device.id,
        device_id: device.device_id,
        status: device.status,
        firmware_version: device.firmware_version,
        last_seen: device.last_seen,
        pump: status.pump,
        wifi: status.wifi,
        mqtt: status.mqtt,
        uptime: status.uptime,
        errors: status.errors,
        heap: status.heap,
        raw_status: status,
      }
    }

    const prev = await prisma.device.findUnique({ where: { device_id: deviceId } })
    const prevLs =
      prev?.last_status && typeof prev.last_status === 'object' && !Array.isArray(prev.last_status)
        ? (prev.last_status as Record<string, unknown>)
        : {}
    const merged = { ...prevLs, ...status }

    let nextRowStatus: string | undefined
    if (lifecycle === 'online') nextRowStatus = 'ONLINE'
    else if (lifecycle === 'offline') nextRowStatus = 'offline'

    const fw = typeof status.firmware === 'string' ? status.firmware : undefined

    const device = await prisma.device.upsert({
      where: { device_id: deviceId },
      create: {
        device_id: deviceId,
        status: nextRowStatus ?? 'ONLINE',
        firmware_version: fw ?? 'unknown',
        last_seen: new Date(),
        last_status: merged as object,
      },
      update: {
        last_seen: new Date(),
        last_status: merged as object,
        ...(nextRowStatus ? { status: nextRowStatus } : {}),
        ...(fw ? { firmware_version: fw } : {}),
      },
    })

    logger.debug({ deviceId, lifecycle }, 'Updated device status (partial/merged)')

    return {
      id: device.id,
      device_id: device.device_id,
      status: device.status,
      firmware_version: device.firmware_version,
      last_seen: device.last_seen,
      pump: merged.pump,
      wifi: merged.wifi,
      mqtt: merged.mqtt,
      uptime: merged.uptime,
      errors: merged.errors,
      heap: merged.heap,
      raw_status: merged,
    }
  } catch (err) {
    logger.error({ err, deviceId }, 'Failed to update device status')
    throw err
  }
}

export async function getDeviceStatus(deviceId: string) {
  try {
    const device = await prisma.device.findUnique({
      where: { device_id: deviceId },
    })

    if (!device) {
      return null
    }

    return {
      id: device.id,
      device_id: device.device_id,
      name: device.name,
      location: device.location,
      status: device.status,
      firmware_version: device.firmware_version,
      last_seen: device.last_seen,
      created_at: device.created_at,
      last_status: device.last_status,
      last_power: device.last_power,
    }
  } catch (err) {
    logger.error({ err, deviceId }, 'Failed to get device status')
    throw err
  }
}

export async function updateDevicePower(deviceId: string, powerPayload: any) {
  try {
    const device = await prisma.device.upsert({
      where: { device_id: deviceId },
      create: {
        device_id: deviceId,
        last_seen: new Date(),
        last_power: powerPayload as any,
      },
      update: {
        last_seen: new Date(),
        last_power: powerPayload as any,
      },
    })

    logger.debug({ deviceId, power: powerPayload }, 'Updated device power')

    return device
  } catch (err) {
    logger.error({ err, deviceId, powerPayload }, 'Failed to update device power')
    throw err
  }
}

export async function updateDeviceHeartbeat(deviceId: string, hb: any) {
  try {
    const device = await prisma.device.upsert({
      where: { device_id: deviceId },
      create: {
        device_id: deviceId,
        last_seen: new Date(),
        last_status: hb as any,
      },
      update: {
        last_seen: new Date(),
        last_status: hb as any,
      },
    })

    logger.debug({ deviceId, heartbeat: hb }, 'Updated device heartbeat')
    return device
  } catch (err) {
    logger.error({ err, deviceId, hb }, 'Failed to update device heartbeat')
    throw err
  }
}
