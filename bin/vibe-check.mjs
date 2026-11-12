#!/usr/bin/env node
/**
 * vibe-check — 底座判定执行入口
 *
 * 用法：
 *   vibe-check <SPEC-ID> [--project <dir>] [--json]
 *   vibe-check plan [--project <dir>] [--json]
 *   vibe-check all  [--project <dir>] [--json] [--ci] [--sarif <file>]
 *   vibe-check report-public [--project <dir>]
 *   vibe-check init [--project <dir>]
 *   vibe-check --self-test
 *
 * 退出码：0 通过 / 1 失败 / 2 配置错误 / 3 判定崩溃
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { join, dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EXIT = { PASS: 0, FAIL: 1, CONFIG: 2, CRASH: 3 }
const MIN_PUBLIC_REASON = 8
const DEFAULT_HEALTH = '/health'
const DEFAULT_READY = '/ready'
const PUBLIC_WARN = 0.2
const PUBLIC_STRONG_WARN = 0.4

// ── 参数 ───────────────────────────────────────────────────
const COMMANDS = new Set(['plan', 'all', 'report-public', 'init'])

function parseArgs(argv) {
  const args = {
    cmd: 'check', checkId: null, project: process.cwd(),
    json: false, selfTest: false, ci: false, sarif: null,
  }
  const rest = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--project' || a === '-p') args.project = resolve(argv[++i])
    else if (a === '--json') args.json = true
    else if (a === '--ci') args.ci = true
    else if (a === '--sarif') args.sarif = resolve(argv[++i])
    else if (a === '--self-test') args.selfTest = true
    else if (a === '--report-public') args.cmd = 'report-public'
    else if (!a.startsWith('-')) rest.push(a)
  }
  if (rest.length && COMMANDS.has(rest[0])) args.cmd = rest.shift()
  if (rest.length) args.checkId = rest[0]
  return args
}

// ── 基础工具 ────────────────────────────────────────────────
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

function single(name, detail) {
  return { ok: false, subs: [Object.assign(sub(name), { detail })] }
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
  try { body = JSON.parse(text) } catch { body = null }
  return { status: res.status, body, text }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function stopTree(child) {
  return new Promise((done) => {
    if (!child || child.exitCode !== null || !child.pid) return done()
    if (process.platform === 'win32') {
      const k = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      k.on('exit', () => setTimeout(done, 300))
      k.on('error', () => { try { child.kill('SIGKILL') } catch { /* ignore */ } ; setTimeout(done, 300) })
    } else {
      try { child.kill('SIGTERM') } catch { /* ignore */ }
      setTimeout(done, 500)
    }
  })
}

async function startService(project, svc) {
  const cwd = isAbsolute(svc.cwd || '') ? svc.cwd : resolve(project, svc.cwd || '.')
  const timeout = Number(svc.startupTimeoutMs || 15000)
  const base = String(svc.baseUrl || '').replace(/\/$/, '')
  if (!base) return { error: 'service.baseUrl 未配置' }

  let child
  try {
    child = spawn(svc.startCommand, {
      cwd, shell: true, stdio: 'ignore', windowsHide: true,
      env: { ...process.env, ...(svc.env || {}) },
    })
  } catch (e) {
    return { error: `启动失败：${e.message}` }
  }

  let exited = false
  let exitInfo = ''
  child.on('exit', (code, sig) => { exited = true; exitInfo = `code=${code} signal=${sig}` })

  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (exited) return { error: `服务提前退出（${exitInfo}）：${svc.startCommand}` }
    try {
      await fetch(base + '/', { signal: AbortSignal.timeout(800) })
      return { stop: () => stopTree(child) }
    } catch { /* 还没起来 */ }
    await sleep(200)
  }
  await stopTree(child)
  return { error: `服务在 ${timeout}ms 内未在 ${base} 就绪` }
}

