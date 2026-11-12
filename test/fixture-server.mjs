#!/usr/bin/env node
/**
 * 夹具服务 —— 给 test/smoke.mjs 和人工调试用
 *
 * 用法：node test/fixture-server.mjs <port> <mode>
 *   mode: good | no-checks | ready-500 | same-as-health
 */
import { createServer } from 'node:http'

const port = Number(process.argv[2] || 3999)
const mode = process.argv[3] || 'good'

const ROUTES = [
  { method: 'GET', path: '/health' },
  { method: 'GET', path: '/ready' },
  { method: 'GET', path: '/api/orders/:id' },
]

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`)
  const send = (code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json' })
    res.end(JSON.stringify(obj))
  }

  if (url.pathname === '/health') return send(200, { status: 'ok', uptime: 1 })

  if (url.pathname === '/ready') {
    if (mode === 'ready-500') return send(503, { status: 'degraded' })
    if (mode === 'no-checks') return send(200, { status: 'ready' })
    if (mode === 'same-as-health') return send(200, { status: 'ok', uptime: 1 })
    return send(200, { status: 'ready', checks: [{ name: 'db', ok: true }] })
  }

  if (url.pathname === '/__vibe/routes') return send(200, { routes: ROUTES })

  if (url.pathname === '/api/orders/:id') return send(200, { id: '1' })

  send(404, { error: 'not found' })
})

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`fixture-server ready on ${port} (${mode})\n`)
})
