@echo off
cd /d "%~dp0"
set LOG=%TEMP%\crm-sync4.log
echo === commit line.ts (hot-games -> bonustime box) === > %LOG%
git add backend/src/routes/webhooks/line.ts >> %LOG% 2>&1
git commit -m "feat(bot): route all 'game breaking / which game' questions to BONUS TIME box; remove hardcoded game-list reply" >> %LOG% 2>&1
echo === pull --rebase === >> %LOG%
git pull --rebase origin main >> %LOG% 2>&1
if errorlevel 1 (
  echo REBASE_FAILED >> %LOG%
  git rebase --abort >> %LOG% 2>&1
  copy /y %LOG% "%~dp0sync-final-c.txt"
  exit
)
echo === push === >> %LOG%
git push origin main >> %LOG% 2>&1
git log --oneline -3 >> %LOG% 2>&1
echo === END === >> %LOG%
copy /y %LOG% "%~dp0sync-final-c.txt"
exit
