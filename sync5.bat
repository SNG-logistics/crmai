@echo off
cd /d "%~dp0"
set LOG=%TEMP%\crm-sync5.log
echo === commit AI resilience + self-test === > %LOG%
git add backend/src/services/ai.service.ts backend/src/index.ts >> %LOG% 2>&1
git commit -m "fix(ai): model fallback so bot always answers (not generic 'received'); ai.log + startup self-test to diagnose empty/failed replies" >> %LOG% 2>&1
echo === pull --rebase === >> %LOG%
git pull --rebase origin main >> %LOG% 2>&1
if errorlevel 1 ( echo REBASE_FAILED >> %LOG% & git rebase --abort >> %LOG% 2>&1 & copy /y %LOG% "%~dp0sync-final-d.txt" & exit )
echo === push === >> %LOG%
git push origin main >> %LOG% 2>&1
git log --oneline -3 >> %LOG% 2>&1
echo === END === >> %LOG%
copy /y %LOG% "%~dp0sync-final-d.txt"
exit
