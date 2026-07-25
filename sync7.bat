@echo off
cd /d "%~dp0"
set LOG=%TEMP%\crm-sync7.log
echo === commit AI learning === > %LOG%
git add backend/src/services/ai.service.ts >> %LOG% 2>&1
git commit -m "feat(ai): learn from real admin replies - retrieve similar past customer/agent Q&A and inject as few-shot examples so bot answers on-point like the team" >> %LOG% 2>&1
echo === pull --rebase === >> %LOG%
git pull --rebase origin main >> %LOG% 2>&1
if errorlevel 1 ( echo REBASE_FAILED >> %LOG% & git rebase --abort >> %LOG% 2>&1 & copy /y %LOG% "%~dp0sync-final-f.txt" & exit )
echo === push === >> %LOG%
git push origin main >> %LOG% 2>&1
git log --oneline -2 >> %LOG% 2>&1
echo === END === >> %LOG%
copy /y %LOG% "%~dp0sync-final-f.txt"
exit
