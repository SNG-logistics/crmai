# Deploy เฉพาะ lufy (แก้ลิงก์สั้น 404) — รันบน VPS ที่ C:\CRM
# วิธีใช้บน VPS: คลิกขวาไฟล์นี้ > Run with PowerShell   หรือ
#   powershell -ExecutionPolicy Bypass -File C:\CRM\deploy-lufy-fix.ps1
$ErrorActionPreference = 'Stop'
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')

Write-Host '=== [1/3] git pull ==='
Set-Location C:\CRM
& git pull origin main

Write-Host '=== [2/3] build lufy frontend (next.config เปลี่ยน ต้อง build ใหม่) ==='
Set-Location C:\CRM\modules\lufy\frontend
& npm run build

Write-Host '=== [3/3] pm2 restart lufy-frontend ==='
Set-Location C:\CRM
& pm2 restart lufy-frontend
& pm2 status

Write-Host '=== DONE — ทดสอบเปิดลิงก์สั้นบน https://vrc2.cc/<slug> ต้องได้ 302 ไม่ใช่ 404 ==='
