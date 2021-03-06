require('winston-daily-rotate-file')
require('moment-duration-format')

const path = require('path')
const chalk = require('chalk')
const winston = require('winston')
const Sentry = require('winston-raven-sentry')
const moment = require('moment')
const util = require('util')
const { Client } = require('sylphy')

global.Promise = require('bluebird')
require('longjohn')
require('dotenv-safe').config({
  path: path.join(process.cwd(), '.env'),
  allowEmptyValues: true
})

const { Cache, Database, Station } = require('./plugins')
const { stripColor } = require('./utils')

const resolve = (str) => path.join('src', str)

const processCount = parseInt(process.env['CLIENT_PROCESSES'], 10)
const processID = parseInt(process.env['NODE_APP_INSTANCE'], 10) % processCount
const processShards = parseInt(process.env['CLIENT_SHARDS_PER_PROCESS'] || 1, 10)
const firstShardID = processID * processShards
const lastShardID = firstShardID + processShards - 1
const maxShards = processShards * processCount

const transports = [
  new (winston.transports.Console)({
    level: 'silly',
    colorize: true,
    label: processShards > 1 ? `C ${firstShardID}-${lastShardID}` : `C ${processID}`,
    timestamp: () => `[${chalk.grey(moment().format('HH:mm:ss'))}]`
  }),
  new (winston.transports.DailyRotateFile)({
    colorize: false,
    datePattern: '.yyyy-MM-dd',
    prepend: true,
    json: false,
    formatter: function ({ level, message = '', meta = {}, formatter, depth, colorize }) {
      const timestamp = moment().format('YYYY-MM-DD hh:mm:ss a')
      const obj = Object.keys(meta).length
      ? `\n\t${meta.stack ? meta.stack : util.inspect(meta, false, depth || null, colorize)}`
      : ''
      return `${timestamp} ${level.toUpperCase()} ${stripColor(message)} ${obj}`
    },
    filename: path.join(process.cwd(), `logs/shard-${processID}.log`),
  })
]

if (process.env['SENTRY_DSN']) {
  transports.push(new Sentry({
    dsn: process.env['SENTRY_DSN'],
    level: 'warn',
    install: true
  }))
}

const logger = new (winston.Logger)({ transports })

const bot = new Client({
  token: process.env['CLIENT_TOKEN'],
  prefix: process.env['CLIENT_PREFIX'],
  modules: resolve('modules'),
  locales: path.resolve('res', 'i18n'),
  admins: process.env['ADMIN_IDS'].split(', '),
  messageLimit: 0,
  getAllUsers: true,
  disableEveryone: true,
  maxShards,
  firstShardID,
  lastShardID
})

/* Noisy logging
bot.on('commander:registered', ({ trigger, group, aliases } = {}) =>
  bot.logger.debug(`Command '${trigger}' in group '${group}' registered with ${aliases} aliases`)
)
*/

bot
.unregister('logger', 'console')
.register('logger', 'winston', logger)
.unregister('middleware', true)
.register('middleware', resolve('middleware'))
.register('commands', resolve('commands'), { groupedCommands: true })
.createPlugin('cache', Cache)
.createPlugin('db', Database, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  db: process.env.DB_DBNAME,
  authKey: process.env.DB_AUTHKEY
})
.createPlugin('ipc', Station)
.register('db', path.join(__dirname, 'models'))
.register('ipc', resolve('ipc'))

bot.on('ready', () => {
  const guilds = bot.guilds.size
  const users = bot.users.size
  const channels = Object.keys(bot.channelGuildMap).length

  bot.logger.info(`${chalk.red.bold(bot.user.username)} - ${
    firstShardID === lastShardID
    ? `Shard ${firstShardID} is ready!`
    : `Shards ${firstShardID} to ${lastShardID} are ready!`
  }`)
  bot.logger.info(
    `G: ${chalk.green.bold(guilds)} | ` +
    `C: ${chalk.green.bold(channels)} | ` +
    `U: ${chalk.green.bold(users)}`
  )
  bot.logger.info(`Prefix: ${chalk.cyan.bold(bot.prefix)}`)
})

bot.on('error', bot.logger.error)

process.on('unhandledRejection', (r, p) =>
  r && bot.logger.error('Unhandled rejection:', p, 'reason:', r.message)
)

bot.run()
