@echo off
cd /d "%~dp0"
set LOG=%TEMP%\crm-sync16.log
echo === push lufy shortlink 404 fix === > %LOG%
git pull --rebase origin main >> %LOG% 2>&1
if errorlevel 1 ( echo REBASE_FAILED >> %LOG% & git rebase --abort >> %LOG% 2>&1 & copy /y %LOG% "%~dp0sync-final-o.txt" & exit )
git push origin main >> %LOG% 2>&1
git log --oneline -2 >> %LOG% 2>&1
echo === END === >> %LOG%
copy /y %LOG% "%~dp0sync-final-o.txt"
exit
