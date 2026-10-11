param(
  [string]$Project,
  [ValidateSet("Local", "Global")][string]$InstallScope,
  [ValidateSet("en", "ru")][string]$Language,
  [switch]$Uninstall
)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExplicitLanguage = $PSBoundParameters.ContainsKey("Language")
if (-not $Language) {
  if (-not $InstallScope -and -not $Project) {
    Write-Host "Language / Язык:`n1) English`n2) Русский"
    $Language = if ((Read-Host "Choice [1]") -eq "2") { "ru" } else { "en" }
  } else { $Language = "en" }
}
if (-not $InstallScope) {
  if ($Project) { $InstallScope = "Local" }
  else {
    Write-Host $(if ($Uninstall) { if ($Language -eq "ru") { "Откуда удалить TeamLead?" } else { "Where should TeamLead be uninstalled?" } } else { if ($Language -eq "ru") { "Куда установить TeamLead?" } else { "Where should TeamLead be installed?" } })
    Write-Host $(if ($Language -eq "ru") { "1) Локально в проекте`n2) Глобально для пользователя" } else { "1) Locally in a project`n2) Globally for this user" })
    $Choice = Read-Host $(if ($Language -eq "ru") { "Выбор [1]" } else { "Choice [1]" })
    if ($Choice -notin @("", "1", "2")) { throw "Invalid scope selection" }
    $InstallScope = if ($Choice -eq "2") { "Global" } else { "Local" }
  }
}
if ($InstallScope -eq "Local") {
  if (-not $Project) {
    $Project = Read-Host $(if ($Language -eq "ru") { "Путь к проекту [$((Get-Location).Path)]" } else { "Project directory [$((Get-Location).Path)]" })
    if (-not $Project) { $Project = (Get-Location).Path }
  }
  if (-not (Test-Path -LiteralPath $Project -PathType Container)) { throw "Project directory does not exist: $Project" }
  $Dst = Join-Path $Project ".opencode"
} else {
  $Dst = if ($env:OPENCODE_CONFIG_DIR) { $env:OPENCODE_CONFIG_DIR } elseif ($env:XDG_CONFIG_HOME) { Join-Path $env:XDG_CONFIG_HOME "opencode" } else { Join-Path $HOME ".config/opencode" }
}
$Mode = if ($Uninstall) { "uninstall" } else { "install" }
& node --experimental-strip-types (Join-Path $Root "scripts/install-lifecycle.mjs") $Mode $Dst $InstallScope.ToLowerInvariant() $Language $ExplicitLanguage.ToString().ToLowerInvariant()
if ($LASTEXITCODE -ne 0) { throw "TeamLead $Mode failed" }
