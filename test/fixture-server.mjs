#!/usr/bin/env node
/**
 * 夹具服务 —— 给 test/smoke.mjs 和人工调试用
 *
 * 用法：node test/fixture-server.mjs <port> <mode>
 *   mode: good | no-checks | ready-500 | same-as-health | allow-all | leak
 */
import { createServer } from 'node:http'

const port = Number(process.argv[2] || 3999)
const mode = process.argv[3] || 'good'

const ROUTES = [
  { method: 'GET', path: '/health' },
  { method: 'GET', path: '/ready' },
  { method: 'GET', path: '/api/orders/:id' },
]

const USERS = {
  'Bearer token-a': { owner: 'a' },
  'Bearer token-b': { owner: 'b' },
}

const ORDERS = {
  'ord-aaa': { id: 'ord-aaa', owner: 'a', item: 'A 的订单' },
  'ord-bbb': { id: 'ord-bbb', owner: 'b', item: 'B 的订单' },
}

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

  if (url.pathname.startsWith('/api/orders/')) {
    const id = decodeURIComponent(url.pathname.slice('/api/orders/'.length))
    const user = USERS[req.headers.authorization || '']
    const order = ORDERS[id]

    if (mode === 'allow-all') return send(200, order || { id })
    if (!user) return send(401, { error: 'unauthorized' })
    if (!order) return send(404, { error: 'not found' })
    if (order.owner !== user.owner) {
      if (mode === 'leak') return send(403, { error: 'forbidden', leaked: order })
      return send(403, { error: 'forbidden' })
    }
    return send(200, order)
  }

  send(404, { error: 'not found' })
})

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`fixture-server ready on ${port} (${mode})\n`)
})
