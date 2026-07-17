$ErrorActionPreference = "Continue"
$root = "C:\Users\DELL\Documents\Default Project"
$cacheDir = Join-Path $root ".cache"
$baseUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRsdWvigWU2h6_sdXOrNN4ndvKO5qAu1QBDGa3jt1ID2YE3gmJdEueosz146DdH99qv0zmrKcQr-gWP"

if (-not (Test-Path $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir | Out-Null }

Write-Host "=== Preload Stock Data ==="
$sw = [System.Diagnostics.Stopwatch]::StartNew()

Write-Host "[1/2] Discovering sheets..."
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

Write-Host "[2/2] Fetching..."
$ok = 0; $fail = 0
foreach ($sheet in $sheets) {
    $outFile = Join-Path $cacheDir "$($sheet.Gid).csv"
    try {
        $r = Invoke-WebRequest -Uri "$baseUrl/pub?output=csv&gid=$($sheet.Gid)" -UseBasicParsing -TimeoutSec 15
        [System.IO.File]::WriteAllText($outFile, $r.Content, (New-Object System.Text.UTF8Encoding $false))
        $ok++
    } catch { $fail++ }

    $total = $ok + $fail
    if ($total % 20 -eq 0) {
        Write-Host "  [$total/$($sheets.Count)] ok=$ok fail=$fail"
    }
}

$sw.Stop()
Write-Host "Done: $ok ok, $fail fail in $($sw.ElapsedMilliseconds)ms"
Write-Host "Cache saved to $cacheDir"
