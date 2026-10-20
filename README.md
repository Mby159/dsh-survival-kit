# DSH 保命三件套

> 给所有被"升级丢会话"吓过的 DeepSeek Harness 用户。
> 三件东西：**查毒、打快照、留遗书**。全部纯本地、零依赖、即下即用。

## ① dsh-session-doctor.js —— 会话体检/解毒

0.2.1 起，会话头里带退役字段（`sandboxMode`/`approvalPolicy`）的老会话会让整个会话列表崩掉（"老会话全不见了"，但文件都在）。这个脚本扫描并修复：

```bash
# 用 DSH 自带 Node（或任意 Node ≥ 22.15）：
node dsh-session-doctor.js            # 只扫描，列出"毒会话"
node dsh-session-doctor.js --fix      # 摘掉退役字段（自动留 .bak 备份）
```

DSH 自带 Node 路径：`C:\Users\<你>\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`

保守派用法：按扫描结果把毒会话目录挪出 `~/.dsh\sessions\`，重启 DSH，其余会话立即复活。

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
