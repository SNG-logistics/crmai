# CRM VPS setup — install Node 20 LTS, PM2, Caddy + open firewall 80/443
# Run as Administrator:  powershell -ExecutionPolicy Bypass -File C:\CRM\deploy\vps-setup.ps1
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$dl = "$env:TEMP\crm-setup"
New-Item -ItemType Directory -Force -Path $dl | Out-Null

function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
}

# --- Node.js 20 LTS ---
$hasNode = $false
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) { $v = & node -v; if ($v -like 'v20*') { $hasNode = $true; Write-Host "Node $v already installed" } }
if (-not $hasNode) {
  Write-Host 'Downloading Node.js 20 LTS...'
  $shas = (Invoke-WebRequest 'https://nodejs.org/dist/latest-v20.x/SHASUMS256.txt' -UseBasicParsing).Content
  if ($shas -match 'node-v20[0-9\.]+-x64\.msi') { $msi = $Matches[0] } else { throw 'Could not find Node 20 MSI name' }
  Invoke-WebRequest "https://nodejs.org/dist/latest-v20.x/$msi" -OutFile "$dl\node.msi" -UseBasicParsing
  Write-Host "Installing $msi ..."
  Start-Process msiexec -ArgumentList '/i',"$dl\node.msi",'/qn','/norestart' -Wait
  Refresh-Path
  Write-Host "Node installed: $(& node -v)"
}

# --- PM2 ---
Refresh-Path
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  Write-Host 'Installing PM2...'
  & npm install -g pm2 pm2-windows-startup --no-audit --no-fund
  Refresh-Path
}
Write-Host "PM2 version: $(& pm2 -v)"

# --- Caddy ---
if (-not (Test-Path 'C:\caddy\caddy.exe')) {
  Write-Host 'Downloading Caddy...'
  New-Item -ItemType Directory -Force -Path 'C:\caddy' | Out-Null
  Invoke-WebRequest 'https://caddyserver.com/api/download?os=windows&arch=amd64' -OutFile 'C:\caddy\caddy.exe' -UseBasicParsing
}
Write-Host "Caddy: $(& C:\caddy\caddy.exe version)"

# --- Firewall 80/443 ---
foreach ($p in 80,443) {
  if (-not (Get-NetFirewallRule -DisplayName "CRM HTTP $p" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "CRM HTTP $p" -Direction Inbound -Protocol TCP -LocalPort $p -Action Allow | Out-Null
    Write-Host "Firewall: opened inbound TCP $p"
  }
}

# --- Stop IIS if it would grab port 80 ---
$iis = Get-Service W3SVC -ErrorAction SilentlyContinue
if ($iis -and $iis.Status -eq 'Running') {
  Stop-Service W3SVC -Force
  Set-Service W3SVC -StartupType Disabled
  Write-Host 'IIS (W3SVC) stopped and disabled'
}

Write-Host '=== SETUP DONE ==='
