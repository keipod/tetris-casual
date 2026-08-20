# up.ps1 — 캐주얼 게임 허브 서버 시작 (Windows PowerShell)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir
python portctl.py up hub
