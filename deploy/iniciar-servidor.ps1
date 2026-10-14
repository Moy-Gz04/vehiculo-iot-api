# Inicia la API escuchando en todas las interfaces (accesible por la IP pública del EC2).
Set-Location (Split-Path $PSScriptRoot -Parent)
$ip = try { (Invoke-RestMethod -TimeoutSec 3 http://checkip.amazonaws.com).Trim() } catch { '<IP-publica>' }
Write-Host "API:      http://${ip}:8000" -ForegroundColor Green
Write-Host "Swagger:  http://${ip}:8000/docs" -ForegroundColor Green
Write-Host "Control:  http://${ip}:8000/control/" -ForegroundColor Green
Write-Host "WebSocket ws://${ip}:8000/ws/vehiculos/1" -ForegroundColor Green
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers
