import { Point } from '@influxdata/influxdb-client'
import { writeApi } from '../utils/influx.js'
import { createLogger } from '../utils/logger.js'

const logger = createLogger()
/*
export async function writeTelemetry(
  deviceId: string,
  sensorType: string,
  sensorName: string,
  value: number
) {
  try {

    if (!Number.isFinite(value)) {
      logger.warn({ deviceId, sensorName, value }, 'Invalid telemetry value')
      return
    }

    const sensor = `${sensorType}_${sensorName}`

    const point = new Point('hydro_telemetry')
      .tag('device_id', deviceId)
      .tag('sensor', sensor)
      .floatField('value', value)
    writeApi.writePoint(point)

    // Informational log so ingestion can be traced in runtime logs
    logger.info({ deviceId, sensor, value }, 'Telemetry point queued for write')

    // Optional debug: flush immediately to surface write errors during development
    if (process.env.DEBUG_INFLUX === 'true') {
      try {
        await writeApi.flush()
        logger.info({ deviceId, sensor }, 'InfluxDB write flushed (debug)')
      } catch (flushErr) {
        logger.error({ err: flushErr, deviceId, sensor }, 'Failed to flush InfluxDB writes')
      }
    }

  } catch (err) {
    logger.error(
      { err, deviceId, sensorType, sensorName },
      'Failed to write telemetry'
    )
  }
}*/

export async function writeTelemetry(
  deviceId: string,
  sensor: string,
  value: number
) {
  try {

    if (!Number.isFinite(value)) {
      logger.warn({ deviceId, sensor, value }, 'Invalid telemetry value')
      return
    }

    const point = new Point('hydro_telemetry')
      .tag('device_id', deviceId)
      .tag('sensor', sensor)
      .floatField('value', value)

    writeApi.writePoint(point)

    logger.info({ deviceId, sensor, value }, 'Telemetry point queued')

    if (process.env.DEBUG_INFLUX === 'true') {
      await writeApi.flush()
    }

  } catch (err) {
    logger.error(
      { err, deviceId, sensor },
      'Failed to write telemetry'
    )
  }
}


