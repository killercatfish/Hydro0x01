import { InfluxDB, WriteApi, QueryApi } from '@influxdata/influxdb-client'
import { validateEnv } from '../config/env.js'
import { createLogger } from './logger.js'

const env = validateEnv()
const logger = createLogger()

const influxDB = new InfluxDB({ 
  url: env.INFLUX_URL, 
  token: env.INFLUX_TOKEN 
})

export const writeApi: WriteApi = influxDB.getWriteApi(env.INFLUX_ORG, env.INFLUX_BUCKET, 'ns')
export const queryApi: QueryApi = influxDB.getQueryApi(env.INFLUX_ORG)

logger.info('InfluxDB Singleton Initialized')

// Handle process termination to flush writes
const flushAndClose = async () => {
  logger.info('Closing InfluxDB WriteApi...')
  try {
    await writeApi.close()
    logger.info('InfluxDB WriteApi closed.')
  } catch (err) {
    logger.error({ err }, 'Error closing InfluxDB WriteApi')
  }
}

process.on('SIGINT', flushAndClose)
process.on('SIGTERM', flushAndClose)
