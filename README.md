# DSH 保命三件套

> 给所有被"升级丢会话"吓过的 DeepSeek Harness 用户。
> 三件东西：**查毒、打快照、留遗书**。全部纯本地、零依赖、即下即用。

## ① dsh-session-doctor.js —— 会话体检/解毒（v2 三合一诊断）

升级后"会话消失"有两个已实锤的机制，症状一样病根不同（详见 [Discussion #10415](https://github.com/deepseek-ai/deepseek-harness/discussions/10415)）：

1. **会话头拒绝**：`list()` 遇到单个会话头问题就整体抛错 → **所有**工作区都空。触发源：
   - 退役字段 `sandboxMode`/`approvalPolicy`（仅 2026-07-26~28 两天窗口内的 nightly/自编译构建写过，**正式版从未写过**）
   - 重复 session id（同一会话目录出现在多个工作区桶下：移动工作区没删旧目录/备份回灌/多机同步）
2. **工作区路径过滤**：注册表路径与 `realpath(会话头 cwd)` 严格相等才显示——**改名/移动/掉盘/大小写差异**都会让单个工作区静默变空，不需要任何坏文件。这是大规模"升级后会话消失"最可能的元凶。

本脚本一次跑完三项鉴别（全部只读，`--fix` 除外）：

```bash
node dsh-session-doctor.js            # ①退役字段 ②重复id ③路径过滤，三项诊断
node dsh-session-doctor.js --fix      # 摘退役字段（自动 .bak）
node dsh-session-doctor.js "D:\path"  # 指定 sessions 根目录
```

**鉴别口诀**：全部工作区空 → 看①②；只有个别工作区空 → 看③（重建原路径目录即可复活）。

DSH 自带 Node 路径：`C:\Users\<你>\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`

## ② Backup-DshSessions.ps1 —— 自动快照 watchdog

每次运行给 `~/.dsh\sessions` + `storages` 打一份快照（默认存 `D:\dsh-backups`，可改脚本里的 `$BackupRoot`）；检测到更新器下载了新安装包时，额外留一份"升级前快照"。

挂计划任务每 4 小时一次（管理员不需要，当前用户即可）：

```powershell
schtasks /Create /TN "DSH-Sessions-Backup" /F /SC HOURLY /MO 4 `
  /TR "pwsh -NoProfile -WindowStyle Hidden -File \"C:\path\to\Backup-DshSessions.ps1\""
```

## ③ handoff-letter —— 交接信技能（免费跨会话记忆）

把 `handoff-letter` 文件夹整个放进 `C:\Users\<你>\.agents\skills\`，DSH 下次启动自动识别。之后你的大肥鱼会：

- 上下文快没了 / 升级前 / 你说"写交接信"时 → 把进度、结论、坑写成工作区里的 `HANDOFF.md`
- 新会话开工 → 先读信再干活，开头汇报"接力点"
- 顺手把耐久事实维护进 `AGENTS.md` 的"记忆区"（见下）

## 附：不装技能也能用的记忆法（引子模型）

技能只是教 agent 一套约定，你手写也行。核心原则：**每个文件各司其职，AGENTS.md 只做"引子"**——它每轮都被注入，保持精简，内容文件由 agent 按指针自己去读：

| 文件 | 角色 |
|---|---|
| `AGENTS.md` | 引子：规则 + 指针（每轮自动注入，务必精简） |
| `MEMORY.md` | 长期记忆：一行一条事实，只增不删 |
| `HANDOFF.md` | 交接信：上一代留给下一代的接力点 |
| `SOUL.md` | 人格设定（养崽/角色时用） |

在工作区 `AGENTS.md` 里放这段引子，agent 就会乖乖照做：

```markdown
## 会话启动（agent 必读）
1. 存在 SOUL.md → 先完整阅读，它是你的人格
2. 存在 HANDOFF.md → 先读，那是上一代的接力点；完成后归档为 HANDOFF.gen-N.done.md
3. 记忆在 MEMORY.md，需要背景时自己去读

## 记忆维护（agent 自我执行）
- 重要事件/结论/用户偏好出现后，往 MEMORY.md 追加一行：[YYYY-MM-DD] 事实
- MEMORY.md 只增不删；超过 100 行时把最旧的 50 行压缩成一段摘要
```

**养崽/养人格**：`SOUL.md` + `MEMORY.md` 配上上面的引子，人格就住在文件里而不是会话里，升级、丢会话都不怕，真正的美少女万华镜（不是

---

*背景与原理（0.2.1 丢会话 root cause、为什么文件从来不丢）：见 GitHub Discussion
[deepseek-ai/deepseek-harness#10415](https://github.com/deepseek-ai/deepseek-harness/discussions/10415)。*
