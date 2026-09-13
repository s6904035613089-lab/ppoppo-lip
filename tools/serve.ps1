# =============================================================
#  serve.ps1 - tiny static web server for local testing (no Python/Node needed)
#  Usage:  powershell -ExecutionPolicy Bypass -File tools\serve.ps1
#  Then open http://localhost:8080
#  (ASCII only on purpose: Windows PowerShell 5.1 reads scripts as ANSI)
# =============================================================
param([int]$Port = 8080)

$root = Split-Path -Parent $PSScriptRoot
$mime = @{
  '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='application/javascript; charset=utf-8'
  '.json'='application/json'; '.svg'='image/svg+xml'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'
  '.ico'='image/x-icon'; '.txt'='text/plain; charset=utf-8'; '.woff2'='font/woff2'; '.woff'='font/woff'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "ppoppo dev server -> http://localhost:$Port  (Ctrl+C to stop)"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($path -eq '/') { $path = '/index.html' }
    $file = Join-Path $root ($path -replace '/', '\')
    # Vercel-style clean URLs: /pos -> pos.html
    $htmlFile = $file + '.html'
    if (-not (Test-Path -LiteralPath $file -PathType Leaf) -and (Test-Path -LiteralPath $htmlFile -PathType Leaf)) { $file = $htmlFile }

    if (Test-Path -LiteralPath $file -PathType Leaf) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLower()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] } else { $ctx.Response.ContentType = 'application/octet-stream' }
      $ctx.Response.StatusCode = 200
    } else {
      $bytes = [IO.File]::ReadAllBytes((Join-Path $root '404.html'))
      $ctx.Response.ContentType = 'text/html; charset=utf-8'
      $ctx.Response.StatusCode = 404
    }
    try {
      $ctx.Response.Headers['Cache-Control'] = 'no-store'
      $ctx.Response.ContentLength64 = $bytes.Length
      if ($ctx.Request.HttpMethod -ne 'HEAD') { $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length) }
    } catch { }
    try { $ctx.Response.Close() } catch { }
  }
} finally { $listener.Stop() }
