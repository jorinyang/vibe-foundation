#!/usr/bin/env node
/**
 * vibe-check — 底座判定执行入口
 *
 * 用法：
 *   node bin/vibe-check.mjs <SPEC-ID> [--project <dir>] [--json]
 *
 * 退出码：0 通过 / 1 失败 / 2 配置错误 / 3 判定崩溃
 */
import { readFileSync, existsSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { join, dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EXIT = { PASS: 0, FAIL: 1, CONFIG: 2, CRASH: 3 }
const MIN_PUBLIC_REASON = 8
const DEFAULT_HEALTH = '/health'
const DEFAULT_READY = '/ready'

// ── 基础工具 ────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { checkId: null, project: process.cwd(), json: false, selfTest: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--project' || a === '-p') args.project = resolve(argv[++i])
    else if (a === '--json') args.json = true
    else if (a === '--self-test') args.selfTest = true
    else if (!a.startsWith('-') && !args.checkId) args.checkId = a
  }
  return args
}

/** 读 JSON：容忍 UTF-8 BOM（Windows 编辑器常见，属实测问题） */
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
}

function countLines(path) {
  const lines = readFileSync(path, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.length
}

function sub(name) {
  return { name, ok: false, detail: '' }
}

function readProjectConfig(project) {
  const p = join(project, '.vibe', 'config.json')
  if (!existsSync(p)) return { error: '缺少 .vibe/config.json' }
  try {
    return { config: readJson(p) }
  } catch (e) {
    return { error: `config.json 不是合法 JSON：${e.message}` }
  }
}

async function fetchJson(url, timeoutMs = 5000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  const text = await res.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    body = null
  }
  return { status: res.status, body, text }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 杀掉整个进程树（Windows 上 shell 启动的孙进程不会被 child.kill 清掉） */
function stopTree(child) {
  return new Promise((done) => {
    if (!child || child.exitCode !== null || !child.pid) return done()
    if (process.platform === 'win32') {
      const k = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      k.on('exit', () => setTimeout(done, 300))
      k.on('error', () => {
        try { child.kill('SIGKILL') } catch { /* ignore */ }
        setTimeout(done, 300)
      })
    } else {
      try { child.kill('SIGTERM') } catch { /* ignore */ }
      setTimeout(done, 500)
    }
  })
}

/** 起服务并等到端口可用；返回 { stop } 或 { error } */
async function startService(project, svc) {
  const cwd = isAbsolute(svc.cwd || '') ? svc.cwd : resolve(project, svc.cwd || '.')
  const timeout = Number(svc.startupTimeoutMs || 15000)
  const base = String(svc.baseUrl || '').replace(/\/$/, '')
  if (!base) return { error: 'service.baseUrl 未配置' }

  let child
  try {
    child = spawn(svc.startCommand, {
      cwd,
      shell: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, ...(svc.env || {}) },
    })
  } catch (e) {
    return { error: `启动失败：${e.message}` }
  }

  let exited = false
  let exitInfo = ''
  child.on('exit', (code, sig) => {
    exited = true
    exitInfo = `code=${code} signal=${sig}`
  })

  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (exited) return { error: `服务提前退出（${exitInfo}）：${svc.startCommand}` }
    try {
      await fetch(base + '/', { signal: AbortSignal.timeout(800) })
      return { stop: () => stopTree(child) }
    } catch {
      /* 还没起来 */
    }
    await sleep(200)
  }
  await stopTree(child)
  return { error: `服务在 ${timeout}ms 内未在 ${base} 就绪` }
}

