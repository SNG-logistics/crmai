@echo off
cd /d "%~dp0"
set LOG=%TEMP%\crm-sync14.log
echo === commit shared bonustime + company checklist === > %LOG%
git add backend/src/routes/webhooks/line.ts backend/src/routes/bonustime.ts "frontend/app/(dashboard)/settings/bonustime/page.tsx" >> %LOG% 2>&1
git commit -m "feat(bonustime): shared camps/games across all companies (add games once); company checklist to tick which OAs use it; unconnected OA sends nothing (no databet fallback)" >> %LOG% 2>&1
git pull --rebase origin main >> %LOG% 2>&1
if errorlevel 1 ( echo REBASE_FAILED >> %LOG% & git rebase --abort >> %LOG% 2>&1 & copy /y %LOG% "%~dp0sync-final-m.txt" & exit )
git push origin main >> %LOG% 2>&1
git log --oneline -2 >> %LOG% 2>&1
echo === END === >> %LOG%
copy /y %LOG% "%~dp0sync-final-m.txt"
exit
