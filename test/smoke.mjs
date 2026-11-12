#!/usr/bin/env node
/**
 * smoke — 端到端跑全部判定的正向与负向用例
 *
 * 用法：node test/smoke.mjs
 * 退出码：0 全过 / 1 有失败
 */
import { spawnSync, spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BIN = join(ROOT, 'bin', 'vibe-check.mjs')
const FIXTURE = join(ROOT, 'test', 'fixture-server.mjs')
const SPEC_VERSION = JSON.parse(readFileSync(join(ROOT, 'spec', 'spec.json'), 'utf8')).version
const TMP = mkdtempSync(join(tmpdir(), 'vibe-smoke-'))

const write = (p, c) => {
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, c)
}
const j = (o) => JSON.stringify(o, null, 2)

function project(name) {
  const dir = join(TMP, name)
  mkdirSync(dir, { recursive: true })
  return dir
}

function base(dir, refVersion = SPEC_VERSION) {
  write(join(dir, '.vibe', 'ref.json'), j({ spec: refVersion }))
  write(join(dir, 'AGENTS.md'), Array.from({ length: 40 }, (_, i) => `- 规则 ${i + 1}`).join('\n'))
  return dir
}

const HEALTH_ROUTE = {
  method: 'GET', path: '/health', visibility: 'public',
  reason: '容器健康探针，只返回进程状态',
}
const ORDER_ROUTE = {
  method: 'GET', path: '/api/orders/:id', visibility: 'protected',
  resource: 'order', action: 'read', subjects: ['owner', 'admin'],
}

function writeRoutes(dir, routes) {
  write(join(dir, '.vibe', 'routes.json'), j({ version: 1, routes }))
}
function writeActual(dir, routes) {
  write(join(dir, '.vibe', 'routes.actual.json'), j({ routes }))
}
const strip = (routes) => routes.map((r) => ({ method: r.method, path: r.path }))

function fileConfig(dir) {
  write(join(dir, '.vibe', 'config.json'), j({ routeSource: { type: 'file', path: '.vibe/routes.actual.json' } }))
}

function serviceConfig(dir, port, mode, timeout = 8000, extra = {}) {
  write(join(dir, '.vibe', 'config.json'), j({
    routeSource: { type: 'file', path: '.vibe/routes.actual.json' },
    service: {
      startCommand: `node "${FIXTURE}" ${port} ${mode}`,
      baseUrl: `http://127.0.0.1:${port}`,
      startupTimeoutMs: timeout,
    },
    ...extra,
  }))
}

function run(args, dir) {
  const argv = Array.isArray(args) ? args : [args]
  const r = spawnSync(process.execPath, [BIN, ...argv, '--project', dir], { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }
}

async function waitFor(url, ms = 8000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(500) })
      return true
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150))
  }
  return false
}

function killTree(child) {
  return new Promise((done) => {
    if (!child || !child.pid) return done()
    if (process.platform === 'win32') {
      const k = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      k.on('exit', () => setTimeout(done, 250))
      k.on('error', () => setTimeout(done, 250))
    } else {
      try { child.kill('SIGTERM') } catch { /* ignore */ }
      setTimeout(done, 300)
    }
  })
}

const cases = []

function add(name, id, dir, expect, contains) {
  cases.push({ name, id, dir, expect, contains })
}

// ── SPEC-STR-01 ────────────────────────────────────────────
{
  const d = base(project('str-pass'))
  add('STR-01 正向', 'SPEC-STR-01', d, 0, '项目')

  const bad = base(project('str-badver'), '0.0.9')
  add('STR-01 负向：版本不一致', 'SPEC-STR-01', bad, 1, '项目声明 0.0.9')

  const long = project('str-long')
  write(join(long, '.vibe', 'ref.json'), j({ spec: SPEC_VERSION }))
  write(join(long, 'AGENTS.md'), Array.from({ length: 200 }, (_, i) => `- 规则 ${i + 1}`).join('\n'))
  add('STR-01 负向：宪法超长', 'SPEC-STR-01', long, 1, '超过 150')
}

