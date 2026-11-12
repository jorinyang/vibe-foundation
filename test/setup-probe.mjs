/**
 * setup-probe — 给真实项目生成 .vibe/ 探测配置（只读分析，不改项目源码）
 *
 * 用法：node setup-probe.mjs <project-dir> <spec-version> <stack> [sourceDirs|comma]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname, relative } from 'node:path'

const project = resolve(process.argv[2])
const specVersion = process.argv[3] || '0.7.0'
const stack = process.argv[4] || 'ts'
const dirs = (process.argv[5] || 'src').split(',').map((s) => s.trim()).filter(Boolean)

const vibe = join(project, '.vibe')
mkdirSync(vibe, { recursive: true })

// 1. ref.json
writeFileSync(join(vibe, 'ref.json'), JSON.stringify({ spec: specVersion, checker: specVersion, channel: 'stable' }, null, 2) + '\n')
console.log(`ref.json → spec ${specVersion}`)

// 2. 收集 package.json 的 runtime 依赖
const pkgFiles = []
const rootPkg = join(project, 'package.json')
if (existsSync(rootPkg)) pkgFiles.push(rootPkg)
for (const parent of ['apps', 'packages']) {
  const base = join(project, parent)
  if (!existsSync(base)) continue
  for (const name of readdirSync(base)) {
    const p = join(base, name, 'package.json')
    if (existsSync(join(base, name)) && statSync(join(base, name)).isDirectory() && existsSync(p)) pkgFiles.push(p)
  }
}
const runtime = new Set()
const devOnly = new Set()
for (const f of pkgFiles) {
  try {
    const j = JSON.parse(readFileSync(f, 'utf8'))
    for (const k of Object.keys(j.dependencies || {})) runtime.add(k)
    for (const k of Object.keys(j.devDependencies || {})) if (!runtime.has(k)) devOnly.add(k)
  } catch { /* 跳过坏 json */ }
}
writeFileSync(join(vibe, 'runtime-deps.json'), JSON.stringify({ version: 1, stack, runtime: [...runtime].sort() }, null, 2) + '\n')
console.log(`runtime-deps.json → ${runtime.size} 个运行依赖（来自 ${pkgFiles.length} 个 package.json）`)

// 3. config.json（不含 service：探测阶段只跑只读判定）
writeFileSync(join(vibe, 'config.json'), JSON.stringify({
  routeSource: { type: 'file', path: '.vibe/routes.actual.json' },
  runtimeDeps: { stack, sourceDirs: dirs },
  structure: { stack, sourceDirs: dirs, layers: {} },
}, null, 2) + '\n')
console.log(`config.json → sourceDirs ${dirs.join(', ')}`)

// 4. 从源码抽取实际路由（Fastify / Express 风格的 .get( '/path' ））
const ROUTE_RE = /\b(?:fastify|app|server|instance|router|api|r)\.(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi
const routes = []
const seen = new Set()
function walk(dir) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p)
    else if (/\.(ts|js|mjs|cjs|tsx|jsx)$/.test(name)) {
      const code = readFileSync(p, 'utf8')
      let m
      ROUTE_RE.lastIndex = 0
      while ((m = ROUTE_RE.exec(code))) {
        const key = `${m[1].toUpperCase()} ${m[2]}`
        if (seen.has(key)) continue
        seen.add(key)
        const line = code.slice(0, m.index).split('\n').length
        routes.push({ method: m[1].toUpperCase(), path: m[2], source: `${relative(project, p).replace(/\\/g, '/')}:${line}` })
      }
    }
  }
}
for (const d of dirs) walk(resolve(project, d))
routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
writeFileSync(join(vibe, 'routes.actual.json'), JSON.stringify({ routes: routes.map((r) => ({ method: r.method, path: r.path, source: r.source })) }, null, 2) + '\n')
console.log(`routes.actual.json → 抽取 ${routes.length} 条路由（启发式，可能含误报）`)

// 5. 空声明，让 AUTH-01 报出「未声明的路由」
if (!existsSync(join(vibe, 'routes.json'))) {
  writeFileSync(join(vibe, 'routes.json'), JSON.stringify({ version: 1, routes: [] }, null, 2) + '\n')
  console.log('routes.json → 空声明（用于测出「未纳入管控的路由」）')
}

console.log('done')
