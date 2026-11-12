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

// env-strict 模式：缺少必需变量时立即失败（用于 SPEC-ENV-01 的正向用例）
if (mode === 'env-strict' && !process.env.VIBE_REQUIRED_TOKEN) {
  process.stderr.write('missing VIBE_REQUIRED_TOKEN\n')
  process.exit(1)
}

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

const MCP_TOOLS = {
  update_order: { auth_mode: 'user' },
  get_public_menu: { auth_mode: 'service' },
}

const TOKENS = {
  'Bearer svc-token': 'service',
  'Bearer token-a': 'user',
  'Bearer token-b': 'user',
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

  if (url.pathname === '/mcp' && req.method === 'POST') {
    let raw = ''
    req.on('data', (c) => { raw += c })
    req.on('end', () => {
      const identity = TOKENS[req.headers.authorization || '']
      if (!identity) {
        return send(401, { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'unauthorized' } })
      }
      let body = {}
      try { body = JSON.parse(raw) } catch { body = {} }
      const id = body.id ?? 1
      const name = body && body.params && body.params.name
      const tool = MCP_TOOLS[name]
      if (!tool) return send(200, { jsonrpc: '2.0', id, error: { code: -32602, message: 'unknown tool' } })
      if (tool.auth_mode === 'user' && identity === 'service') {
        if (mode === 'mcp-allow-service') return send(200, { jsonrpc: '2.0', id, result: { ok: true } })
        return send(403, { jsonrpc: '2.0', id, error: { code: -32003, message: 'forbidden' } })
      }
      return send(200, { jsonrpc: '2.0', id, result: { ok: true } })
    })
    return
  }

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