// ── SPEC-AUTH-01（file 模式）───────────────────────────────
{
  const pass = base(project('auth-pass'))
  fileConfig(pass)
  writeRoutes(pass, [HEALTH_ROUTE, ORDER_ROUTE])
  writeActual(pass, strip([HEALTH_ROUTE, ORDER_ROUTE]))
  add('AUTH-01 正向（file）', 'SPEC-AUTH-01', pass, 0, '全部已声明')

  const badReason = base(project('auth-badreason'))
  fileConfig(badReason)
  writeRoutes(badReason, [{ ...HEALTH_ROUTE, reason: 'ok' }, ORDER_ROUTE])
  writeActual(badReason, strip([HEALTH_ROUTE, ORDER_ROUTE]))
  add('AUTH-01 负向：public 理由过短', 'SPEC-AUTH-01', badReason, 1, 'reason 过短')

  const undeclared = base(project('auth-undeclared'))
  fileConfig(undeclared)
  writeRoutes(undeclared, [HEALTH_ROUTE, ORDER_ROUTE])
  writeActual(undeclared, strip([HEALTH_ROUTE, ORDER_ROUTE, { method: 'POST', path: '/api/admin/refund' }]))
  add('AUTH-01 负向：实际有未声明路由', 'SPEC-AUTH-01', undeclared, 1, '未声明')

  const ghost = base(project('auth-ghost'))
  fileConfig(ghost)
  writeRoutes(ghost, [HEALTH_ROUTE, ORDER_ROUTE, { ...ORDER_ROUTE, path: '/__ghost' }])
  writeActual(ghost, strip([HEALTH_ROUTE, ORDER_ROUTE]))
  add('AUTH-01 负向：幽灵声明', 'SPEC-AUTH-01', ghost, 1, '实际不存在')
}

// ── SPEC-AUTH-02 ──────────────────────────────────────────
const AUTHZ = {
  authzProbe: {
    method: 'GET',
    pathTemplate: '/api/orders/{id}',
    tokenHeader: 'authorization',
    userA: { token: 'Bearer token-a', resourceId: 'ord-aaa' },
    userB: { token: 'Bearer token-b', resourceId: 'ord-bbb' },
    denyStatus: [403, 404],
  },
}

const READY_ROUTE = { method: 'GET', path: '/ready', visibility: 'public', reason: '就绪探针，只反映依赖状态' }
const MENU_ROUTE = { method: 'GET', path: '/api/menu', visibility: 'public', reason: '公开菜单数据，不含用户信息', resource: 'menu', action: 'read' }
const ORDER_WRITE_ROUTE = { method: 'POST', path: '/api/orders/:id', visibility: 'protected', resource: 'order', action: 'write', subjects: ['owner'] }
const FULL_ROUTES = [HEALTH_ROUTE, READY_ROUTE, ORDER_ROUTE, MENU_ROUTE, ORDER_WRITE_ROUTE]

const FULL_MCP_TOOLS = {
  version: 1,
  tools: [
    { name: 'get_public_menu', auth_mode: 'service', resource: 'menu', action: 'read', service_scope: ['menu:read'] },
    { name: 'update_order', auth_mode: 'user', resource: 'order', action: 'write', subjects: ['owner'] },
  ],
}

/** 六条判定都能过的项目 */
function goodProject(name, port, mode = 'good') {
  const dir = base(project(name))
  serviceConfig(dir, port, mode, 8000, {
    ...AUTHZ,
    mcpProbe: {
      path: '/mcp',
      toolName: 'update_order',
      serviceToken: 'Bearer svc-token',
      userToken: 'Bearer token-a',
      tokenHeader: 'authorization',
      denyStatus: [401, 403],
    },
  })
  writeRoutes(dir, FULL_ROUTES)
  writeActual(dir, strip(FULL_ROUTES))
  write(join(dir, '.vibe', 'mcp-tools.json'), j(FULL_MCP_TOOLS))
  return dir
}

