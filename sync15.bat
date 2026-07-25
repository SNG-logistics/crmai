@echo off
cd /d "%~dp0"
set LOG=%TEMP%\crm-sync15.log
echo === commit deterministic OA routing === > %LOG%
git add backend/src/routes/webhooks/line.ts >> %LOG% 2>&1
git commit -m "fix(line): deterministic OA routing - prefer the config that has a company when secrets collide (orphan no-company config was hijacking OneToBet chats into databet)" >> %LOG% 2>&1
git pull --rebase origin main >> %LOG% 2>&1
if errorlevel 1 ( echo REBASE_FAILED >> %LOG% & git rebase --abort >> %LOG% 2>&1 & copy /y %LOG% "%~dp0sync-final-n.txt" & exit )
git push origin main >> %LOG% 2>&1
git log --oneline -2 >> %LOG% 2>&1
echo === END === >> %LOG%
copy /y %LOG% "%~dp0sync-final-n.txt"
exit
