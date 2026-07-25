@echo off
cd /d "%~dp0"
set LOG=%TEMP%\crm-sync6.log
echo === commit gif-logo fix === > %LOG%
git add backend/src/services/bonustime.service.ts >> %LOG% 2>&1
git commit -m "fix(bonustime): skip non-PNG/JPEG camp logos (.gif broke whole LINE flex -> menu never showed); fall back to text initials" >> %LOG% 2>&1
echo === pull --rebase === >> %LOG%
git pull --rebase origin main >> %LOG% 2>&1
if errorlevel 1 ( echo REBASE_FAILED >> %LOG% & git rebase --abort >> %LOG% 2>&1 & copy /y %LOG% "%~dp0sync-final-e.txt" & exit )
echo === push === >> %LOG%
git push origin main >> %LOG% 2>&1
git log --oneline -2 >> %LOG% 2>&1
echo === END === >> %LOG%
copy /y %LOG% "%~dp0sync-final-e.txt"
exit
