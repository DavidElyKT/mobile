Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "Running EAS preflight in: $projectRoot"

if ($projectRoot -match 'OneDrive') {
  Write-Host "OneDrive path detected. Clearing read-only attributes before upload."
}

Push-Location $projectRoot
try {
  # Clear root directory read-only flag, then clear recursively for project files.
  attrib -R .
  attrib -R * /S /D

  $remainingReadOnly = @(Get-ChildItem -Recurse -Force | Where-Object {
    ($_.Attributes -band [IO.FileAttributes]::ReadOnly) -and
    -not ($_.Attributes -band [IO.FileAttributes]::Hidden)
  })

  if ($remainingReadOnly.Count -gt 0) {
    Write-Host "Preflight failed: non-hidden read-only items still exist."
    $remainingReadOnly | Select-Object -First 20 -ExpandProperty FullName | ForEach-Object { Write-Host " - $_" }
    exit 1
  }

  Write-Host "Preflight passed: no non-hidden read-only items detected."
}
finally {
  Pop-Location
}
