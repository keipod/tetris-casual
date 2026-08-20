# down.ps1 — 캐주얼 게임 허브 서버 종료 (Windows PowerShell)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir
python portctl.py down hub
