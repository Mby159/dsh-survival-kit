// dsh-session-doctor.js v2 — DSH 会话"丢列表"三合一诊断
//
// 背景：升级 DSH 后"会话全消失"目前有两个已实锤的机制，症状一样、病根不同：
//   1. 会话头拒绝：list() 遇到单个会话头问题（退役字段/重复id/版本不符）整体抛错 → 所有工作区都空
//      - 退役字段 sandboxMode/approvalPolicy：仅 2026-07-26~28 两天窗口内的 nightly/自编译构建写过，
//        正式版从未写过（见 deepseek-harness Discussion #10415 的考据）
//      - 重复 session id：同一会话目录出现在多个工作区桶下（移动工作区后旧目录没删/备份回灌/多机同步）
//   2. 工作区路径过滤：注册表记录的路径与 realpath(会话头 cwd) 严格相等才不过滤——
//      改名/移动/掉盘/大小写差异都会让会话静默消失（单个工作区空，其余正常）
//
// 本脚本全部只读（除非 --fix 摘退役字段），一次跑完三项鉴别：
//   node dsh-session-doctor.js            # 三项诊断
//   node dsh-session-doctor.js --fix      # 仅摘退役字段（自动 .bak）
//   node dsh-session-doctor.js "D:\path"  # 指定 sessions 根目录
//
// 需要 Node ≥ 22.15（内置 zstd）；DSH 自带 Node 24 直接可用：
//   %USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { Readable } = require('stream')

const RETIRED = ['sandboxMode', 'approvalPolicy']
const args = process.argv.slice(2)
const FIX = args.includes('--fix')
const dirArg = args.find(a => !a.startsWith('--'))
const HOME = process.env.USERPROFILE || process.env.HOME
const ROOT = dirArg || path.join(HOME, '.dsh', 'sessions')
const WS_JSON = path.join(HOME, '.dsh', 'storages', 'workspace.json')

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
function realpathOrNull(p) {
  try { return fs.realpathSync.native(p) } catch { return null }
}

;(async () => {
  const files = fs.existsSync(ROOT) ? collect(ROOT) : []
  console.log(`DSH 会话诊断 @ ${ROOT}（${files.length} 个会话文件）\n`)

  // ===== ① 会话头扫描（退役字段 + 收集 cwd 供 ③ 用） =====
  let poisoned = 0, unreadable = 0
  const sessions = [] // {rel, sessionDir, cwd, createdAt}
  for (const f of files) {
    const rel = path.relative(ROOT, f)
    let text
    try { text = await decompress(f) } catch (e) { unreadable++; console.log(`  [无法读取] ${rel} :: ${e.message.slice(0, 60)}`); continue }
    const nl = text.indexOf('\n')
    let header
    try { header = JSON.parse(nl === -1 ? text : text.slice(0, nl)) } catch { unreadable++; console.log(`  [头部损坏] ${rel}`); continue }
    sessions.push({ rel, sessionDir: path.basename(path.dirname(f)), cwd: header.cwd || null, createdAt: header.createdAt || 0 })
    const bad = RETIRED.filter(k => Object.hasOwn(header, k))
    if (!bad.length) continue
    poisoned++
    console.log(`  [毒头] ${rel}\n         字段: ${bad.join(', ')} | cwd: ${header.cwd || '(无)'}`)
    if (FIX) {
      const rest = nl === -1 ? '' : text.slice(nl)
      for (const k of bad) delete header[k]
      const bak = f + '.bak'
      if (!fs.existsSync(bak)) fs.copyFileSync(f, bak)
      const fixed = JSON.stringify(header) + rest
      fs.writeFileSync(f, f.endsWith('.zstd') ? zlib.zstdCompressSync(Buffer.from(fixed, 'utf8')) : Buffer.from(fixed, 'utf8'))
      console.log(`         ✅ 已修复（备份 .bak）`)
    }
  }
  console.log(`① 退役字段毒头: ${poisoned} 个（另有 ${unreadable} 个文件无法读取）${poisoned && !FIX ? ' —— 加 --fix 可摘字段' : ''}\n`)

  // ===== ② 重复 session id（同 id 出现在多个桶） =====
  const byDir = new Map()
  for (const s of sessions) {
    if (!/^session-[0-9a-f-]{36}$/i.test(s.sessionDir)) continue
    const arr = byDir.get(s.sessionDir) || []
    arr.push(path.dirname(s.rel))
    byDir.set(s.sessionDir, arr)
  }
  const dups = [...byDir.entries()].filter(([, v]) => new Set(v).size > 1)
  if (dups.length) {
    console.log(`② 重复 session id: ${dups.length} 组（会让 list() 整体崩）`)
    for (const [id, dirs] of dups) console.log(`  [重复] ${id}\n         出现在: ${[...new Set(dirs)].join('  +  ')}`)
  } else console.log('② 重复 session id: 0 组')
  console.log()

  // ===== ③ 工作区路径过滤诊断 =====
  console.log('③ 工作区路径过滤诊断:')
  if (!fs.existsSync(WS_JSON)) {
    console.log(`  (跳过：找不到 ${WS_JSON})`)
  } else {
    const ws = JSON.parse(fs.readFileSync(WS_JSON, 'utf8'))
    // tables.workspaces 是 id→记录 的对象映射（不是数组）
    const table = (ws.tables && ws.tables.workspaces) || {}
    const records = Object.entries(table).map(([id, r]) => ({ id, ...r, real: realpathOrNull(r.path) }))
    let recBad = 0, sessFiltered = 0, sessCase = 0, sessOrphan = 0
    for (const r of records) {
      if (r.real) continue
      recBad++
      console.log(`  [记录失效] 工作区 "${r.title}" 的路径不存在: ${r.path}\n             → 其 ${r.sessionIds?.length ?? 0} 个会话在 GUI 里全部不显示（改名/移动/掉盘？）`)
    }
    // 按会话目录去重（一个会话有多个 generation 文件，cwd 相同）
    const uniqSessions = [...new Map(sessions.map(s => [s.sessionDir, s])).values()]
    for (const s of uniqSessions) {
      if (!s.cwd) continue
      const cwReal = realpathOrNull(s.cwd)
      if (!cwReal) {
        sessFiltered++
        console.log(`  [会话被过滤] ${s.sessionDir}\n             cwd 无法解析: ${s.cwd}（目录改名/移动/离线 → 改回原名或重建即可复活）`)
        continue
      }
      if (records.some(r => r.real === cwReal)) continue
      if (records.some(r => r.real && r.real.toLowerCase() === cwReal.toLowerCase())) {
        sessCase++
        console.log(`  [大小写差异] ${s.sessionDir} :: ${s.cwd}\n             → Windows 下 realpath 大小写与注册表不一致，可能被过滤`)
        continue
      }
      sessOrphan++
      console.log(`  [无注册记录] ${s.sessionDir} :: ${s.cwd}\n             → 不属于任何已注册工作区（可能工作区被删过；重新在该路径建工作区可找回）`)
    }
    if (!recBad && !sessFiltered && !sessCase && !sessOrphan) console.log('  全部正常：所有注册路径与会话 cwd 严格匹配')
    else console.log(`  小结: ${recBad} 条记录失效 / ${sessFiltered} 个会话 cwd 失效 / ${sessCase} 个大小写差异 / ${sessOrphan} 个无注册记录`)
  }

  console.log('\n鉴别口诀：全部工作区空 → 看①②；只有个别工作区空 → 看③。')
})()