// ── SPEC-STR-01 ────────────────────────────────────────────
function runStr01(project, specVersion) {
  const subs = []
  const versionCheck = sub('版本对账（.vibe/ref.json vs 底座）')
  const refPath = join(project, '.vibe', 'ref.json')
  if (!existsSync(refPath)) {
    versionCheck.detail = '缺少 .vibe/ref.json'
  } else {
    try {
      const ref = readJson(refPath)
      if (typeof ref.spec !== 'string' || ref.spec === '') versionCheck.detail = 'ref.json 缺少 spec 字段'
      else if (ref.spec !== specVersion) versionCheck.detail = `项目声明 ${ref.spec}，底座实际 ${specVersion}`
      else { versionCheck.ok = true; versionCheck.detail = `项目 ${ref.spec} = 底座 ${specVersion}` }
    } catch (e) {
      versionCheck.detail = `ref.json 不是合法 JSON：${e.message}`
    }
  }
  subs.push(versionCheck)

  const constitutionCheck = sub('宪法单屏（≤ 150 行）')
  const found = [join(project, 'AGENTS.md'), join(project, '.vibe', 'constitution.md')].find((p) => existsSync(p))
  if (!found) constitutionCheck.detail = '缺少 AGENTS.md 或 .vibe/constitution.md'
  else {
    const n = countLines(found)
    constitutionCheck.ok = n <= 150
    constitutionCheck.detail = `${found.endsWith('AGENTS.md') ? 'AGENTS.md' : '.vibe/constitution.md'} ${n} 行`
    if (!constitutionCheck.ok) constitutionCheck.detail += '（超过 150）'
  }
  subs.push(constitutionCheck)

  return { ok: subs.every((s) => s.ok), subs }
}

