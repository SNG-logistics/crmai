@echo off
cd /d "%~dp0"
set LOG=%TEMP%\crm-sync8.log
echo === commit light/dark theme === > %LOG%
git add frontend/app/globals.css "frontend/app/(dashboard)/layout.tsx" frontend/app/layout.tsx >> %LOG% 2>&1
git commit -m "feat(ui): system-wide Light/Dark theme toggle (CSS variable overrides + topbar switch + no-flash script)" >> %LOG% 2>&1
echo === pull --rebase === >> %LOG%
git pull --rebase origin main >> %LOG% 2>&1
if errorlevel 1 ( echo REBASE_FAILED >> %LOG% & git rebase --abort >> %LOG% 2>&1 & copy /y %LOG% "%~dp0sync-final-g.txt" & exit )
echo === push === >> %LOG%
git push origin main >> %LOG% 2>&1
git log --oneline -2 >> %LOG% 2>&1
echo === END === >> %LOG%
copy /y %LOG% "%~dp0sync-final-g.txt"
exit
