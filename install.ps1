param(
  [Parameter(Mandatory=$false)]
  [string]$Project = (Get-Location).Path,
  [ValidateSet("Local", "Global")]
  [string]$InstallScope,
  [ValidateSet("en", "ru")]
  [string]$Language
)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Src = Join-Path $Root "payload/.opencode"
if (-not $Language) {
  if (-not $InstallScope -and -not $PSBoundParameters.ContainsKey("Project") -and [Environment]::UserInteractive) {
    Write-Host "Language / Язык:"
    Write-Host "1) English"
    Write-Host "2) Русский"
    $Language = if ((Read-Host "Choice [1]") -eq "2") { "ru" } else { "en" }
  } else { $Language = "en" }
}
if (-not $InstallScope) {
  if ($PSBoundParameters.ContainsKey("Project")) { $InstallScope = "Local" }
  elseif ([Environment]::UserInteractive) {
    Write-Host $(if ($Language -eq "ru") { "Куда установить TeamLead?" } else { "Where should TeamLead be installed?" })
    Write-Host $(if ($Language -eq "ru") { "1) Локально в проект" } else { "1) Locally in this project" })
    Write-Host $(if ($Language -eq "ru") { "2) Глобально для пользователя" } else { "2) Globally for this user" })
    $choice = Read-Host $(if ($Language -eq "ru") { "Выбор [1]" } else { "Choice [1]" })
    $InstallScope = if ($choice -eq "2") { "Global" } else { "Local" }
  } else { throw "Укажите -InstallScope Local или Global" }
}
$Dst = if ($InstallScope -eq "Global") {
  if ($env:OPENCODE_CONFIG_DIR) { $env:OPENCODE_CONFIG_DIR }
  elseif ($env:XDG_CONFIG_HOME) { Join-Path $env:XDG_CONFIG_HOME "opencode" }
  else { Join-Path $HOME ".config/opencode" }
} else { Join-Path $Project ".opencode" }

if ($InstallScope -eq "Local" -and -not (Test-Path $Project -PathType Container)) { throw "Project directory does not exist: $Project" }
New-Item -ItemType Directory -Force -Path $Dst, (Join-Path $Dst "plugins"), (Join-Path $Dst "teamlead"), (Join-Path $Dst "agents"), (Join-Path $Dst "commands") | Out-Null

# Remove only command files owned by pre-v2 TeamLead releases. Do not touch unrelated user commands.
$LegacyCommands = @(
  "lead-review.md", "lead-dashboard.md", "lead-worker.md", "lead-dashboard-clear.md",
  "lead-profiler.md", "lead-router.md", "lead-adaptive.md", "lead-runtime.md",
  "lead-intelligence.md", "lead-execution.md", "lead-contracts.md", "lead-verify.md",
  "tl-dashboard.md", "tl-worker.md", "tl-dashboard-clear.md", "tl-settings.md", "tl-models.md",
  "tl-profiler.md", "tl-router.md", "tl-adaptive.md", "tl-runtime.md", "tl-intelligence.md",
  "tl-execution.md", "tl-contracts.md", "tl-verify.md"
)
foreach ($File in $LegacyCommands) {
  $LegacyCommand = Join-Path (Join-Path $Dst "commands") $File
  if (Test-Path $LegacyCommand) { Remove-Item -Force $LegacyCommand }
}

$Legacy = Join-Path $Dst "plugins/teamlead"
if (Test-Path $Legacy) { Remove-Item -Recurse -Force $Legacy }
Copy-Item -Force (Join-Path $Src "plugins/teamlead.ts") (Join-Path $Dst "plugins/teamlead.ts")
$TeamleadDir = Join-Path $Dst "teamlead"
if (Test-Path $TeamleadDir) { Remove-Item -Recurse -Force $TeamleadDir }
Copy-Item -Recurse -Force (Join-Path $Src "teamlead") $TeamleadDir
if ($Language -eq "ru") { Set-Content -Path (Join-Path $TeamleadDir "language.json") -Value "{`n  `"language`": `"ru`"`n}`n" -Encoding UTF8 }
Copy-Item -Force (Join-Path $Src "agents/teamlead-*.md") (Join-Path $Dst "agents")
Copy-Item -Force (Join-Path $Src "commands/lead*.md") (Join-Path $Dst "commands")

$Config = Join-Path $Dst "teamlead.json"
if ($InstallScope -eq "Local" -and -not (Test-Path $Config)) {
  Copy-Item -Force (Join-Path $Src "teamlead.json") $Config
  if ($Language -eq "ru") {
    $settings = Get-Content $Config -Raw | ConvertFrom-Json
    $settings.language = "ru"
    $settings | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $Config
  }
  Write-Host "Created .opencode/teamlead.json"
} else {
  Write-Host "Preserved existing .opencode/teamlead.json (v2 migrates compatible v1 settings at runtime)."
}

& node (Join-Path $Root "scripts/merge-tui.mjs") $Dst
if ($LASTEXITCODE -ne 0) { throw "Could not register TeamLead in tui.json/jsonc" }

$Package = Join-Path $Dst "package.json"
if (Test-Path $Package) {
  try { $json = Get-Content $Package -Raw | ConvertFrom-Json } catch { $json = New-Object PSObject }
  if (-not ($json.PSObject.Properties.Name -contains "private")) { $json | Add-Member -NotePropertyName private -NotePropertyValue $true }
  if (-not ($json.PSObject.Properties.Name -contains "dependencies") -or $null -eq $json.dependencies) {
    if ($json.PSObject.Properties.Name -contains "dependencies") { $json.dependencies = New-Object PSObject }
    else { $json | Add-Member -NotePropertyName dependencies -NotePropertyValue (New-Object PSObject) }
  }
  if ($json.dependencies.PSObject.Properties.Name -contains "@opencode-ai/plugin") {
    $json.dependencies."@opencode-ai/plugin" = ">=1.18.30 <2.0.0"
  } else {
    $json.dependencies | Add-Member -NotePropertyName "@opencode-ai/plugin" -NotePropertyValue ">=1.18.30 <2.0.0"
  }
  $json | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $Package
} else {
  Copy-Item -Force (Join-Path $Src "package.json") $Package
}

Write-Host "Installed OpenCode TeamLead v2.1.1 ($InstallScope) into: $Dst"
Write-Host "Restart OpenCode, then run: /lead-doctor"
