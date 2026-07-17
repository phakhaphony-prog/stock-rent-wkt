$ErrorActionPreference = "SilentlyContinue"
$root = "C:\Users\DELL\Documents\Default Project"
$dataFile = Join-Path $root "data.csv"
$htmlFile = Join-Path $root "index.html"
$templateFile = Join-Path $root "template.html"

if (-not (Test-Path $dataFile)) {
    Write-Host "ERROR: data.csv not found"
    exit 1
}

if (-not (Test-Path $templateFile)) {
    Write-Host "ERROR: template.html not found"
    exit 1
}

Write-Host "=== Building index.html ==="

$csv = [System.IO.File]::ReadAllText($dataFile, [System.Text.Encoding]::UTF8).Trim()
$bytes = [System.Text.Encoding]::UTF8.GetBytes($csv)
$b64 = [Convert]::ToBase64String($bytes)

$template = [System.IO.File]::ReadAllText($templateFile, [System.Text.Encoding]::UTF8)

$oldBlock = "    var RAW_CSV_B64 = '';"

$newBlock = "    var RAW_CSV_B64 = '$b64';"

$result = $template.Replace($oldBlock, $newBlock)

[System.IO.File]::WriteAllText($htmlFile, $result, (New-Object System.Text.UTF8Encoding $false))

$lines = ($csv -split "`n").Count
Write-Host "Built index.html: $((Get-Item $htmlFile).Length) bytes, $lines rows of data, base64 length: $($b64.Length)"