// ── SPEC-AUTH-01 ───────────────────────────────────────────
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
      if (errs.length) decl.detail = errs.length > 3 ? `${errs.slice(0, 3).join('；')} 等 ${errs.length} 项` : errs.join('；')
      else { decl.ok = true; declared = data.routes; decl.detail = `${declared.length} 条声明合法` }
    } catch (e) {
      decl.detail = `routes.json 不是合法 JSON：${e.message}`
    }
  }
  subs.push(decl)

  const cover = sub('声明覆盖实际路由')
  const actual = await loadActualRoutes(project)
  if (actual.error) cover.detail = actual.error
  else if (!declared) cover.detail = '声明不合法，跳过覆盖比对'
  else {
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

// ── SPEC-AUTH-02 ───────────────────────────────────────────
async function runAuthz02(project) {
  const cfgRes = readProjectConfig(project)
  if (cfgRes.error) return single('读取 .vibe/config.json', cfgRes.error)
  const cfg = cfgRes.config
  const probe = cfg.authzProbe
  if (!probe) return single('读取 authzProbe 配置', 'config.json 缺少 authzProbe')
  if (!probe.userA || !probe.userB) return single('读取 authzProbe 配置', 'authzProbe 缺少 userA / userB')
  if (!probe.pathTemplate) return single('读取 authzProbe 配置', 'authzProbe 缺少 pathTemplate')
  if (!cfg.service || !cfg.service.startCommand) return single('读取 service 配置', 'config.json 缺少 service.startCommand')

  const started = await startService(project, cfg.service)
  if (started.error) return single('服务启动', started.error)

  const subs = [Object.assign(sub('服务启动'), { ok: true, detail: cfg.service.baseUrl })]
  const base = String(cfg.service.baseUrl).replace(/\/$/, '')
  const header = String(probe.tokenHeader || 'authorization')
  const deny = Array.isArray(probe.denyStatus) && probe.denyStatus.length ? probe.denyStatus : [403, 404]
  const urlOf = (rid) => base + String(probe.pathTemplate).replace('{id}', encodeURIComponent(String(rid)))

  const call = async (token, rid) => {
    const res = await fetch(urlOf(rid), {
      method: String(probe.method || 'GET'),
      headers: { [header]: String(token) },
      signal: AbortSignal.timeout(8000),
    })
    const text = await res.text()
    let body = null
    try { body = JSON.parse(text) } catch { body = null }
    return { status: res.status, body, text }
  }

  try {
    const ownA = sub('A 读自己的资源 → 2xx')
    try {
      const r = await call(probe.userA.token, probe.userA.resourceId)
      ownA.ok = r.status >= 200 && r.status < 300
      ownA.detail = `状态码 ${r.status}`
    } catch (e) { ownA.detail = `请求失败：${e.message}` }
    subs.push(ownA)

    const cross = sub('A 读 B 的资源 → 拒绝')
    let crossRes = null
    try {
      crossRes = await call(probe.userA.token, probe.userB.resourceId)
      cross.ok = deny.includes(crossRes.status)
      cross.detail = `状态码 ${crossRes.status}（期望 ${deny.join('/')}）`
    } catch (e) { cross.detail = `请求失败：${e.message}` }
    subs.push(cross)

    const ownB = sub('B 读自己的资源 → 2xx')
    try {
      const r = await call(probe.userB.token, probe.userB.resourceId)
      ownB.ok = r.status >= 200 && r.status < 300
      ownB.detail = `状态码 ${r.status}`
    } catch (e) { ownB.detail = `请求失败：${e.message}` }
    subs.push(ownB)

    const leak = sub('越权响应不含他人资源标识')
    if (!crossRes) leak.detail = '越权请求未完成，无法判断'
    else if (crossRes.text.includes(String(probe.userB.resourceId))) leak.detail = '响应体中出现了他人资源标识（拒绝但泄露数据）'
    else { leak.ok = true; leak.detail = '未出现他人资源标识' }
    subs.push(leak)
  } finally {
    await started.stop()
  }

  return { ok: subs.every((s) => s.ok), subs }
}

// ── SPEC-OPS-01 ────────────────────────────────────────────
async function runOps01(project) {
  const cfgRes = readProjectConfig(project)
  if (cfgRes.error) return single('读取 .vibe/config.json', cfgRes.error)
  const cfg = cfgRes.config
  if (!cfg.service || !cfg.service.startCommand) return single('读取 service 配置', 'config.json 缺少 service.startCommand')

  const healthPath = (cfg.endpoints && cfg.endpoints.health) || DEFAULT_HEALTH
  const readyPath = (cfg.endpoints && cfg.endpoints.ready) || DEFAULT_READY

  const started = await startService(project, cfg.service)
  if (started.error) return single('服务启动', started.error)

  const subs = [Object.assign(sub('服务启动'), { ok: true, detail: cfg.service.baseUrl })]
  const base = String(cfg.service.baseUrl).replace(/\/$/, '')

  try {
    const health = sub(`GET ${healthPath} 返回 JSON 对象`)
    try {
      const r = await fetchJson(base + healthPath)
      if (r.status < 200 || r.status >= 300) health.detail = `状态码 ${r.status}`
      else if (!r.body || typeof r.body !== 'object' || Array.isArray(r.body)) health.detail = '响应体不是 JSON 对象'
      else { health.ok = true; health.detail = `${r.status} ${JSON.stringify(r.body).slice(0, 50)}` }
    } catch (e) { health.detail = `请求失败：${e.message}` }
    subs.push(health)

    const ready = sub(`GET ${readyPath} 返回 JSON 对象`)
    try {
      const r = await fetchJson(base + readyPath)
      if (r.status < 200 || r.status >= 300) ready.detail = `状态码 ${r.status}`
      else if (!r.body || typeof r.body !== 'object' || Array.isArray(r.body)) ready.detail = '响应体不是 JSON 对象'
      else { ready.ok = true; ready.detail = `${r.status}` }
    } catch (e) { ready.detail = `请求失败：${e.message}` }
    subs.push(ready)

    const checks = sub(`${readyPath} 含 checks 数组`)
    try {
      const r = await fetchJson(base + readyPath)
      if (!r.body || !Array.isArray(r.body.checks)) checks.detail = '响应缺少 checks 数组（无法反映依赖状态）'
      else { checks.ok = true; checks.detail = `checks ${r.body.checks.length} 项` }
    } catch (e) { checks.detail = `请求失败：${e.message}` }
    subs.push(checks)
  } finally {
    await started.stop()
  }

  return { ok: subs.every((s) => s.ok), subs }
}

const RUNNERS = {
  'SPEC-STR-01': runStr01,
  'SPEC-AUTH-01': runAuth01,
  'SPEC-AUTH-02': runAuthz02,
  'SPEC-OPS-01': runOps01,
}

// ── 豁免与评估 ─────────────────────────────────────────────
function readOverride(project, id) {
  const p = join(project, '.vibe', 'override', `${id}.md`)
  if (!existsSync(p)) return null
  const text = readFileSync(p, 'utf8').replace(/^\uFEFF/, '')
  const owner = (text.match(/负责人[:：]\s*(.+)/) || [])[1]
  const due = (text.match(/到期日[:：]\s*(\d{4}-\d{2}-\d{2})/) || [])[1]
  const today = new Date().toISOString().slice(0, 10)
  return {
    owner: owner ? owner.trim() : '',
    due: due || '',
    expired: !due || due < today,
    path: p,
  }
}

async function evaluate(id, project, spec, registry) {
  const reg = registry.checks.find((x) => x.id === id)
  const runner = RUNNERS[id]
  if (!reg || !reg.implemented || !runner) {
    return { id, title: reg ? reg.title : '', status: 'CONFIG', subs: [], note: '未实现的判定' }
  }

  let res
  try {
    res = await runner(project, spec.version)
  } catch (e) {
    return { id, title: reg.title, status: 'CRASH', subs: [], note: `执行崩溃：${e.message}` }
  }

  let status = res.ok ? 'PASS' : 'FAIL'
  let note = ''
  const ov = readOverride(project, id)
  if (status === 'FAIL' && ov) {
    if (!ov.owner) note = '豁免缺负责人，按配置错误处理'
    else if (ov.expired) note = `豁免已过期（${ov.due || '无到期日'}）`
    else { status = 'SKIP'; note = `豁免至 ${ov.due}` }
  }

  return { id, title: reg.title, status, subs: res.subs, fix: `checks/${id}/fix.md`, note }
}

// ── 渲染 ───────────────────────────────────────────────────
function renderResults(results, project, spec, verbose) {
  console.log(`SPEC ${spec.version} · 项目：${project}`)
  console.log('─'.repeat(64))
  for (const r of results) {
    const line = `${r.status.padEnd(6)} ${r.id}  ${r.title || ''}`.trim()
    console.log(line)
    if (r.note) console.log(`       ${r.note}`)
    if (verbose || r.status === 'FAIL') {
      for (const s of r.subs.filter((x) => !x.ok)) console.log(`       └─ ${s.name}  ${s.detail}`)
    }
    if (r.status === 'FAIL' && r.fix) console.log(`       处方：${r.fix}`)
  }
  console.log('─'.repeat(64))
  const count = (st) => results.filter((r) => r.status === st).length
  console.log(`合计 ${results.length} · PASS ${count('PASS')} · FAIL ${count('FAIL')} · SKIP ${count('SKIP')} · CRASH ${count('CRASH')}`)
  const skips = results.filter((r) => r.status === 'SKIP')
  if (skips.length) console.log(`豁免：${skips.map((r) => r.id).join('、')}${skips.length > 3 ? '（超过 3 条，建议收紧）' : ''}`)
}

function toSarif(results, project, spec) {
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [{
      tool: {
        driver: {
          name: 'vibe-check',
          version: spec.version,
          rules: results.map((r) => ({ id: r.id, shortDescription: { text: r.title || r.id } })),
        },
      },
      results: results
        .filter((r) => r.status === 'FAIL' || r.status === 'CRASH')
        .map((r) => ({
          ruleId: r.id,
          level: 'error',
          message: {
            text: r.subs.filter((s) => !s.ok).map((s) => `${s.name}: ${s.detail}`).join('; ') || r.note || '判定失败',
          },
          locations: [{
            physicalLocation: { artifactLocation: { uri: project.replace(/\\/g, '/'), uriBaseId: '%SRCROOT%' } },
          }],
        })),
    }],
  }
}

