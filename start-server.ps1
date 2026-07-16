$ErrorActionPreference = "SilentlyContinue"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8080/")
$listener.Start()
Write-Host "Server running at http://localhost:8080/"
Write-Host "Press Ctrl+C to stop"

$root = "C:\Users\DELL\Documents\Default Project"

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
                    ".png"  = "image/png"
                    ".jpg"  = "image/jpeg"
                    ".gif"  = "image/gif"
                    ".ico"  = "image/x-icon"
                }
                $ct = $types[$ext]
                if ($ct) { $context.Response.ContentType = $ct }
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
