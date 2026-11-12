#!/usr/bin/env node
/**
 * build-index — 生成 SPEC 反向索引，并检测死条款与不合规条目
 *
 * 用法：
 *   node spec/build-index.mjs           # 重写 spec/spec.json 的 referenced_by
 *   node spec/build-index.mjs --check   # 只检查，不写；有不合规则退出码 1
 *
 * 规则（见 STANDARDS）：
 *   - referenced_by 必须由脚本生成，不许手写
 *   - referenced_by 为空 = 死条款（planned: true 的除外）
 *   - statement 不得含软化词
 *   - ID 必须符合 SPEC-<DOMAIN>-<NN>
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SPEC_PATH = join(ROOT, 'spec', 'spec.json')
const SCAN_DIRS = ['checks', 'protocols', 'bin']
const TEXT_EXT = new Set(['.json', '.md', '.mjs', '.yaml', '.yml'])
const SOFT_WORDS = ['尽量', '建议', '适当', '视情况', '酌情', '原则上']

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (TEXT_EXT.has(extname(name))) out.push(p)
  }
  return out
}

function collectText() {
  const chunks = []
  for (const d of SCAN_DIRS) {
    for (const f of walk(join(ROOT, d))) chunks.push({ file: f, text: readFileSync(f, 'utf8') })
  }
  return chunks
}

function buildIndex(spec, chunks) {
  const errors = []
  const planned = []

  for (const e of spec.entries) {
    if (!/^SPEC-[A-Z]+-\d{2}$/.test(e.id)) errors.push(`${e.id}：ID 不符合 SPEC-<DOMAIN>-<NN>`)
    if (!e.statement || !String(e.statement).trim()) errors.push(`${e.id}：statement 为空`)
    if (!e.rationale || !String(e.rationale).trim()) errors.push(`${e.id}：rationale 为空`)
    for (const w of SOFT_WORDS) {
      if (String(e.statement || '').includes(w)) errors.push(`${e.id}：statement 含软化词「${w}」`)
    }
  }

  for (const e of spec.entries) {
    const refs = new Set()
    for (const c of chunks) {
      if (c.text.includes(e.id)) {
        // 只统计"引用方"：checks 目录下的具体判定目录名、以及非 spec 的文件
        if (c.file.includes(`${join('checks', e.id)}`)) refs.add(e.id)
        else if (c.file.includes('checks')) continue
        else refs.add(c.file.replace(ROOT + '\\', '').replace(ROOT + '/', '').replace(/\\/g, '/'))
      }
    }
    e.referenced_by = [...refs].sort()
    if (e.referenced_by.length === 0) {
      if (e.planned) planned.push(e.id)
      else errors.push(`${e.id}：死条款（没有任何执行层引用）`)
    }
  }

  spec.entries.sort((a, b) => a.id.localeCompare(b.id))
  return { errors, planned }
}

function main() {
  const checkOnly = process.argv.includes('--check')
  const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'))
  const chunks = collectText()
  const { errors, planned } = buildIndex(spec, chunks)

  const implemented = spec.entries.filter((e) => !e.planned).length
  console.log(`SPEC ${spec.version} · 条目 ${spec.entries.length}（已实现 ${implemented}，待实现 ${spec.entries.length - implemented}）`)
  if (planned.length) console.log(`待实现（不算死条款）：${planned.join('、')}`)

  if (errors.length) {
    console.error(`\n发现 ${errors.length} 处不合规：`)
    for (const e of errors) console.error(`  - ${e}`)
    return 1
  }
  console.log('引用完整度：全部已实现条目均有执行层引用')

  if (checkOnly) return 0

  writeFileSync(SPEC_PATH, JSON.stringify(spec, null, 2) + '\n')
  console.log(`已重写 ${SPEC_PATH}`)
  return 0
}

process.exit(main())