function exitOf(results) {
  if (results.some((r) => r.status === 'CRASH')) return EXIT.CRASH
  if (results.some((r) => r.status === 'CONFIG')) return EXIT.CONFIG
  if (results.some((r) => r.status === 'FAIL')) return EXIT.FAIL
  return EXIT.PASS
}

// ── 命令 ───────────────────────────────────────────────────
async function cmdAggregate(args, spec, registry) {
  const ids = registry.checks.filter((c) => c.implemented).map((c) => c.id)
  const results = []
  for (const id of ids) results.push(await evaluate(id, args.project, spec, registry))

  if (args.sarif) {
    writeFileSync(args.sarif, JSON.stringify(toSarif(results, args.project, spec), null, 2))
    console.log(`SARIF 已写入 ${args.sarif}`)
  }
  if (args.json) {
    console.log(JSON.stringify({ specVersion: spec.version, project: args.project, results }, null, 2))
  } else {
    renderResults(results, args.project, spec, args.cmd === 'plan')
  }
  return exitOf(results)
}

function cmdReportPublic(project) {
  const routesPath = join(project, '.vibe', 'routes.json')
  if (!existsSync(routesPath)) {
    console.error('[CONFIG] 缺少 .vibe/routes.json')
    return EXIT.CONFIG
  }
  let data
  try {
    data = readJson(routesPath)
  } catch (e) {
    console.error(`[CONFIG] routes.json 不是合法 JSON：${e.message}`)
    return EXIT.CONFIG
  }
  const routes = Array.isArray(data.routes) ? data.routes : []
  const pubs = routes.filter((r) => r.visibility === 'public')
  const ratio = routes.length ? pubs.length / routes.length : 0
  const pct = (ratio * 100).toFixed(1)

  console.log(`公开面清单：${pubs.length} / ${routes.length} 条（占比 ${pct}%）`)
  for (const r of pubs) {
    console.log(`  ${String(r.method || '').toUpperCase().padEnd(6)} ${String(r.path || '').padEnd(28)} ${r.reason || '(缺理由)'}`)
  }
  if (ratio > PUBLIC_STRONG_WARN) {
    console.log(`\nWARN 公开比例 ${pct}% 超过 ${PUBLIC_STRONG_WARN * 100}%，请逐条复核上面 ${Math.min(pubs.length, 10)} 条理由`)
  } else if (ratio > PUBLIC_WARN) {
    console.log(`\nWARN 公开比例 ${pct}% 超过 ${PUBLIC_WARN * 100}%`)
  }
  return EXIT.PASS
}

