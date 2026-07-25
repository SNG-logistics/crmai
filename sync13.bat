@echo off
cd /d "%~dp0"
set LOG=%TEMP%\crm-sync13.log
echo === commit strict per-company bonustime === > %LOG%
git add backend/src/routes/webhooks/line.ts >> %LOG% 2>&1
git commit -m "fix(bonustime): strict per-company separation - conversation follows the OA customer messaged (same LINE userId across OAs was stuck on old company); no cross-company fallback; on/off only via company dropdown" >> %LOG% 2>&1
git pull --rebase origin main >> %LOG% 2>&1
if errorlevel 1 ( echo REBASE_FAILED >> %LOG% & git rebase --abort >> %LOG% 2>&1 & copy /y %LOG% "%~dp0sync-final-l.txt" & exit )
git push origin main >> %LOG% 2>&1
git log --oneline -2 >> %LOG% 2>&1
echo === END === >> %LOG%
copy /y %LOG% "%~dp0sync-final-l.txt"
exit
