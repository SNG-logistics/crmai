@echo off
cd /d "%~dp0"
set LOG=%TEMP%\crm-sync10.log
echo === commit bonustime empty-text fix === > %LOG%
git add backend/src/services/bonustime.service.ts >> %LOG% 2>&1
git commit -m "fix(bonustime): never emit empty text components (empty intro/title/subtitle/footer broke whole LINE flex - the real reason menu never showed); fallbacks + omit empties" >> %LOG% 2>&1
echo === pull --rebase === >> %LOG%
git pull --rebase origin main >> %LOG% 2>&1
if errorlevel 1 ( echo REBASE_FAILED >> %LOG% & git rebase --abort >> %LOG% 2>&1 & copy /y %LOG% "%~dp0sync-final-i.txt" & exit )
echo === push === >> %LOG%
git push origin main >> %LOG% 2>&1
git log --oneline -2 >> %LOG% 2>&1
echo === END === >> %LOG%
copy /y %LOG% "%~dp0sync-final-i.txt"
exit
