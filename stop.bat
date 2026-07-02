@echo off
chcp 65001 >nul
title CRM Stop
echo Stopping CRM dev servers (ports 4000 and 3000)...

for %%P in (4000 3000 3001 3002) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr ":%%P " ^| findstr LISTENING') do (
    echo   killing PID %%I on port %%P
    taskkill /F /PID %%I >nul 2>&1
  )
)

echo Done.
timeout /t 2 /nobreak >nul
