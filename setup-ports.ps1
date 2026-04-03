# Liminal — Reserve ports so Hyper-V doesn't steal them
# Run once as Administrator: Right-click > Run with PowerShell (as Admin)

$ports = @(3001, 8100, 11434)  # Backend, Chatterbox TTS, Ollama

Write-Host "`nLiminal Port Setup" -ForegroundColor Cyan
Write-Host "==================" -ForegroundColor Cyan
Write-Host "Reserving ports: $($ports -join ', ')`n"

# Check admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: Must run as Administrator." -ForegroundColor Red
    Write-Host "Right-click this script > 'Run with PowerShell' as Admin.`n"
    pause
    exit 1
}

# Stop NAT driver to free port ranges
Write-Host "Stopping Windows NAT Driver..." -ForegroundColor Yellow
net stop winnat 2>$null | Out-Null

$success = 0
foreach ($port in $ports) {
    $result = netsh int ipv4 add excludedportrange protocol=tcp startport=$port numberofports=1 store=persistent 2>&1
    if ($result -match "Ok") {
        Write-Host "  Reserved port $port" -ForegroundColor Green
        $success++
    } elseif ($result -match "overlaps") {
        Write-Host "  Port $port already reserved (skipped)" -ForegroundColor DarkGray
        $success++
    } else {
        Write-Host "  Failed to reserve port $port — $result" -ForegroundColor Red
    }
}

# Restart NAT driver
Write-Host "`nRestarting Windows NAT Driver..." -ForegroundColor Yellow
net start winnat 2>$null | Out-Null

Write-Host "`nDone! $success/$($ports.Count) ports reserved.`n" -ForegroundColor Cyan
Write-Host "You can now start Liminal normally.`n"
pause
