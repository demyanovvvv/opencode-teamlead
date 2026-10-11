param(
  [string]$Project,
  [ValidateSet("Local", "Global")][string]$InstallScope,
  [ValidateSet("en", "ru")][string]$Language
)
$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "install.ps1") @PSBoundParameters -Uninstall
