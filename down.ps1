# down.ps1 — 파스텔 테트리스 서버 종료 (Windows PowerShell)
$Port = 8765

$procs = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
         Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique

if (-not $procs) {
    Write-Host "이미 꺼져있음 (포트 $Port)"
} else {
    foreach ($pid in $procs) {
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
    Write-Host "■  포트 $Port 서버 종료 (pid: $($procs -join ', '))"
}
