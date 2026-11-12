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

function run(id, dir) {
  const r = spawnSync(process.execPath, [BIN, id, '--project', dir], { encoding: 'utf8' })
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
