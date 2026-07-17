$ErrorActionPreference = "SilentlyContinue"

$root = "C:\Users\DELL\Documents\Default Project"
$cacheDir = Join-Path $root ".cache"
$dataFile = Join-Path $root "data.csv"
$baseUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRsdWvigWU2h6_sdXOrNN4ndvKO5qAu1QBDGa3jt1ID2YE3gmJdEueosz146DdH99qv0zmrKcQr-gWP"

Write-Host "=== Stock Rent WKT Server ==="
Write-Host ""

if (-not (Test-Path $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir | Out-Null }

Write-Host "[1/3] Discovering sheets..."
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
} catch {
    Write-Host "  ERROR: $_"
    $sheets = @()
}

Write-Host "[2/3] Fetching and merging..."
$allRows = @()
$ok = 0; $fail = 0
$total = $sheets.Count

foreach ($sheet in $sheets) {
    $cached = Join-Path $cacheDir "$($sheet.Gid).csv"
    $csv = $null
    if (Test-Path $cached) {
        $csv = [System.IO.File]::ReadAllText($cached, [System.Text.Encoding]::UTF8)
    } else {
        try {
            $r = Invoke-WebRequest -Uri "$baseUrl/pub?output=csv&gid=$($sheet.Gid)" -UseBasicParsing -TimeoutSec 15
            $csv = $r.Content
            [System.IO.File]::WriteAllText($cached, $csv, (New-Object System.Text.UTF8Encoding $false))
        } catch { $fail++; continue }
    }

    if (-not $csv -or $csv.Length -lt 10) { $fail++; continue }

    $lines = $csv -replace "`r`n", "`n" -split "`n"
    if ($lines.Count -lt 2) { $fail++; continue }

    $hdrLine = $lines[0]
    $hdrs = @(); $cur = ""; $inQ = $false
    for ($c = 0; $c -lt $hdrLine.Length; $c++) {
        $ch = $hdrLine[$c]
        if ($inQ) { if ($ch -eq '"') { $inQ = $false } else { $cur += $ch } }
        else { if ($ch -eq '"') { $inQ = $true } elseif ($ch -eq ',') { $hdrs += $cur; $cur = "" } else { $cur += $ch } }
    }
    $hdrs += $cur

    $snIdx = -1; $specIdx = -1; $defectIdx = -1; $modelIdx = -1
    for ($h = 0; $h -lt $hdrs.Count; $h++) {
        $ht = $hdrs[$h].Trim()
        if ($ht -eq "S/N") { $snIdx = $h }
        elseif ($ht -eq "Spec") { $specIdx = $h }
        elseif ($ht -eq "ตำหนิ") { $defectIdx = $h }
        elseif ($ht -eq "อ้างอิง") { $modelIdx = $h }
    }
    if ($snIdx -lt 0) { $fail++; continue }

    for ($li = 1; $li -lt $lines.Count; $li++) {
        $l = $lines[$li]
        if ([string]::IsNullOrWhiteSpace($l)) { continue }

        $vals = @(); $cur = ""; $inQ = $false
        for ($c = 0; $c -lt $l.Length; $c++) {
            $ch = $l[$c]
            if ($inQ) { if ($ch -eq '"') { if ($c + 1 -lt $l.Length -and $l[$c + 1] -eq '"') { $cur += '"'; $c++ } else { $inQ = $false } } else { $cur += $ch } }
            else { if ($ch -eq '"') { $inQ = $true } elseif ($ch -eq ',') { $vals += $cur; $cur = "" } else { $cur += $ch } }
        }
        $vals += $cur

        if ($vals.Count -lt 3) { continue }
        $sn = if ($snIdx -lt $vals.Count) { $vals[$snIdx].Trim() } else { "" }
        if ([string]::IsNullOrWhiteSpace($sn)) { continue }

        $spec = if ($specIdx -ge 0 -and $specIdx -lt $vals.Count) { $vals[$specIdx].Trim() } else { "" }
        $defect = if ($defectIdx -ge 0 -and $defectIdx -lt $vals.Count) { $vals[$defectIdx].Trim() } else { "" }
        $model = if ($modelIdx -ge 0 -and $modelIdx -lt $vals.Count) { $vals[$modelIdx].Trim() } else { $sheet.Name }
        if ([string]::IsNullOrWhiteSpace($model)) { $model = $sheet.Name }

        $sp = $spec -split ","
        $cpu = if ($sp.Count -gt 0) { $sp[0].Trim() } else { "" }
        $ram = if ($sp.Count -gt 1) { $sp[1].Trim() } else { "" }
        $storage = if ($sp.Count -gt 2) { $sp[2].Trim() } else { "" }

        $e = { param($s) ($s -replace '"', '""') }
        $allRows += "`"$($e.Invoke($model))`",`"$($e.Invoke($sn))`",`"$($e.Invoke($cpu))`",`"$($e.Invoke($ram))`",`"$($e.Invoke($storage))`",`"$($e.Invoke($defect))`""
    }
    $ok++

    $done = $ok + $fail
    if ($done % 20 -eq 0) { Write-Host "  [$done/$total] rows: $($allRows.Count)" }
}
Write-Host "  [$total/$total] rows: $($allRows.Count)"

Write-Host "[3/3] Saving data.csv..."
$header = "Model,S/N,CPU,Ram,Storage,Defect"
$content = $header + "`n" + ($allRows -join "`n")
[System.IO.File]::WriteAllText($dataFile, $content, (New-Object System.Text.UTF8Encoding $false))
Write-Host "  Saved: $($allRows.Count) rows to data.csv"
Write-Host ""

Write-Host "[3/3] Building index.html..."
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "build.ps1")

Write-Host ""
Write-Host "Starting web server..."
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
            $file = Join-Path $root $path.TrimStart("/")
            if (Test-Path $file) {
                $bytes = [System.IO.File]::ReadAllBytes($file)
                $ext = [System.IO.Path]::GetExtension($file).ToLower()
                $types = @{
                    ".html" = "text/html; charset=utf-8"
                    ".css"  = "text/css; charset=utf-8"
                    ".js"   = "application/javascript; charset=utf-8"
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
                } else {
                    $context.Response.AddHeader("Cache-Control", "public, max-age=60")
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
