// dsh-session-doctor.js — DSH 会话健康检查与"退役字段"修复工具
//
// 背景：DSH 0.2.1 起，会话头部若含退役字段 sandboxMode / approvalPolicy，
// 持久层 list() 会整体报错，导致 GUI"老会话全部消失"（文件本身完好）。
//
// 用法（用 DSH 自带 Node 24 运行，也可以用任意 Node ≥ 22.15）：
//   node dsh-session-doctor.js          # 只扫描，报告问题会话
//   node dsh-session-doctor.js --fix    # 修复（先自动备份 .bak，再重写头部）
//
// 也可以扫描指定目录：node dsh-session-doctor.js "D:\path\to\sessions"

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { Readable } = require('stream')

const RETIRED_FIELDS = ['sandboxMode', 'approvalPolicy']
const args = process.argv.slice(2)
const FIX = args.includes('--fix')
const dirArg = args.find(a => !a.startsWith('--'))
const ROOT = dirArg || path.join(process.env.USERPROFILE || process.env.HOME, '.dsh', 'sessions')

async function decompress(file) {
  const buf = fs.readFileSync(file)
  if (!file.endsWith('.zstd')) return buf.toString('utf8')
  const chunks = []
  const stream = Readable.from(buf).pipe(zlib.createZstdDecompress())
  for await (const c of stream) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8')
}

function collect(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) collect(p, out)
    else if (/^session(\.v\d+)?\.jsonl(\.zstd)?$/.test(e.name)) out.push(p)
  }
  return out
}

;(async () => {
  const files = collect(ROOT)
  let poisoned = 0, unreadable = 0
  console.log(`扫描 ${files.length} 个会话文件 @ ${ROOT}\n`)
  for (const f of files) {
    const rel = path.relative(ROOT, f)
    let text
    try { text = await decompress(f) } catch (e) { unreadable++; console.log(`[无法读取] ${rel} :: ${e.message.slice(0, 60)}`); continue }
    const firstNl = text.indexOf('\n')
    let header
    try { header = JSON.parse(firstNl === -1 ? text : text.slice(0, firstNl)) } catch { unreadable++; console.log(`[头部损坏] ${rel}`); continue }
    const bad = RETIRED_FIELDS.filter(k => Object.hasOwn(header, k))
    if (bad.length === 0) continue
    poisoned++
    console.log(`[毒会话] ${rel}`)
    console.log(`         字段: ${bad.join(', ')} | cwd: ${header.cwd || '(无)'} | 创建: ${new Date(header.createdAt || 0).toLocaleString('zh-CN')}`)
    if (FIX) {
      const rest = firstNl === -1 ? '' : text.slice(firstNl)
      for (const k of bad) delete header[k]
      const bak = f + '.bak'
      if (!fs.existsSync(bak)) fs.copyFileSync(f, bak)
      const fixed = JSON.stringify(header) + rest
      const out = f.endsWith('.zstd') ? zlib.zstdCompressSync(Buffer.from(fixed, 'utf8')) : Buffer.from(fixed, 'utf8')
      fs.writeFileSync(f, out)
      console.log(`         ✅ 已修复（备份: ${path.basename(bak)}）`)
    }
  }
  console.log(`\n结果: ${poisoned} 个毒会话 / ${unreadable} 个无法读取 / ${files.length} 总计`)
  if (poisoned > 0 && !FIX) {
    console.log('\n两种修法：')
    console.log('  A. 保守（推荐）: 把上面列出的 session-xxx 目录整个挪到 sessions 目录之外，重启 DSH 即可恢复其余会话')
    console.log('  B. 精细: 运行  node dsh-session-doctor.js --fix  摘掉退役字段（自动留 .bak 备份）')
  }
})()
