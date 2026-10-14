# Instalación completa en el EC2 (Windows Server) desde una consola de Session Manager.
# - Crea .venv e instala dependencias
# - Pide los datos de RDS y crea .env (no se sube a GitHub)
# - Abre el puerto 8000 en el Firewall de Windows
# - Registra una tarea programada que arranca la API al encender el servidor y la inicia ya
$ErrorActionPreference = 'Stop'
$proyecto = 'C:\vehiculo_iot_api'
Set-Location $proyecto

# Python: el que esté en PATH o la instalación por usuario de Administrator
$py = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $py -or $py -like '*WindowsApps*') {
    $py = Get-ChildItem 'C:\Users\*\AppData\Local\Programs\Python\Python3*\python.exe', 'C:\Program Files\Python3*\python.exe' -ErrorAction SilentlyContinue |
          Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $py) { throw 'No se encontró Python en el servidor.' }
Write-Host "1/5 Python: $py" -ForegroundColor Yellow

Write-Host '2/5 Entorno virtual y dependencias (tarda 1-2 min)...' -ForegroundColor Yellow
if (-not (Test-Path .venv)) { & $py -m venv .venv }
& .\.venv\Scripts\python.exe -m pip install --upgrade pip -q --disable-pip-version-check
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt -q --disable-pip-version-check

Write-Host '3/5 Datos de Amazon RDS' -ForegroundColor Yellow
if (Test-Path .env) {
    Write-Host '   Ya existe .env; se conserva. (Bórralo y vuelve a ejecutar para cambiarlo.)'
} else {
    $dbHost = Read-Host '   Punto de enlace de RDS (ej. instancia-rds-iot.xxxx.us-east-1.rds.amazonaws.com)'
    $dbUser = Read-Host '   Usuario de RDS'
    $sec    = Read-Host '   Contraseña de RDS' -AsSecureString
    $dbPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
    $apiKey = Read-Host '   Clave X-API-Key para el servidor (inventa una, distinta a la local)'
    @(
        "DB_HOST=$dbHost", 'DB_PORT=3306', "DB_USER=$dbUser", "DB_PASSWORD=$dbPass",
        'DB_NAME=vehiculo_iot', "API_KEY=$apiKey"
    ) | Set-Content -Path .env -Encoding ascii
    icacls .env /inheritance:r /grant:r 'Administrators:F' 'SYSTEM:F' | Out-Null
}
$hostRds = (Get-Content .env | Where-Object { $_ -like 'DB_HOST=*' }) -replace '^DB_HOST=', ''
$ok = (Test-NetConnection $hostRds -Port 3306 -WarningAction SilentlyContinue).TcpTestSucceeded
if ($ok) { Write-Host '   RDS responde en el puerto 3306' -ForegroundColor Green }
else { Write-Host '   AVISO: RDS no responde en 3306. Revisa la regla de rds-iot-sg (origen 13.218.5.111/32).' -ForegroundColor Red }

Write-Host '4/5 Firewall de Windows: puerto 8000' -ForegroundColor Yellow
if (-not (Get-NetFirewallRule -DisplayName 'API Vehiculo IoT 8000' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'API Vehiculo IoT 8000' -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow | Out-Null
}

Write-Host '5/5 Servicio: tarea programada que mantiene la API encendida' -ForegroundColor Yellow
$tarea = 'API Vehiculo IoT'
Unregister-ScheduledTask -TaskName $tarea -Confirm:$false -ErrorAction SilentlyContinue
$accion = New-ScheduledTaskAction -Execute "$proyecto\.venv\Scripts\python.exe" `
    -Argument '-m uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers' -WorkingDirectory $proyecto
$inicio = New-ScheduledTaskTrigger -AtStartup
$ajustes = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $tarea -Action $accion -Trigger $inicio -Settings $ajustes -User 'SYSTEM' -RunLevel Highest | Out-Null
Start-ScheduledTask -TaskName $tarea
Start-Sleep -Seconds 6

try {
    $r = Invoke-RestMethod -TimeoutSec 10 http://localhost:8000/
    Write-Host "   API en línea: $($r.estado)" -ForegroundColor Green
} catch {
    Write-Host '   La API no respondió todavía. Revisa con: Invoke-RestMethod http://localhost:8000/' -ForegroundColor Red
}
$ip = try { (Invoke-RestMethod -TimeoutSec 3 http://checkip.amazonaws.com).Trim() } catch { '<IP-publica>' }
Write-Host ''
Write-Host "Swagger:   http://${ip}:8000/docs" -ForegroundColor Green
Write-Host "Control:   http://${ip}:8000/control/" -ForegroundColor Green
Write-Host "WebSocket: ws://${ip}:8000/ws/vehiculos/1" -ForegroundColor Green
