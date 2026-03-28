Set fso   = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

baseDir  = fso.GetParentFolderName(WScript.ScriptFullName)
nodeDir  = "C:\Users\Savva Tsekmes\AppData\Local\Logi\LogiPluginService\PluginHosts\node22\node"
python   = "C:\Users\Savva Tsekmes\AppData\Local\Programs\Python\Python313\python.exe"

backendLog  = baseDir & "\backend.log"
frontendLog = baseDir & "\frontend.log"
ttsLog      = baseDir & "\tts_server.log"

' ── Kill any stale processes before starting ─────────────────────────────────
shell.Run "powershell -NoProfile -Command ""$p = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue; if ($p) { Stop-Process -Id $p.OwningProcess -Force -ErrorAction SilentlyContinue }""", 0, True
shell.Run "powershell -NoProfile -Command ""$p = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue; if ($p) { Stop-Process -Id $p.OwningProcess -Force -ErrorAction SilentlyContinue }""", 0, True
shell.Run "powershell -NoProfile -Command ""$p = Get-NetTCPConnection -LocalPort 8500 -ErrorAction SilentlyContinue; if ($p) { Stop-Process -Id $p.OwningProcess -Force -ErrorAction SilentlyContinue }""", 0, True

' ── Start TTS server (hidden) ────────────────────────────────────────────────
Dim tCmd
tCmd = "cmd /c cd /d """ & baseDir & """ && """ & python & """ tts_server.py >> """ & ttsLog & """ 2>&1"
shell.Run tCmd, 0, False

' ── Start backend (hidden) ───────────────────────────────────────────────────
Dim bCmd
bCmd = "cmd /c set PATH=" & nodeDir & ";%PATH% && cd /d """ & baseDir & "\backend"" && node server.js >> """ & backendLog & """ 2>&1"
shell.Run bCmd, 0, False

WScript.Sleep 2000

' ── Start frontend (hidden) ──────────────────────────────────────────────────
Dim fCmd
fCmd = "cmd /c set PATH=" & nodeDir & ";%PATH% && cd /d """ & baseDir & "\frontend"" && npm run dev >> """ & frontendLog & """ 2>&1"
shell.Run fCmd, 0, False

WScript.Sleep 5000

' ── Open browser ─────────────────────────────────────────────────────────────
shell.Run "http://localhost:5173"
