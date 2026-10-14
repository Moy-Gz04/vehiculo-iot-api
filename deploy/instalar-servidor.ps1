# Instala la API en el servidor EC2 (Windows Server). Ejecutar en PowerShell COMO ADMINISTRADOR
# desde la carpeta del proyecto:  powershell -ExecutionPolicy Bypass -File deploy\instalar-servidor.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host '1/4 Comprobando Python...' -ForegroundColor Yellow
$py = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $py -or $py -like '*WindowsApps*') { throw 'No se encontró Python. Instálalo desde python.org (marca "Add python.exe to PATH") y vuelve a ejecutar.' }
python --version

Write-Host '2/4 Creando entorno virtual e instalando dependencias...' -ForegroundColor Yellow
if (-not (Test-Path .venv)) { python -m venv .venv }
.\.venv\Scripts\python.exe -m pip install --upgrade pip -q
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -q

Write-Host '3/4 Archivo .env...' -ForegroundColor Yellow
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host 'Se creó .env: escribe el endpoint, usuario y contraseña de RDS y tu API_KEY, guarda y cierra el Bloc de notas.' -ForegroundColor Cyan
  notepad .env | Out-Null
  Wait-Process notepad -ErrorAction SilentlyContinue
}

Write-Host '4/4 Abriendo el puerto 8000 en el Firewall de Windows...' -ForegroundColor Yellow
if (-not (Get-NetFirewallRule -DisplayName 'API Vehiculo IoT 8000' -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName 'API Vehiculo IoT 8000' -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow | Out-Null
}
Write-Host 'Listo. Inicia la API con: powershell -ExecutionPolicy Bypass -File deploy\iniciar-servidor.ps1' -ForegroundColor Green
