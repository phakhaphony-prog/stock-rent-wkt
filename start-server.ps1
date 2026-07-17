$ErrorActionPreference = "SilentlyContinue"

$root = "C:\Users\DELL\Documents\Default Project"
$cacheDir = Join-Path $root ".cache"
$manifestFile = Join-Path $cacheDir "manifest.json"
$baseUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRsdWvigWU2h6_sdXOrNN4ndvKO5qAu1QBDGa3jt1ID2YE3gmJdEueosz146DdH99qv0zmrKcQr-gWP"

Write-Host "=== Stock Rent WKT Server ==="
Write-Host ""

if (-not (Test-Path $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir | Out-Null }

Write-Host "[1/2] Preloading data from Google Sheets..."
try {
    $resp = Invoke-WebRequest -Uri "$baseUrl/pubhtml" -UseBasicParsing -TimeoutSec 30
    $html = $resp.Content
    $regex = [regex]'items\.push\(\{name:\s*"([^"]+)"[^}]*gid:\s*"([^"]+)"'
    $matches = $regex.Matches($html)
    $sheets = @()
    foreach ($m in $matches) {
        $n = $m.Groups[1].Value; $g = $m.Groups[2].Value
        if ($n -ne "Total Product" -and $n -ne "All Stock") {
            $sheets += [PSCustomObject]@{ Name = $n; Gid = $g }
        }
    }
    Write-Host "  Found $($sheets.Count) sheets"

    $ok = 0; $fail = 0
    foreach ($sheet in $sheets) {
        $outFile = Join-Path $cacheDir "$($sheet.Gid).csv"
        try {
            $r = Invoke-WebRequest -Uri "$baseUrl/pub?output=csv&gid=$($sheet.Gid)" -UseBasicParsing -TimeoutSec 15
            [System.IO.File]::WriteAllText($outFile, $r.Content, (New-Object System.Text.UTF8Encoding $false))
            $ok++
        } catch { $fail++ }

        $total = $ok + $fail
        if ($total % 20 -eq 0) { Write-Host "  [$total/$($sheets.Count)] ok=$ok fail=$fail" }
    }
    Write-Host "  Done: $ok ok, $fail fail"
} catch {
    Write-Host "  Preload failed: $_"
}

Write-Host "[2/2] Starting server..."
Write-Host ""

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8080/")
$listener.Start()
Write-Host "Server running at http://localhost:8080/"
Write-Host "Press Ctrl+C to stop"
Write-Host ""

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        try {
            $path = $context.Request.Url.LocalPath
            if ($path -eq "/") { $path = "/index.html" }

            if ($path -eq "/sheets.json") {
                $files = Get-ChildItem -Path $cacheDir -Filter "*.csv" -File
                $sheetList = @()
                foreach ($f in $files) {
                    $gid = $f.BaseName
                    $lines = Get-Content $f.FullName -TotalCount 1
                    $parts = $lines -split ","
                    $hasSN = $false
                    foreach ($p in $parts) { if ($p.Trim() -eq "S/N") { $hasSN = $true; break } }
                    if ($hasSN) { $sheetList += $gid }
                }
                $json = ConvertTo-Json -InputObject $sheetList -Compress
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                $context.Response.ContentType = "application/json; charset=utf-8"
                $context.Response.ContentLength64 = $bytes.Length
                $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
                continue
            }

            if ($path -match "^/sheet/(.+)$") {
                $gid = $matches[1]
                $csvFile = Join-Path $cacheDir "$gid.csv"
                if (Test-Path $csvFile) {
                    $bytes = [System.IO.File]::ReadAllBytes($csvFile)
                    $context.Response.ContentType = "text/csv; charset=utf-8"
                    $context.Response.AddHeader("Cache-Control", "public, max-age=60")
                    $context.Response.ContentLength64 = $bytes.Length
                    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
                } else {
                    $context.Response.StatusCode = 404
                }
                continue
            }

            $file = Join-Path $root $path.TrimStart("/")
            if (Test-Path $file) {
                $bytes = [System.IO.File]::ReadAllBytes($file)
                $ext = [System.IO.Path]::GetExtension($file).ToLower()
                $types = @{
                    ".html" = "text/html; charset=utf-8"
                    ".css"  = "text/css; charset=utf-8"
                    ".js"   = "application/javascript; charset=utf-8"
                    ".json" = "application/json; charset=utf-8"
                    ".csv"  = "text/csv; charset=utf-8"
                    ".png"  = "image/png"
                    ".jpg"  = "image/jpeg"
                    ".gif"  = "image/gif"
                    ".ico"  = "image/x-icon"
                }
                $ct = $types[$ext]
                if ($ct) { $context.Response.ContentType = $ct }
                if ($ext -eq ".html") {
                    $context.Response.AddHeader("Cache-Control", "no-cache, no-store, must-revalidate")
                    $context.Response.AddHeader("Pragma", "no-cache")
                    $context.Response.AddHeader("Expires", "0")
                } else {
                    $context.Response.AddHeader("Cache-Control", "public, max-age=300")
                }
                $context.Response.ContentLength64 = $bytes.Length
                $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $context.Response.StatusCode = 404
            }
        } catch {
            try { $context.Response.StatusCode = 500 } catch {}
        } finally {
            try { $context.Response.Close() } catch {}
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
