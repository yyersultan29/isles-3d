/// <reference types="node" />
// `npm run server`: the local game server (ROADMAP G5.2). PORT and HOST override the defaults.
import { startServer } from './server'

const server = await startServer({
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '127.0.0.1',
  log: (line) => console.log(`[${new Date().toISOString()}] ${line}`),
})

const stop = () => { void server.close().then(() => process.exit(0)) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
