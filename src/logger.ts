import type { Server } from 'http'
import { readFile } from 'node:fs/promises'
import requestStats from 'request-stats'
import { Logform, Logger, createLogger, format, transports } from 'winston'

import { SUPPORTED_LEVELS, logLevel } from './config'
import { getLogPath } from './path'

const supportedLevels: Record<string, number> = SUPPORTED_LEVELS.reduce(
  (acc, cur, idx) => ({ ...acc, [cur]: idx }),
  {} as Record<string, number>,
)

export const logger: Logger = createLogger({
  // To see more detailed errors, change this to 'debug'
  levels: supportedLevels,
  format: format.combine(
    format.errors({ stack: true }),
    format.metadata(),
    format.timestamp(),
    format.printf(formatLogMessage),
  ),
  transports: [
    new transports.Console({ level: logLevel, format: format.colorize({ all: true }) }),
    new transports.File({
      filename: getLogPath('bee-desktop.log'),
      maxsize: 1_000_000,
      maxFiles: 10,
      tailable: true,
    }),
  ],
})

logger.info(`using max log level=${logLevel}`)

function processMetadata(metadata: Record<string, unknown>): string {
  // Create array of "<key>=<value>" strings from an object
  const serializedMetadata = Object.entries(metadata).map(([key, value]) => `${key}=${JSON.stringify(value)}`)

  return serializedMetadata.join(' ')
}

export function formatLogMessage(info: Logform.TransformableInfo): string {
  let message = `time="${info.timestamp}" level="${info.level}" msg="${info.message}"`

  if (Object.keys(info.metadata).length > 0) message = `${message} ${processMetadata(info.metadata)}`

  return message.replace(/\n/g, '\\n')
}

export function subscribeLogServerRequests(server: Server): void {
  const stats = requestStats(server)
  stats.on('complete', details => {
    const {
      time,
      req: { bytes, method, ip, path, raw },
      res: { status },
    } = details
    logger.info('api access', {
      duration: (time / 1000).toFixed(9), // convert from ms to seconds
      ip,
      method,
      size: bytes,
      status,
      uri: path,
      'user-agent': raw.headers['user-agent'],
    })
  })
}

export async function readBeeDesktopLogs(): Promise<string> {
  return readFile(getLogPath('bee-desktop.log'), { encoding: 'utf8' })
}

export async function readBeeLogs(): Promise<string> {
  return readFile(getLogPath('bee.current.log'), { encoding: 'utf8' })
}
