@echo off
cd /d "%~dp0"
set LOG=%TEMP%\crm-sync11.log
echo === commit signature fallback === > %LOG%
git add backend/src/routes/webhooks/line.ts >> %LOG% 2>&1
git commit -m "fix(line): try all tenant LINE configs on signature mismatch - multi-OA tenants were silently dropping webhooks (chats missing from CRM, bot never replied)" >> %LOG% 2>&1
git pull --rebase origin main >> %LOG% 2>&1
if errorlevel 1 ( echo REBASE_FAILED >> %LOG% & git rebase --abort >> %LOG% 2>&1 & copy /y %LOG% "%~dp0sync-final-j.txt" & exit )
git push origin main >> %LOG% 2>&1
git log --oneline -2 >> %LOG% 2>&1
echo === END === >> %LOG%
copy /y %LOG% "%~dp0sync-final-j.txt"
exit
