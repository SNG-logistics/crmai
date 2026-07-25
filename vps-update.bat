@echo off
echo === Pull latest code ===
cd /d C:\CRM
git pull origin main
echo === Deploy ===
powershell -ExecutionPolicy Bypass -File C:\CRM\deploy\vps-deploy.ps1
echo === Done ===
pause