// ── SPEC-STR-01：项目宪法单屏 + 底座引用版本对账 ─────────────────
function runStr01(project, specVersion) {
  const subs = []

  const versionCheck = sub('版本对账（.vibe/ref.json vs 底座）')
  const refPath = join(project, '.vibe', 'ref.json')
  if (!existsSync(refPath)) {
    versionCheck.detail = '缺少 .vibe/ref.json'
  } else {
    try {
      const ref = readJson(refPath)
      if (typeof ref.spec !== 'string' || ref.spec === '') {
        versionCheck.detail = 'ref.json 缺少 spec 字段'
      } else if (ref.spec !== specVersion) {
        versionCheck.detail = `项目声明 ${ref.spec}，底座实际 ${specVersion}`
      } else {
        versionCheck.ok = true
        versionCheck.detail = `项目 ${ref.spec} = 底座 ${specVersion}`
      }
    } catch (e) {
      versionCheck.detail = `ref.json 不是合法 JSON：${e.message}`
    }
  }
  subs.push(versionCheck)

  const constitutionCheck = sub('宪法单屏（≤ 150 行）')
  const candidates = [join(project, 'AGENTS.md'), join(project, '.vibe', 'constitution.md')]
  const found = candidates.find((p) => existsSync(p))
  if (!found) {
    constitutionCheck.detail = '缺少 AGENTS.md 或 .vibe/constitution.md'
  } else {
    const n = countLines(found)
    constitutionCheck.ok = n <= 150
    constitutionCheck.detail = `${found.endsWith('AGENTS.md') ? 'AGENTS.md' : '.vibe/constitution.md'} ${n} 行`
    if (!constitutionCheck.ok) constitutionCheck.detail += '（超过 150）'
  }
  subs.push(constitutionCheck)

  return { ok: subs.every((s) => s.ok), subs }
}

// ── SPEC-AUTH-01：路由声明合法 + 声明覆盖实际 ───────────────────
const routeKey = (r) => `${String(r.method || '').toUpperCase()} ${r.path}`

function validateRouteDeclarations(data) {
  const errs = []
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['routes.json 顶层不是对象']
  if (!Array.isArray(data.routes)) return ['routes 不是数组']
  if (data.routes.length === 0) errs.push('routes 为空')
  const seen = new Set()
  data.routes.forEach((r, i) => {
    const at = `第 ${i + 1} 条`
    if (!r || typeof r !== 'object') { errs.push(`${at} 不是对象`); return }
    const method = String(r.method || '').toUpperCase()
    const path = String(r.path || '')
    if (!method || !path) { errs.push(`${at} 缺少 method 或 path`); return }
    const k = routeKey(r)
    if (seen.has(k)) errs.push(`${at} 重复：${k}`)
    seen.add(k)
    if (r.visibility === 'public') {
      const reason = typeof r.reason === 'string' ? r.reason.trim() : ''
      if (!reason) errs.push(`${k} 为 public 但缺 reason`)
      else if (reason.length < MIN_PUBLIC_REASON) errs.push(`${k} 的 reason 过短（${reason.length} < ${MIN_PUBLIC_REASON}）`)
    } else if (r.visibility === 'protected') {
      if (!r.resource) errs.push(`${k} 为 protected 但缺 resource`)
      if (!r.action) errs.push(`${k} 为 protected 但缺 action`)
      if (!Array.isArray(r.subjects) || r.subjects.length === 0) errs.push(`${k} 为 protected 但 subjects 为空`)
    } else {
      errs.push(`${k} 的 visibility 只能是 public / protected`)
    }
  })
  return errs
}

async function loadActualRoutes(project) {
  const cfgRes = readProjectConfig(project)
  if (cfgRes.error) return { error: cfgRes.error }
  const src = cfgRes.config.routeSource
  if (!src || typeof src !== 'object') return { error: 'config.json 缺少 routeSource' }

  if (src.type === 'file') {
    const rel = String(src.path || '.vibe/routes.actual.json')
    const p = join(project, rel)
    if (!existsSync(p)) return { error: `routeSource 指向的文件不存在：${rel}` }
    try {
      const d = readJson(p)
      if (!Array.isArray(d.routes)) return { error: 'routes.actual.json 缺少 routes 数组' }
      return { routes: d.routes }
    } catch (e) {
      return { error: `routes.actual.json 不是合法 JSON：${e.message}` }
    }
  }

  if (src.type === 'endpoint') {
    if (!src.url) return { error: 'routeSource.endpoint 缺少 url' }
    try {
      const r = await fetchJson(String(src.url), Number(src.timeoutMs || 5000))
      if (r.status < 200 || r.status >= 300) return { error: `routeSource.endpoint 返回 ${r.status}` }
      if (!r.body || !Array.isArray(r.body.routes)) return { error: 'routeSource.endpoint 响应缺少 routes 数组' }
      return { routes: r.body.routes }
    } catch (e) {
      return { error: `请求 ${src.url} 失败：${e.message}` }
    }
  }

  return { error: `routeSource.type 不认识：${src.type}` }
}

