# TL.BATTERY.4Q.1 - the full Playwright battery in four sequential quarters.
#
# Run it OUTSIDE Claude Code, with Chrome closed, detached so the harness OOM
# watchdog cannot reach it (one line, from PowerShell):
#
#   Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File scripts\battery.ps1' -WorkingDirectory 'C:\dev\titilinks' -WindowStyle Hidden
#
# Why quarters: tests/auth.setup.ts mints a Supabase JWT that lives 60 minutes,
# and a whole project half ran 66 min on a slow machine (battery-2026-09-27),
# landing every late spec on the "Welcome Back" login page. Each quarter is its
# own `playwright test` invocation, so each runs `setup` again and starts with
# a fresh token.
#
#   desktop-A, desktop-B, mobile-A, mobile-B
#   A = tests/0[0-9]-* .. 3[0-9]-*.spec.ts    B = tests/4[0-9]-* onward
#
# Each quarter writes battery-<date>-<project>-<half>.log in the repo root and
# its failure artifacts to tests/results/<project>-<half> (a single outputDir
# would be wiped by the next quarter). The final count lines are printed and
# also written to battery-<date>-summary.log, because a hidden window prints
# to no one.
#
# Reuses the dev server on 8085 - start it first; this script never starts one.
# One quarter only (e.g. to prove the split): -Quarters mobile-A

param(
  [ValidateSet('desktop-A', 'desktop-B', 'mobile-A', 'mobile-B')]
  [string[]]$Quarters = @('desktop-A', 'desktop-B', 'mobile-A', 'mobile-B')
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$date = Get-Date -Format 'yyyy-MM-dd'
$specs = Get-ChildItem -Path 'tests' -Filter '*.spec.ts' | Sort-Object Name
$halves = @{
  'A' = @($specs | Where-Object { $_.Name -match '^[0-3][0-9]-' } | ForEach-Object { "tests/$($_.Name)" })
  'B' = @($specs | Where-Object { $_.Name -match '^[4-9][0-9]-' } | ForEach-Object { "tests/$($_.Name)" })
}

$summary = @()
foreach ($q in $Quarters) {
  $project, $half = $q.Split('-')
  $files = $halves[$half]
  $log = "battery-$date-$project-$half.log"
  Write-Host "[$q] $($files.Count) spec files -> $log"
  # cmd.exe does the redirect: PowerShell 5.1's > would re-encode the log as UTF-16.
  $cmd = "npx playwright test --project=$project --workers=1 --reporter=list --output=tests/results/$q $($files -join ' ') > $log 2>&1"
  & cmd.exe /c $cmd
  $counts = Get-Content -Path $log -Encoding UTF8 |
    ForEach-Object { $_ -replace "$([char]27)\[[0-9;]*m", '' } |
    Where-Object { $_ -match '^\s+\d+ (passed|failed|flaky|skipped|did not run)' } |
    ForEach-Object { "[$q] $($_.Trim())" }
  if (-not $counts) { $counts = @("[$q] no summary line - see $log") }
  $summary += $counts
}

Write-Host ''
$summary | ForEach-Object { Write-Host $_ }
$summary | Set-Content -Path "battery-$date-summary.log" -Encoding UTF8
