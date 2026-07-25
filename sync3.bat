@echo off
cd /d "%~dp0"
set LOG=%TEMP%\crm-sync3.log
echo === reset to origin/main === > %LOG%
git reset --hard origin/main >> %LOG% 2>&1
echo === overlay my 3 fixed files from 600329c === >> %LOG%
git checkout 600329c -- backend/src/services/ai.service.ts backend/src/services/bonustime.service.ts backend/src/routes/webhooks/line.ts >> %LOG% 2>&1
git commit -m "fix(bot): bonustime always answers (fuzzy match + tenant fallback + no-silence), links sent as plain URL once (strip markdown), deterministic BONUSTIME pre-check, longer memory" >> %LOG% 2>&1
echo === push === >> %LOG%
git push origin main >> %LOG% 2>&1
echo === log === >> %LOG%
git log --oneline -5 >> %LOG% 2>&1
echo === END === >> %LOG%
copy /y %LOG% "%~dp0sync-final-b.txt"
exit
