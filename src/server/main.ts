/// <reference types="node" />
// `npm run server`: the local game server (ROADMAP G5.2). PORT and HOST override the defaults;
// ORIGINS (comma-separated) limits which pages may connect (G5.6); TRUST_PROXY=1 behind a hosting
// proxy such as Render (G5.7). Log lines are JSON, one per line, with a timestamp.
import { startServer, type LogEntry } from './server'

const log = (e: LogEntry) => console.log(JSON.stringify({ t: new Date().toISOString(), ...e }))

const server = await startServer({
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '127.0.0.1',
  origins: process.env.ORIGINS ? process.env.ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
  trustProxy: process.env.TRUST_PROXY === '1',
  log,
})

const stop = () => { log({ ev: 'stopping' }); void server.close().then(() => process.exit(0)) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
// failures inside a message or a room are contained by the server; anything else is a bug that may
// have left state half-changed, so it is logged and the process exits for a supervisor to restart
process.on('uncaughtException', (e) => { log({ ev: 'fatal', message: e.message, stack: e.stack }); process.exit(1) })
process.on('unhandledRejection', (e) => { log({ ev: 'fatal', message: String(e) }); process.exit(1) })
