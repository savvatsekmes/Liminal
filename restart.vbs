WScript.Sleep 2000

Set fso   = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Kill the frontend Vite process (backend already exited via process.exit)
shell.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -aon ^| findstr "":5173 ""') do taskkill /f /pid %a >nul 2>&1", 0, True

' Kill the Python TTS server on port 8500
shell.Run "powershell -NoProfile -Command ""$p = Get-NetTCPConnection -LocalPort 8500 -ErrorAction SilentlyContinue; if ($p) { Stop-Process -Id $p.OwningProcess -Force -ErrorAction SilentlyContinue }""", 0, True

WScript.Sleep 500

' Relaunch everything
shell.Run "wscript """ & scriptDir & "\start.vbs"""