function cmdInit(project, spec) {
  const vibe = join(project, '.vibe')
  mkdirSync(vibe, { recursive: true })
  const created = []
  const ensure = (rel, content) => {
    const p = join(vibe, rel)
    if (existsSync(p)) return
    writeFileSync(p, content)
    created.push(rel)
  }

  ensure('ref.json', JSON.stringify({ spec: spec.version, checker: spec.version, channel: 'stable' }, null, 2) + '\n')
  ensure('config.json', JSON.stringify({
    routeSource: { type: 'file', path: '.vibe/routes.actual.json' },
    service: { startCommand: 'npm start', baseUrl: 'http://127.0.0.1:3000', startupTimeoutMs: 15000 },
    endpoints: { health: '/health', ready: '/ready' },
  }, null, 2) + '\n')
  ensure('routes.json', JSON.stringify({
    version: 1,
    routes: [{
      method: 'GET', path: '/health', visibility: 'public',
      reason: '容器健康探针，只返回进程状态，不含业务数据',
    }],
  }, null, 2) + '\n')

  console.log(`初始化 ${vibe}`)
  console.log(created.length ? `已创建：${created.join('、')}` : '已存在，未覆盖任何文件')
  console.log('下一步：补 routes.actual.json，或把 routeSource 改成 endpoint')
  return EXIT.PASS
}

// ── 主流程 ─────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.selfTest) {
    const r = spawnSync(process.execPath, [join(ROOT, 'test', 'smoke.mjs')], { stdio: 'inherit' })
    return r.status === 0 ? EXIT.PASS : EXIT.FAIL
  }

  let spec, registry
  try {
    spec = readJson(join(ROOT, 'spec', 'spec.json'))
    registry = readJson(join(ROOT, 'checks', 'registry.json'))
  } catch (e) {
    console.error(`[CONFIG] 底座配置损坏：${e.message}`)
    return EXIT.CONFIG
  }

  if (args.cmd === 'init') return cmdInit(args.project, spec)
  if (args.cmd === 'report-public') return cmdReportPublic(args.project)
  if (args.cmd === 'plan' || args.cmd === 'all') return cmdAggregate(args, spec, registry)

  if (!args.checkId) {
    console.error('用法：vibe-check <SPEC-ID> | plan | all | report-public | init | --self-test')
    return EXIT.CONFIG
  }

  const entry = spec.entries.find((x) => x.id === args.checkId)
  if (!entry) return err(`SPEC 中不存在 ${args.checkId}`)
  if (!RUNNERS[args.checkId]) return err(`${args.checkId} 尚未实现`)

  const r = await evaluate(args.checkId, args.project, spec, registry)

  if (args.json) {
    console.log(JSON.stringify(r, null, 2))
    return exitOf([r])
  }

  console.log(`[${r.status}] ${r.id} ${r.title || ''}`.trim())
  console.log(`  项目：${args.project}`)
  r.subs.forEach((s, i) => {
    const branch = i === r.subs.length - 1 ? '└─' : '├─'
    console.log(`  ${branch} ${s.name.padEnd(24)} ${(s.ok ? 'PASS' : 'FAIL').padEnd(5)} ${s.detail}`)
  })
  if (r.note) console.log(`  备注：${r.note}`)
  if (r.status !== 'PASS') console.log(`  处方：${r.fix || '-'}`)
  console.log(`退出码 ${exitOf([r])}`)
  return exitOf([r])
}

function err(msg) {
  console.error(`[CONFIG] ${msg}`)
  return EXIT.CONFIG
}

process.exit(await main())