async function runAuth01(project) {
  const subs = []

  const decl = sub('routes.json 声明合法')
  let declared = null
  const routesPath = join(project, '.vibe', 'routes.json')
  if (!existsSync(routesPath)) {
    decl.detail = '缺少 .vibe/routes.json'
  } else {
    try {
      const data = readJson(routesPath)
      const errs = validateRouteDeclarations(data)
      if (errs.length) {
        decl.detail = errs.length > 3 ? `${errs.slice(0, 3).join('；')} 等 ${errs.length} 项` : errs.join('；')
      } else {
        decl.ok = true
        declared = data.routes
        decl.detail = `${declared.length} 条声明合法`
      }
    } catch (e) {
      decl.detail = `routes.json 不是合法 JSON：${e.message}`
    }
  }
  subs.push(decl)

  const cover = sub('声明覆盖实际路由')
  const actual = await loadActualRoutes(project)
  if (actual.error) {
    cover.detail = actual.error
  } else if (!declared) {
    cover.detail = '声明不合法，跳过覆盖比对'
  } else {
    const dset = new Set(declared.map(routeKey))
    const aset = new Set(actual.routes.map(routeKey))
    const missing = [...aset].filter((k) => !dset.has(k))
    const ghost = [...dset].filter((k) => !aset.has(k))
    if (missing.length === 0 && ghost.length === 0) {
      cover.ok = true
      cover.detail = `${aset.size} 条实际路由全部已声明`
    } else {
      const parts = []
      if (missing.length) parts.push(`${missing.length} 条实际路由未声明（${missing.slice(0, 3).join('、')}）`)
      if (ghost.length) parts.push(`${ghost.length} 条声明路由实际不存在（${ghost.slice(0, 3).join('、')}）`)
      cover.detail = parts.join('；')
    }
  }
  subs.push(cover)

  return { ok: subs.every((s) => s.ok), subs }
}

// ── SPEC-OPS-01：health / ready 语义分离 ────────────────────────
async function runOps01(project) {
  const cfgRes = readProjectConfig(project)
  if (cfgRes.error) return { ok: false, subs: [Object.assign(sub('读取 .vibe/config.json'), { detail: cfgRes.error })] }
  const cfg = cfgRes.config
  if (!cfg.service || !cfg.service.startCommand) {
    return {
      ok: false,
      subs: [Object.assign(sub('读取 service 配置'), { detail: 'config.json 缺少 service.startCommand' })],
    }
  }

  const healthPath = (cfg.endpoints && cfg.endpoints.health) || DEFAULT_HEALTH
  const readyPath = (cfg.endpoints && cfg.endpoints.ready) || DEFAULT_READY

  const started = await startService(project, cfg.service)
  if (started.error) {
    return { ok: false, subs: [Object.assign(sub('服务启动'), { detail: started.error })] }
  }

  const subs = [Object.assign(sub('服务启动'), { ok: true, detail: cfg.service.baseUrl })]
  const base = String(cfg.service.baseUrl).replace(/\/$/, '')

  try {
    const health = await (async () => {
      const s = sub(`GET ${healthPath} 返回 JSON 对象`)
      try {
        const r = await fetchJson(base + healthPath)
        if (r.status < 200 || r.status >= 300) s.detail = `状态码 ${r.status}`
        else if (!r.body || typeof r.body !== 'object' || Array.isArray(r.body)) s.detail = '响应体不是 JSON 对象'
        else { s.ok = true; s.detail = `${r.status} ${JSON.stringify(r.body).slice(0, 50)}` }
      } catch (e) {
        s.detail = `请求失败：${e.message}`
      }
      return s
    })()
    subs.push(health)

    const ready = await (async () => {
      const s = sub(`GET ${readyPath} 返回 JSON 对象`)
      try {
        const r = await fetchJson(base + readyPath)
        if (r.status < 200 || r.status >= 300) s.detail = `状态码 ${r.status}`
        else if (!r.body || typeof r.body !== 'object' || Array.isArray(r.body)) s.detail = '响应体不是 JSON 对象'
        else { s.ok = true; s.detail = `${r.status}` }
      } catch (e) {
        s.detail = `请求失败：${e.message}`
      }
      return s
    })()
    subs.push(ready)

    const checks = sub(`${readyPath} 含 checks 数组`)
    try {
      const r = await fetchJson(base + readyPath)
      if (!r.body || !Array.isArray(r.body.checks)) checks.detail = '响应缺少 checks 数组（无法反映依赖状态）'
      else { checks.ok = true; checks.detail = `checks ${r.body.checks.length} 项` }
    } catch (e) {
      checks.detail = `请求失败：${e.message}`
    }
    subs.push(checks)
  } finally {
    await started.stop()
  }

  return { ok: subs.every((s) => s.ok), subs }
}

