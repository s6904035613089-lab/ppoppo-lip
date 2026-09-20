# build-pdf.ps1 - render docs/summary.html to docs/ppoppo-pos-summary.pdf using Edge/Chrome headless
# Usage: powershell -ExecutionPolicy Bypass -File docs\build-pdf.ps1 [-Name summary] [-Out ppoppo-pos-summary]
param([string]$Name = "summary", [string]$Out = "ppoppo-pos-summary")
$here = $PSScriptRoot
$html = Join-Path $here ($Name + ".html")
$pdf  = Join-Path $here ($Out + ".pdf")
$browser = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { Write-Error 'Edge/Chrome not found'; exit 1 }
if (Test-Path $pdf) { Remove-Item $pdf -Force }
$uri = ([Uri]$html).AbsoluteUri
$profile = Join-Path $env:TEMP 'ppoppo-pdf-profile'
$args = @('--headless=new', '--disable-gpu', '--no-first-run', "--user-data-dir=$profile",
          '--run-all-compositor-stages-before-draw', '--virtual-time-budget=8000',
          '--no-pdf-header-footer', "--print-to-pdf=$pdf", $uri)
Start-Process -FilePath $browser -ArgumentList $args -Wait -NoNewWindow
if (Test-Path $pdf) { Write-Host "OK -> $pdf ($([math]::Round((Get-Item $pdf).Length/1KB)) KB)" } else { Write-Error 'PDF was not created'; exit 1 }
