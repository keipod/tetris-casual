# up.ps1 — 파스텔 테트리스 서버 시작 (Windows PowerShell)
$Port = 58765
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# 이미 사용 중인 포트 종료
$procs = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
         Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique
foreach ($pid in $procs) {
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "*" |
       Where-Object { $_.IPAddress -notmatch "^127\." } |
       Select-Object -First 1).IPAddress

Write-Host "▶  http://0.0.0.0:${Port} 서버 시작"
Write-Host "   같은 네트워크: http://${ip}:${Port}"

python -m http.server $Port --bind 0.0.0.0
