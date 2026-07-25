@echo off
cd /d "%~dp0"
set LOG=%TEMP%\crm-sync9.log
echo === commit remove light mode + add vrc2.cc to Caddyfile === > %LOG%
git add frontend/app/globals.css "frontend/app/(dashboard)/layout.tsx" frontend/app/layout.tsx deploy/Caddyfile >> %LOG% 2>&1
git commit -m "revert(ui): remove Light mode; fix(infra): add vrc2.cc to Caddyfile so git pull never drops it again" >> %LOG% 2>&1
echo === pull --rebase === >> %LOG%
git pull --rebase origin main >> %LOG% 2>&1
if errorlevel 1 ( echo REBASE_FAILED >> %LOG% & git rebase --abort >> %LOG% 2>&1 & copy /y %LOG% "%~dp0sync-final-h.txt" & exit )
echo === push === >> %LOG%
git push origin main >> %LOG% 2>&1
git log --oneline -2 >> %LOG% 2>&1
echo === END === >> %LOG%
copy /y %LOG% "%~dp0sync-final-h.txt"
exit