{
  const pass = base(project('authz-pass'))
  serviceConfig(pass, 4130, 'good', 8000, AUTHZ)
  add('AUTH-02 正向：越权被拒且不泄露', 'SPEC-AUTH-02', pass, 0, '越权响应不含他人资源标识')

  const leak = base(project('authz-leak'))
  serviceConfig(leak, 4131, 'leak', 8000, AUTHZ)
  add('AUTH-02 负向：403 但泄露数据', 'SPEC-AUTH-02', leak, 1, '拒绝但泄露数据')

  const allowAll = base(project('authz-allowall'))
  serviceConfig(allowAll, 4132, 'allow-all', 8000, AUTHZ)
  add('AUTH-02 负向：没有归属校验', 'SPEC-AUTH-02', allowAll, 1, 'A 读 B 的资源')
}

// ── SPEC-OPS-01 ───────────────────────────────────────────
{
  const good = base(project('ops-good'))
  serviceConfig(good, 4120, 'good')
  add('OPS-01 正向', 'SPEC-OPS-01', good, 0, 'checks')

  const noChecks = base(project('ops-nochecks'))
  serviceConfig(noChecks, 4121, 'no-checks')
  add('OPS-01 负向：ready 缺 checks', 'SPEC-OPS-01', noChecks, 1, '缺少 checks')

  const ready500 = base(project('ops-ready500'))
  serviceConfig(ready500, 4122, 'ready-500')
  add('OPS-01 负向：ready 返回 503', 'SPEC-OPS-01', ready500, 1, '状态码 503')

  const exits = base(project('ops-exits'))
  write(join(exits, '.vibe', 'config.json'), j({
    service: { startCommand: 'node -e "process.exit(1)"', baseUrl: 'http://127.0.0.1:4123', startupTimeoutMs: 3000 },
  }))
  add('OPS-01 负向：服务提前退出', 'SPEC-OPS-01', exits, 1, '提前退出')

  const noListen = base(project('ops-nolisten'))
  write(join(noListen, '.vibe', 'config.json'), j({
    service: { startCommand: 'node -e "setTimeout(()=>{},60000)"', baseUrl: 'http://127.0.0.1:4124', startupTimeoutMs: 2000 },
  }))
  add('OPS-01 负向：端口未监听', 'SPEC-OPS-01', noListen, 1, '未在')
}

// ── SPEC-MCP-01 / 02 ─────────────────────────────────────
const MCP_ROUTES = [
  { method: 'GET', path: '/api/menu', visibility: 'public', reason: '公开菜单数据，不含用户信息', resource: 'menu', action: 'read' },
  { method: 'POST', path: '/api/orders/:id', visibility: 'protected', resource: 'order', action: 'write', subjects: ['owner'] },
]
const MCP_TOOLS = {
  version: 1,
  tools: [
    { name: 'get_public_menu', auth_mode: 'service', resource: 'menu', action: 'read', service_scope: ['menu:read'] },
    { name: 'update_order', auth_mode: 'user', resource: 'order', action: 'write', subjects: ['owner'] },
  ],
}

function mcpProject(name, port, mode = 'good') {
  const dir = base(project(name))
  writeRoutes(dir, MCP_ROUTES)
  write(join(dir, '.vibe', 'mcp-tools.json'), j(MCP_TOOLS))
  serviceConfig(dir, port, mode, 8000, {
    mcpProbe: {
      path: '/mcp',
      toolName: 'update_order',
      serviceToken: 'Bearer svc-token',
      userToken: 'Bearer token-a',
      tokenHeader: 'authorization',
      denyStatus: [401, 403],
    },
  })
  return dir
}

{
  const pass = mcpProject('mcp-pass', 4160)
  add('MCP-01 正向：声明合法且能力已声明', 'SPEC-MCP-01', pass, 0, '能力均已声明')
  add('MCP-02 正向：服务身份被拒', 'SPEC-MCP-02', pass, 0, '用户身份调用')

  const star = mcpProject('mcp-star', 4160)
  write(join(star, '.vibe', 'mcp-tools.json'), j({
    version: 1,
    tools: [{ name: 'x', auth_mode: 'service', resource: 'menu', action: 'read', service_scope: ['*'] }],
  }))
  add('MCP-01 负向：service_scope 通配', 'SPEC-MCP-01', star, 1, '通配')

  const cap = mcpProject('mcp-cap', 4160)
  write(join(cap, '.vibe', 'mcp-tools.json'), j({
    version: 1,
    tools: [{ name: 'refund', auth_mode: 'user', resource: 'refund', action: 'write', subjects: ['admin'] }],
  }))
  add('MCP-01 负向：能力未在路由声明', 'SPEC-MCP-01', cap, 1, '未在路由清单声明')

  const bad = mcpProject('mcp-allow-service', 4161, 'mcp-allow-service')
  add('MCP-02 负向：服务身份可调用户工具', 'SPEC-MCP-02', bad, 1, '未被拒绝')
}

