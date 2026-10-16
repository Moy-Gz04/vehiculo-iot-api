# Habilita HTTPS/WSS para la API con Caddy (proxy inverso + certificado de Let's Encrypt automático).
# Ejecutar en el EC2, PowerShell como administrador, desde la carpeta del proyecto:
#   powershell -ExecutionPolicy Bypass -File deploy\instalar-https.ps1 -Dominio 13-218-5-111.sslip.io
# Requisitos: la API corriendo en localhost:8000 y el Security Group con TCP 80 y 443 abiertos.
param([Parameter(Mandatory = $true)][string]$Dominio)
$ErrorActionPreference = 'Stop'

$dir = 'C:\caddy'
New-Item -ItemType Directory -Force $dir | Out-Null

# 1) Descargar Caddy (binario oficial para Windows)
if (-not (Test-Path "$dir\caddy.exe")) {
  Write-Host '>> Descargando Caddy...'
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest 'https://caddyserver.com/api/download?os=windows&arch=amd64' -OutFile "$dir\caddy.exe" -UseBasicParsing
}

# 2) Caddyfile: el dominio publica por HTTPS y reenvía todo (incluido WebSocket) a la API
@"
$Dominio {
    reverse_proxy localhost:8000
}
"@ | Set-Content "$dir\Caddyfile" -Encoding ascii

# 3) Firewall de Windows para 80 y 443
foreach ($p in 80, 443) {
  if (-not (Get-NetFirewallRule -DisplayName "Caddy $p" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "Caddy $p" -Direction Inbound -Protocol TCP -LocalPort $p -Action Allow | Out-Null
  }
}

# 4) Tarea programada: Caddy arranca con el servidor y sigue aunque se cierre la sesión
$accion = New-ScheduledTaskAction -Execute "$dir\caddy.exe" -Argument "run --config $dir\Caddyfile" -WorkingDirectory $dir
$disparo = New-ScheduledTaskTrigger -AtStartup
$ajustes = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'Caddy HTTPS' -Action $accion -Trigger $disparo -Settings $ajustes -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Start-ScheduledTask -TaskName 'Caddy HTTPS'

Write-Host ">> Listo. En 1-2 minutos deben responder:"
Write-Host "   https://$Dominio/docs"
Write-Host "   https://$Dominio/control/simulador.html"
Write-Host "   wss://$Dominio/ws/vehiculos/1"