const RUNNERS = {
  'SPEC-STR-01': runStr01,
  'SPEC-AUTH-01': runAuth01,
  'SPEC-OPS-01': runOps01,
}

// ── 主流程 ─────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.selfTest) {
    const r = spawnSync(process.execPath, [join(ROOT, 'test', 'smoke.mjs')], { stdio: 'inherit' })
    return r.status === 0 ? EXIT.PASS : EXIT.FAIL
  }

  if (!args.checkId) {
    console.error('用法：vibe-check <SPEC-ID> [--project <dir>] [--json] | vibe-check --self-test')
    return EXIT.CONFIG
  }

  let spec, registry
  try {
    spec = readJson(join(ROOT, 'spec', 'spec.json'))
    registry = readJson(join(ROOT, 'checks', 'registry.json'))
  } catch (e) {
    console.error(`[CONFIG] 底座配置损坏：${e.message}`)
    return EXIT.CONFIG
  }

  const entry = spec.entries.find((x) => x.id === args.checkId)
  const reg = registry.checks.find((x) => x.id === args.checkId)
  if (!entry) return err(`SPEC 中不存在 ${args.checkId}`)
  if (!reg) return err(`注册表中不存在 ${args.checkId}`)
  if (!reg.implemented) return err(`${args.checkId} 尚未实现`)

  const runner = RUNNERS[args.checkId]
  if (!runner) return err(`${args.checkId} 没有对应的 runner`)

  let result
  try {
    result = await runner(args.project, spec.version)
  } catch (e) {
    console.error(`[CRASH] ${args.checkId} 执行崩溃：${e.stack || e.message}`)
    return EXIT.CRASH
  }

  const exitCode = result.ok ? EXIT.PASS : EXIT.FAIL

  if (args.json) {
    console.log(JSON.stringify({
      id: args.checkId,
      title: reg.title || '',
      project: args.project,
      specVersion: spec.version,
      status: result.ok ? 'PASS' : 'FAIL',
      exitCode,
      subs: result.subs,
      fix: `checks/${args.checkId}/fix.md`,
    }, null, 2))
    return exitCode
  }

  const mark = (ok) => (ok ? 'PASS' : 'FAIL')
  console.log(`[${result.ok ? 'PASS' : 'FAIL'}] ${args.checkId} ${reg.title || ''}`.trim())
  console.log(`  项目：${args.project}`)
  result.subs.forEach((s, i) => {
    const branch = i === result.subs.length - 1 ? '└─' : '├─'
    console.log(`  ${branch} ${s.name.padEnd(26)} ${mark(s.ok).padEnd(5)} ${s.detail}`)
  })
  if (!result.ok) console.log(`  处方：checks/${args.checkId}/fix.md`)
  console.log(`退出码 ${exitCode}`)
  return exitCode
}

function err(msg) {
  console.error(`[CONFIG] ${msg}`)
  return EXIT.CONFIG
}

process.exit(await main())
