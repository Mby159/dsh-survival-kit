# Backup-DshSessions.ps1
# DSH 会话快照 watchdog：每次运行给 ~/.dsh/sessions 和 ~/.dsh/storages 打一份快照。
# 检测到桌面更新器 pending 目录出现新安装包时，会额外打一份“升级前”快照。
#
# 用法：pwsh -NoProfile -File Backup-DshSessions.ps1
# 建议配合计划任务每 4 小时运行一次（注册命令见文件底部注释）。

$ErrorActionPreference = 'Stop'

$DshHome    = Join-Path $env:USERPROFILE '.dsh'
$BackupRoot = 'D:\dsh-backups'
$Keep       = 60          # 保留最近 60 份常规快照（每 4 小时一份 ≈ 10 天）
$KeepPre    = 10          # 保留最近 10 份升级前快照
$StateFile  = Join-Path $BackupRoot '.watchdog-state.json'
$PendingDir = Join-Path $env:LOCALAPPDATA '@deepseek-aidsh-desktop-updater\pending'

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dest      = Join-Path $BackupRoot "snap-$timestamp"
$latest    = Join-Path $BackupRoot 'latest'

# --- 检测更新器是否有新待装包 ---
$pendingStamp = $null
if (Test-Path $PendingDir) {
  $newest = Get-ChildItem -Recurse -File $PendingDir -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($newest) { $pendingStamp = $newest.LastWriteTime.ToString('o') }
}
$state = if (Test-Path $StateFile) { try { Get-Content $StateFile -Raw | ConvertFrom-Json } catch { $null } } else { $null }
$pendingChanged = $pendingStamp -and (-not $state -or $state.pendingStamp -ne $pendingStamp)

# --- 打快照（robocopy 逐子目录镜像，只复制变化文件） ---
$sources = @(
  @{ Src = Join-Path $DshHome 'sessions'; Dst = Join-Path $dest 'sessions' },
  @{ Src = Join-Path $DshHome 'storages'; Dst = Join-Path $dest 'storages' }
)
foreach ($s in $sources) {
  if (-not (Test-Path $s.Src)) { continue }
  New-Item -ItemType Directory -Force -Path $s.Dst | Out-Null
  robocopy $s.Src $s.Dst /MIR /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
}

# --- 维护 latest 稳定路径（方便一键恢复） ---
New-Item -ItemType Directory -Force -Path $latest | Out-Null
robocopy $dest $latest /MIR /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null

# --- 更新器 pending 变化 → 额外留一份升级前快照（永不自动清理进 latest） ---
if ($pendingChanged) {
  $pre = Join-Path $BackupRoot "pre-update-$timestamp"
  New-Item -ItemType Directory -Force -Path $pre | Out-Null
  robocopy $dest $pre /MIR /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
  Write-Host "[watchdog] 检测到更新器 pending 变化，已保存升级前快照: $pre"
}
@{ pendingStamp = $pendingStamp; lastRun = (Get-Date).ToString('o') } |
  ConvertTo-Json | Set-Content -Encoding UTF8 $StateFile

# --- 修剪旧快照 ---
$snaps = Get-ChildItem -Directory $BackupRoot -Filter 'snap-*' -ErrorAction SilentlyContinue |
         Sort-Object Name -Descending
$snaps | Select-Object -Skip $Keep | ForEach-Object {
  Remove-Item -Recurse -Force $_.FullName -ErrorAction SilentlyContinue
}
$preSnaps = Get-ChildItem -Directory $BackupRoot -Filter 'pre-update-*' -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending
$preSnaps | Select-Object -Skip $KeepPre | ForEach-Object {
  Remove-Item -Recurse -Force $_.FullName -ErrorAction SilentlyContinue
}

$snapCount = @($snaps).Count
Write-Host "[watchdog] 快照完成: $dest（当前 $snapCount 份常规 / $(@($preSnaps).Count) 份升级前）"

<#
注册计划任务（每 4 小时一次，当前用户，无需管理员）：

schtasks /Create /TN "DSH-Sessions-Backup" /F /SC HOURLY /MO 4 `
  /TR "pwsh -NoProfile -WindowStyle Hidden -File \"D:\dsh-workspace\dsh-version\Backup-DshSessions.ps1\""
#>
