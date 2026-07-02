# CRM deploy — npm install + build all 4 apps, start PM2, register Caddy
# Run as Administrator AFTER vps-setup.ps1, code must be at C:\CRM:
#   powershell -ExecutionPolicy Bypass -File C:\CRM\deploy\vps-deploy.ps1
$ErrorActionPreference = 'Stop'
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')

Write-Host '=== [1/6] npm install: backend ==='
Set-Location C:\CRM\backend
& npm install --no-audit --no-fund
& npx prisma generate

Write-Host '=== [2/6] npm install: frontend ==='
Set-Location C:\CRM\frontend
& npm install --no-audit --no-fund

Write-Host '=== [3/6] npm install: lufy backend + frontend ==='
Set-Location C:\CRM\modules\lufy\backend
& npm install --no-audit --no-fund
& npx prisma generate
Set-Location C:\CRM\modules\lufy\frontend
& npm install --no-audit --no-fund

Write-Host '=== [4/6] build all ==='
Set-Location C:\CRM\backend;               & npm run build
Set-Location C:\CRM\frontend;              & npm run build
Set-Location C:\CRM\modules\lufy\backend;  & npm run build
Set-Location C:\CRM\modules\lufy\frontend; & npm run build

Write-Host '=== [5/6] PM2 start + autostart ==='
Set-Location C:\CRM
& pm2 start ecosystem.config.js
& pm2 save
& pm2-startup install
& pm2 save

Write-Host '=== [6/6] Caddy as startup task ==='
schtasks /Create /TN "Caddy" /TR "C:\caddy\caddy.exe run --config C:\CRM\deploy\Caddyfile" /SC ONSTART /RU SYSTEM /RL HIGHEST /F
schtasks /Run /TN "Caddy"

Start-Sleep -Seconds 5
& pm2 status
Write-Host '=== DEPLOY DONE — open https://khodtuengai.com ==='
