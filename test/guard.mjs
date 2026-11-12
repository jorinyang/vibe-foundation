#!/usr/bin/env node
/**
 * guard — 防退化检查：底座里不许出现业务痕迹与本地路径
 *
 * 为什么需要：一旦底座里写死项目名、绝对路径、本地工作副本位置，
 * 它就退化成"某台机器上的私有脚本"，引用式变成复制式。
 *
 * 用法：node test/guard.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SELF = join(ROOT, 'test', 'guard.mjs')
const SKIP_DIRS = new Set(['.git', 'node_modules'])
const EXT = new Set(['.mjs', '.js', '.json', '.md', '.yaml', '.yml'])

const RULES = [
  { name: 'Windows 绝对路径', re: /[A-Za-z]:\\(?:Users|Desktop|Knowledge|deepseek)/i },
  { name: 'POSIX 绝对路径', re: /\/(?:Users|home)\/[A-Za-z0-9._-]+\// },
  { name: '本地工作副本路径', re: /Knowledge-external|Desktop[\\/]Knowledge/ },
  { name: '具体项目工作目录', re: /_system[\\/]vibe-foundation/ },
]

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (EXT.has(extname(name))) out.push(p)
  }
  return out
}

let bad = 0
for (const file of walk(ROOT)) {
  if (file === SELF) continue
  const text = readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  for (const rule of RULES) {
    lines.forEach((line, i) => {
      if (rule.re.test(line)) {
        bad++
        console.log(`FAIL  ${relative(ROOT, file).replace(/\\/g, '/')}:${i + 1}  ${rule.name}  ${line.trim().slice(0, 80)}`)
      }
    })
  }
}

if (bad) {
  console.log(`\n防退化检查：${bad} 处违规`)
  process.exit(1)
}
console.log('防退化检查：通过（无绝对路径 / 无本地工作副本引用）')
process.exit(0)
