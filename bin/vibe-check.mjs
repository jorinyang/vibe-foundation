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
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const EXIT = { PASS: 0, FAIL: 1, CONFIG: 2, CRASH: 3 }

function parseArgs(argv) {
  const args = { checkId: null, project: process.cwd(), json: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--project' || a === '-p') args.project = resolve(argv[++i])
    else if (a === '--json') args.json = true
    else if (!a.startsWith('-') && !args.checkId) args.checkId = a
  }
  return args
}

/** 读 JSON：容忍 UTF-8 BOM（Windows 编辑器常见，属实测问题） */
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
}

function countLines(path) {
  const text = readFileSync(path, 'utf8')
  const lines = text.split(/\r?\n/)
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.length
}

/** 子判定结果收集器 */
function sub(name) {
  return { name, ok: false, detail: '' }
}

// ── SPEC-STR-01：项目宪法单屏 + 底座引用版本对账 ─────────────────
function runStr01(project, specVersion) {
  const subs = []

  // 子判定 1：ref.json 存在且与底座版本一致
  const versionCheck = sub('版本对账（.vibe/ref.json vs 底座）')
  const refPath = join(project, '.vibe', 'ref.json')
  if (!existsSync(refPath)) {
    versionCheck.detail = `缺少 ${refPath}`
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

  // 子判定 2：宪法单屏 ≤ 150 行
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

const RUNNERS = {
  'SPEC-STR-01': runStr01,
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!args.checkId) {
    console.error('用法：vibe-check <SPEC-ID> [--project <dir>] [--json]')
    return EXIT.CONFIG
  }

  // 配置读取
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
  if (!entry) {
    console.error(`[CONFIG] SPEC 中不存在 ${args.checkId}`)
    return EXIT.CONFIG
  }
  if (!reg) {
    console.error(`[CONFIG] 注册表中不存在 ${args.checkId}`)
    return EXIT.CONFIG
  }
  if (!reg.implemented) {
    console.error(`[CONFIG] ${args.checkId} 尚未实现`)
    return EXIT.CONFIG
  }

  const runner = RUNNERS[args.checkId]
  if (!runner) {
    console.error(`[CONFIG] ${args.checkId} 没有对应的 runner`)
    return EXIT.CONFIG
  }

  // 执行
  let result
  try {
    result = runner(args.project, spec.version)
  } catch (e) {
    console.error(`[CRASH] ${args.checkId} 执行崩溃：${e.stack || e.message}`)
    return EXIT.CRASH
  }

  const exitCode = result.ok ? EXIT.PASS : EXIT.FAIL

  if (args.json) {
    console.log(JSON.stringify({
      id: args.checkId,
      title: entry.statement,
      project: args.project,
      specVersion: spec.version,
      status: result.ok ? 'PASS' : 'FAIL',
      exitCode,
      subs: result.subs,
      fix: `checks/${args.checkId}/fix.md`,
    }, null, 2))
    return exitCode
  }

  // 人读输出
  const icon = (ok) => (ok ? 'PASS' : 'FAIL')
  console.log(`[${result.ok ? 'PASS' : 'FAIL'}] ${args.checkId} ${reg.title || ''}`.trim())
  console.log(`  项目：${args.project}`)
  result.subs.forEach((s, i) => {
    const branch = i === result.subs.length - 1 ? '└─' : '├─'
    console.log(`  ${branch} ${s.name.padEnd(28)} ${icon(s.ok).padEnd(5)} ${s.detail}`)
  })
  if (!result.ok) console.log(`  处方：checks/${args.checkId}/fix.md`)
  console.log(`退出码 ${exitCode}`)
  return exitCode
}

process.exit(main())
