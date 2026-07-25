@echo off
cd /d "%~dp0"
set LOG=%TEMP%\crm-sync.log
echo === clean === > %LOG%
git checkout -- push-result.txt >> %LOG% 2>&1
git status --short >> %LOG% 2>&1
echo === pull --rebase === >> %LOG%
git pull --rebase origin main >> %LOG% 2>&1
if errorlevel 1 (
  echo REBASE_FAILED_ABORTING >> %LOG%
  git rebase --abort >> %LOG% 2>&1
  git diff --name-only >> %LOG% 2>&1
  copy /y %LOG% "%~dp0sync-final-a.txt"
  exit
)
echo === push === >> %LOG%
git push origin main >> %LOG% 2>&1
echo === log === >> %LOG%
git log --oneline -6 >> %LOG% 2>&1
echo === END === >> %LOG%
copy /y %LOG% "%~dp0sync-final-a.txt"
exit
