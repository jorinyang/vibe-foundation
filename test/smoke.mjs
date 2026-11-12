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
function writeActual(dir, routes, source = 'runtime') {
  write(join(dir, '.vibe', 'routes.actual.json'), j({ source, routes }))
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

  const heur = base(project('auth-heuristic'))
  fileConfig(heur)
  writeRoutes(heur, [HEALTH_ROUTE, ORDER_ROUTE])
  writeActual(heur, strip([HEALTH_ROUTE, ORDER_ROUTE]), 'heuristic')
  add('AUTH-01 负向：实际来源与声明同源', 'SPEC-AUTH-01', heur, 1, '启发式')
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

/** 十一条判定都能过的项目 */
function goodProject(name, port, mode = 'env-strict') {
  const dir = base(project(name))
  write(join(dir, '.vibe', 'config.json'), j({
    routeSource: { type: 'file', path: '.vibe/routes.actual.json' },
    service: {
      startCommand: `node "${FIXTURE}" ${port} ${mode}`,
      baseUrl: `http://127.0.0.1:${port}`,
      startupTimeoutMs: 8000,
      env: { VIBE_REQUIRED_TOKEN: 'smoke-token' },
    },
    endpoints: { health: '/health', ready: '/ready' },
    ...AUTHZ,
    mcpProbe: {
      path: '/mcp',
      toolName: 'update_order',
      serviceToken: 'Bearer svc-token',
      userToken: 'Bearer token-a',
      tokenHeader: 'authorization',
      denyStatus: [401, 403],
    },
    envProbe: { required: ['VIBE_REQUIRED_TOKEN'], timeoutMs: 3000 },
    security: { scannerCommand: 'node scan-ok.mjs' },
    runtimeDeps: { stack: 'ts', sourceDirs: ['src'] },
    structure: { stack: 'ts', sourceDirs: ['src'], layers: {} },
  }))
  writeRoutes(dir, FULL_ROUTES)
  writeActual(dir, strip(FULL_ROUTES))
  write(join(dir, '.vibe', 'mcp-tools.json'), j(FULL_MCP_TOOLS))
  write(join(dir, '.vibe', 'runtime-deps.json'), j({ version: 1, stack: 'ts', runtime: [] }))
  write(join(dir, 'package.json'), j({ name: 'smoke-good', dependencies: {} }))
  write(join(dir, 'scan-ok.mjs'), 'process.exit(0)\n')
  write(join(dir, 'src/a.ts'), 'export const a = 1\n')
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
  add('MCP-01 正向：声明合法且资源域已声明', 'SPEC-MCP-01', pass, 0, '资源域均已声明')
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

// ── SPEC-ENV-01 / SEC-01 / OPS-02 / STRUCT-01 / GATE-00 ────
{
  const pass = base(project('env-pass'))
  write(join(pass, '.vibe', 'config.json'), j({
    service: { startCommand: `node "${FIXTURE}" 4170 env-strict`, baseUrl: 'http://127.0.0.1:4170', startupTimeoutMs: 8000 },
    envProbe: { required: ['VIBE_REQUIRED_TOKEN'], timeoutMs: 4000 },
  }))
  add('ENV-01 正向：缺变量启动失败', 'SPEC-ENV-01', pass, 0, '非零码')

  const lax = base(project('env-lax'))
  write(join(lax, '.vibe', 'config.json'), j({
    service: { startCommand: `node "${FIXTURE}" 4171 good`, baseUrl: 'http://127.0.0.1:4171', startupTimeoutMs: 8000 },
    envProbe: { required: ['VIBE_REQUIRED_TOKEN'], timeoutMs: 2500 },
  }))
  add('ENV-01 负向：缺变量仍在运行', 'SPEC-ENV-01', lax, 1, '仍在运行')
}

{
  const okDir = base(project('sec-pass'))
  write(join(okDir, 'scan.mjs'), 'process.exit(0)\n')
  write(join(okDir, '.vibe', 'config.json'), j({ security: { scannerCommand: 'node scan.mjs' } }))
  add('SEC-01 正向：扫描器返回 0', 'SPEC-SEC-01', okDir, 0, '扫描器返回 0')

  const badDir = base(project('sec-fail'))
  write(join(badDir, 'scan-bad.mjs'), 'console.log("found secret at src/x.ts:12")\nprocess.exit(1)\n')
  write(join(badDir, '.vibe', 'config.json'), j({ security: { scannerCommand: 'node scan-bad.mjs' } }))
  add('SEC-01 负向：扫描器返回 1', 'SPEC-SEC-01', badDir, 1, 'found secret')
}

{
  const pass = base(project('ops02-pass'))
  write(join(pass, 'package.json'), j({ name: 'smoke', dependencies: { zod: '^3' } }))
  write(join(pass, 'src/a.ts'), "import { z } from 'zod'\nimport { b } from './b'\nexport const x = b\n")
  write(join(pass, 'src/b.ts'), 'export const b = 1\n')
  write(join(pass, '.vibe', 'runtime-deps.json'), j({ version: 1, stack: 'ts', runtime: ['zod'] }))
  write(join(pass, '.vibe', 'config.json'), j({ runtimeDeps: { stack: 'ts', sourceDirs: ['src'] } }))
  add('OPS-02 正向：依赖已声明', 'SPEC-OPS-02', pass, 0, '覆盖全部 import')

  const bad = base(project('ops02-bad'))
  write(join(bad, 'package.json'), j({ name: 'smoke-bad', dependencies: { zod: '^3' } }))
  write(join(bad, 'src/a.ts'), "import express from 'express'\nexport const a = express\n")
  write(join(bad, '.vibe', 'runtime-deps.json'), j({ version: 1, stack: 'ts', runtime: ['zod'] }))
  write(join(bad, '.vibe', 'config.json'), j({ runtimeDeps: { stack: 'ts', sourceDirs: ['src'] } }))
  add('OPS-02 负向：未声明依赖', 'SPEC-OPS-02', bad, 1, '未声明')

  const empty = base(project('ops02-empty'))
  write(join(empty, 'package.json'), j({ name: 'smoke-empty', dependencies: {} }))
  write(join(empty, '.vibe', 'runtime-deps.json'), j({ version: 1, stack: 'ts', runtime: [] }))
  write(join(empty, '.vibe', 'config.json'), j({ runtimeDeps: { stack: 'ts', sourceDirs: ['missing'] } }))
  add('OPS-02 负向：扫不到源码', 'SPEC-OPS-02', empty, 1, '扫描源码')
}

{
  const pass = base(project('ops03-pass'))
  write(join(pass, 'package.json'), j({ name: 'x', version: '0.0.0', dependencies: {} }))
  write(join(pass, '.vibe', 'config.json'), j({ runtimeDeps: { stack: 'ts', sourceDirs: ['src'] } }))
  add('OPS-03 正向：有 package.json', 'SPEC-OPS-03', pass, 0, '找到 package.json')

  const fail = base(project('ops03-fail'))
  write(join(fail, '.vibe', 'config.json'), j({ runtimeDeps: { stack: 'ts', sourceDirs: ['src'] } }))
  add('OPS-03 负向：没有任何 manifest', 'SPEC-OPS-03', fail, 1, '未找到')

  const py = base(project('ops03-py'))
  write(join(py, 'pyproject.toml'), '[project]\nname = "x"\n')
  write(join(py, '.vibe', 'config.json'), j({ runtimeDeps: { stack: 'python', sourceDirs: ['src'] } }))
  add('OPS-03 Python 正向：有 pyproject.toml', 'SPEC-OPS-03', py, 0, 'pyproject.toml')
}

{
  const structCfg = { structure: { stack: 'ts', sourceDirs: ['src'], layers: { 'src/api': ['src/service'], 'src/service': [] } } }

  const pass = base(project('struct-pass'))
  write(join(pass, 'src/api/a.ts'), "import { b } from '../service/b'\nexport const a = b\n")
  write(join(pass, 'src/service/b.ts'), 'export const b = 1\n')
  write(join(pass, '.vibe', 'config.json'), j(structCfg))
  add('STRUCT-01 正向：无循环且方向合规', 'SPEC-STRUCT-01', pass, 0, '方向合规')

  const cyc = base(project('struct-cycle'))
  write(join(cyc, 'src/a.ts'), "import { b } from './b'\nexport const a = b\n")
  write(join(cyc, 'src/b.ts'), "import { a } from './a'\nexport const b = a\n")
  write(join(cyc, '.vibe', 'config.json'), j({ structure: { stack: 'ts', sourceDirs: ['src'] } }))
  add('STRUCT-01 负向：循环依赖', 'SPEC-STRUCT-01', cyc, 1, '循环')

  const rev = base(project('struct-reverse'))
  write(join(rev, 'src/api/a.ts'), "import { b } from '../service/b'\nexport const a = b\n")
  write(join(rev, 'src/service/b.ts'), "import { c } from '../api/c'\nexport const b = c\n")
  write(join(rev, 'src/api/c.ts'), 'export const c = 1\n')
  write(join(rev, '.vibe', 'config.json'), j(structCfg))
  add('STRUCT-01 负向：反向依赖', 'SPEC-STRUCT-01', rev, 1, '不许依赖')
}

// ── Python 栈（两条语言相关判定）───────────────────────────
{
  const pass = base(project('py-ops02-pass'))
  write(join(pass, 'pyproject.toml'), '[project]\nname = "smoke-py"\ndependencies = ["requests"]\n')
  write(join(pass, 'src/a.py'), 'import os\nimport requests\nfrom .b import b\nprint(b)\n')
  write(join(pass, 'src/b.py'), 'b = 1\n')
  write(join(pass, '.vibe/runtime-deps.json'), j({ version: 1, stack: 'python', runtime: ['requests'] }))
  write(join(pass, '.vibe/config.json'), j({ runtimeDeps: { stack: 'python', sourceDirs: ['src'] } }))
  add('OPS-02 Python 正向：依赖已声明', 'SPEC-OPS-02', pass, 0, '覆盖全部 import')

  const bad = base(project('py-ops02-bad'))
  write(join(bad, 'pyproject.toml'), '[project]\nname = "smoke-py-bad"\n')
  write(join(bad, 'src/a.py'), 'import flask\n')
  write(join(bad, '.vibe/runtime-deps.json'), j({ version: 1, stack: 'python', runtime: ['requests'] }))
  write(join(bad, '.vibe/config.json'), j({ runtimeDeps: { stack: 'python', sourceDirs: ['src'] } }))
  add('OPS-02 Python 负向：第三方未声明', 'SPEC-OPS-02', bad, 1, 'flask')

  const abs = base(project('py-ops02-abs'))
  write(join(abs, 'pyproject.toml'), '[project]\nname = "smoke-py-abs"\n')
  write(join(abs, 'src/service/__init__.py'), '')
  write(join(abs, 'src/service/b.py'), 'b = 1\n')
  write(join(abs, 'src/a.py'), 'import service.b\n')
  write(join(abs, '.vibe/runtime-deps.json'), j({ version: 1, stack: 'python', runtime: [] }))
  write(join(abs, '.vibe/config.json'), j({ runtimeDeps: { stack: 'python', sourceDirs: ['src'] } }))
  add('OPS-02 Python 正向：本地包不算三方依赖', 'SPEC-OPS-02', abs, 0, '覆盖全部 import')
}

{
  const pyStructCfg = { structure: { stack: 'python', sourceDirs: ['src'], layers: { 'src/api': ['src/service'], 'src/service': [] } } }

  const pass = base(project('py-struct-pass'))
  write(join(pass, 'src/api/__init__.py'), '')
  write(join(pass, 'src/api/a.py'), 'from ..service.b import b\n')
  write(join(pass, 'src/service/__init__.py'), '')
  write(join(pass, 'src/service/b.py'), 'b = 1\n')
  write(join(pass, '.vibe/config.json'), j(pyStructCfg))
  add('STRUCT-01 Python 正向：方向合规', 'SPEC-STRUCT-01', pass, 0, '方向合规')

  const cyc = base(project('py-struct-cycle'))
  write(join(cyc, 'src/a.py'), 'from .b import b\n')
  write(join(cyc, 'src/b.py'), 'from .a import a\n')
  write(join(cyc, '.vibe/config.json'), j({ structure: { stack: 'python', sourceDirs: ['src'] } }))
  add('STRUCT-01 Python 负向：循环依赖', 'SPEC-STRUCT-01', cyc, 1, '循环')

  const rev = base(project('py-struct-reverse'))
  write(join(rev, 'src/api/__init__.py'), '')
  write(join(rev, 'src/api/a.py'), 'from ..service.b import b\n')
  write(join(rev, 'src/api/c.py'), 'c = 1\n')
  write(join(rev, 'src/service/__init__.py'), '')
  write(join(rev, 'src/service/b.py'), 'from ..api.c import c\n')
  write(join(rev, '.vibe/config.json'), j(pyStructCfg))
  add('STRUCT-01 Python 负向：反向依赖', 'SPEC-STRUCT-01', rev, 1, '不许依赖')
}

{
  add('GATE-00 正向：注入违规后变红', 'SPEC-GATE-00', goodProject('gate-ok', 4175), 0, '门禁有效')

  const noPublic = base(project('gate-nopublic'))
  write(join(noPublic, '.vibe', 'config.json'), j({ routeSource: { type: 'file', path: '.vibe/routes.actual.json' } }))
  writeRoutes(noPublic, [ORDER_ROUTE])
  writeActual(noPublic, strip([ORDER_ROUTE]))
  add('GATE-00 负向：无 public 路由可注入', 'SPEC-GATE-00', noPublic, 1, '没有 public 路由')
}

// ── 汇总命令 / 豁免 / 公开面 ───────────────────────────────
{
  const good = goodProject('agg-good', 4140)
  add('aggregate：全部通过', ['all'], good, 0, 'FAIL 0')

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
