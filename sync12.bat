@echo off
cd /d "%~dp0"
set LOG=%TEMP%\crm-sync12.log
echo === commit company selector === > %LOG%
git add "frontend/app/(dashboard)/settings/bonustime/page.tsx" backend/src/routes/webhooks/line.ts >> %LOG% 2>&1
git commit -m "feat(bonustime): company dropdown selector - pick which company's BONUS TIME to configure/enable; respect per-company on/off in webhook; clean leftover merge markers" >> %LOG% 2>&1
git pull --rebase origin main >> %LOG% 2>&1
if errorlevel 1 ( echo REBASE_FAILED >> %LOG% & git rebase --abort >> %LOG% 2>&1 & copy /y %LOG% "%~dp0sync-final-k.txt" & exit )
git push origin main >> %LOG% 2>&1
git log --oneline -2 >> %LOG% 2>&1
echo === END === >> %LOG%
copy /y %LOG% "%~dp0sync-final-k.txt"
exit
