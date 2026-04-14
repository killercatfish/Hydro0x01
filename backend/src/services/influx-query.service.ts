import { QueryApi } from '@influxdata/influxdb-client'
import { queryApi } from '../utils/influx.js'
import { validateEnv } from '../config/env.js'
import { createLogger } from '../utils/logger.js'

const env = validateEnv()
const logger = createLogger()

export interface TelemetryPoint {
  timestamp: string
  sensor: string
  value: number
}

/*export async function queryTelemetry(
  deviceId: string,
  range: string = '24h',
  sensor?: string
)*/
export async function queryTelemetry(
  deviceId: string,
  range: string = '24h',
  sensor?: string,
  limit: number = 200,
  interval: string = '1m'
): Promise<TelemetryPoint[]> {
  try {
    // Build Flux query
    /*let fluxQuery = `
      from(bucket: "${env.INFLUX_BUCKET}")
        |> range(start: -${range})
        |> filter(fn: (r) => r.device_id == "${deviceId}" and r._measurement == "hydro_telemetry")
    `*/
    let fluxQuery = `
      from(bucket: "${env.INFLUX_BUCKET}")
        |> range(start: -${range})
        |> filter(fn: (r) => r._measurement == "hydro_telemetry")
        |> filter(fn: (r) => r.device_id == "${deviceId}")
      `
    // Filter by specific sensor if provided
    if (sensor) {
      fluxQuery += `|> filter(fn: (r) => r.sensor == "${sensor}")`
    }

    fluxQuery += `|> aggregateWindow(every: ${interval}, fn: mean, createEmpty: false)`

    fluxQuery += `
      |> sort(columns: ["_time"], desc: true)
      |> limit(n: ${limit})
    `
    
    logger.debug({ deviceId, range, sensor }, 'Querying InfluxDB')

    const rows: TelemetryPoint[] = []

    return new Promise((resolve, reject) => {
      queryApi.queryRows(fluxQuery, {
        next(row: string[], tableMeta: any) {
          try {
            const obj = tableMeta.toObject(row)
            rows.push({
              timestamp: obj._time,
              sensor: obj.sensor,
              value: obj._value,
            })
          } catch (err) {
            logger.error({ err }, 'Failed to parse telemetry row')
          }
        },
        error(err: Error) {
          logger.error({ err, deviceId }, 'InfluxDB query error')
          reject(err)
        },
        complete() {
          logger.debug({ deviceId, count: rows.length }, 'InfluxDB query complete')
          resolve(rows)
        },
      })
    })
  } catch (err) {
    logger.error({ err, deviceId }, 'Failed to query telemetry')
    throw err
  }
}

export async function queryLatestTelemetry(deviceId: string): Promise<Record<string, number>> {
  try {
    const fluxQuery = `
      from(bucket: "${env.INFLUX_BUCKET}")
        |> range(start: -1h)
        |> filter(fn: (r) => r.device_id == "${deviceId}" and r._measurement == "hydro_telemetry")
        |> group(columns: ["sensor"])
        |> last()
    `

    logger.debug({ deviceId }, 'Querying latest telemetry')

    const result: Record<string, number> = {}

    return new Promise((resolve, reject) => {
      queryApi.queryRows(fluxQuery, {
        next(row: string[], tableMeta: any) {
          try {
            const obj = tableMeta.toObject(row)
            result[obj.sensor] = obj._value
          } catch (err) {
            logger.error({ err }, 'Failed to parse telemetry row')
          }
        },
        error(err: Error) {
          logger.error({ err, deviceId }, 'InfluxDB query error')
          reject(err)
        },
        complete() {
          logger.debug({ deviceId, sensors: Object.keys(result).length }, 'Latest telemetry query complete')
          resolve(result)
        },
      })
    })
  } catch (err) {
    logger.error({ err, deviceId }, 'Failed to query latest telemetry')
    throw err
  }
}