// ── 汇总命令 / 豁免 / 公开面 ───────────────────────────────
{
  const good = goodProject('agg-good', 4140)
  add('aggregate：四条全过', ['all'], good, 0, 'FAIL 0')

  const bad = goodProject('agg-fail', 4141)
  writeActual(bad, strip([...FULL_ROUTES, { method: 'POST', path: '/api/admin' }]))
  add('aggregate：有失败则退出 1', ['all'], bad, 1, 'FAIL 1')

  add('report-public：公开比例告警', ['report-public'], good, 0, '公开面清单')
}

{
  const ov = goodProject('agg-override', 4142)
  writeActual(ov, strip([...FULL_ROUTES, { method: 'POST', path: '/api/admin' }]))
  write(join(ov, '.vibe', 'override', 'SPEC-AUTH-01.md'),
    '# 豁免 SPEC-AUTH-01\n\n- 负责人：测试\n- 到期日：2099-01-01\n- 理由：临时放行\n')
  add('override：有效豁免 → SKIP', ['all'], ov, 0, 'SKIP 1')

  const expired = goodProject('agg-override-expired', 4143)
  writeActual(expired, strip([...FULL_ROUTES, { method: 'POST', path: '/api/admin' }]))
  write(join(expired, '.vibe', 'override', 'SPEC-AUTH-01.md'),
    '# 豁免 SPEC-AUTH-01\n\n- 负责人：测试\n- 到期日：2020-01-01\n')
  add('override：过期豁免 → 仍失败', ['all'], expired, 1, '过期')
}

// ── init ──────────────────────────────────────────────────
{
  const empty = project('init-empty')
  add('init：生成 .vibe 模板', ['init'], empty, 0, '已创建')
}

// ── 主流程 ─────────────────────────────────────────────────
async function main() {
  // AUTH-01 的 endpoint 模式需要夹具服务在跑；用例跑完再杀
  const server = spawn(process.execPath, [FIXTURE, '4110', 'good'], { stdio: 'ignore', windowsHide: true })
  let failed = 0
  let all = []

  try {
    const up = await waitFor('http://127.0.0.1:4110/health')
    if (!up) throw new Error('endpoint 夹具服务未起来')

    const ep = base(project('auth-endpoint'))
    writeRoutes(ep, [
      { ...HEALTH_ROUTE },
      { method: 'GET', path: '/ready', visibility: 'public', reason: '就绪探针，只反映依赖状态' },
      ORDER_ROUTE,
    ])
    write(join(ep, '.vibe', 'config.json'), j({
      routeSource: { type: 'endpoint', url: 'http://127.0.0.1:4110/__vibe/routes' },
    }))

    all = [...cases, { name: 'AUTH-01 正向（endpoint）', id: 'SPEC-AUTH-01', dir: ep, expect: 0, contains: '全部已声明' }]

    for (const c of all) {
      const r = run(c.id, c.dir)
      const codeOk = r.code === c.expect
      const textOk = !c.contains || r.out.includes(c.contains)
      const ok = codeOk && textOk
      if (!ok) failed++
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(30)} 期望 ${c.expect} 实际 ${r.code}`)
      if (!ok) {
        console.log('      ---- 输出 ----')
        console.log(r.out.split('\n').filter(Boolean).map((l) => `      ${l}`).join('\n'))
      }
    }
  } finally {
    await killTree(server)
  }

  rmSync(TMP, { recursive: true, force: true })
  console.log(`\n合计 ${all.length} 例，失败 ${failed} 例`)
  return failed === 0 ? 0 : 1
}

process.exit(await main())
