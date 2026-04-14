import fs from 'fs'
import crypto from 'crypto'
import path from 'path'
import { validateEnv } from '../config/env.js'
import { createLogger } from '../utils/logger.js'

const env = validateEnv()
const logger = createLogger()

import { mqttPublish } from './mqtt.service.js'

/**
 * Deploy OTA using PRE-COMPUTED sha256 + signature (Web / remote use).
 * The user signs firmware offline with sign_firmware.py, then pastes the values.
 * This function simply passes them through to MQTT — no file access or private key needed.
 */
export async function deployOtaPassthrough(
  deviceId: string,
  url: string,
  version: string,
  sha256?: string,
  signature?: string,
) {
  if (!url || !version) throw new Error('url and version are required')

  const payload: Record<string, string> = { url, version }
  if (sha256) payload.sha256 = sha256
  if (signature) payload.signature = signature

  const topic = `${env.MQTT_BASE_TOPIC}/${deviceId}/cmd/ota`
  await mqttPublish(topic, JSON.stringify(payload))
  logger.info(
    { deviceId, version, sha256: sha256 || 'none', signed: !!signature },
    'OTA passthrough deployment published'
  )
  return payload
}
