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
shell.Run "powershell -NoProfile -Command ""$p = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue; if ($p) { Stop-Process -Id $p.OwningProcess -Force -ErrorAction SilentlyContinue }""", 0, True
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

' ── Read actual URL from Vite log and open browser ───────────────────────────
Dim url, waited, logFile, line
url = ""
waited = 0

Do While url = "" And waited < 20
  WScript.Sleep 500
  waited = waited + 1
  If fso.FileExists(frontendLog) Then
    Set logFile = fso.OpenTextFile(frontendLog, 1)
    Do While Not logFile.AtEndOfStream
      line = logFile.ReadLine()
      If InStr(line, "Local:") > 0 And InStr(line, "http://127.0.0.1") > 0 Then
        Dim parts
        parts = Split(line, "http://127.0.0.1:")
        If UBound(parts) >= 1 Then
          url = "http://127.0.0.1:" & Trim(parts(1))
        End If
      End If
    Loop
    logFile.Close
  End If
Loop

If url = "" Then url = "http://127.0.0.1:3000"
shell.Run url
