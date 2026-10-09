@echo off
rem Starts Oleg locally: the server on :3000 and the web version on :8081.
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Нужен Node.js версии 22.13 или новее: https://nodejs.org — установите LTS и запустите снова.
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 (
  echo Node.js слишком старый, нужен 22.13 или новее: https://nodejs.org — установите LTS и запустите снова.
  pause
  exit /b 1
)

echo == Устанавливаю зависимости (первый раз — пару минут)...
pushd server
call npm install --no-audit --no-fund || goto :fail
popd
pushd app
call npm install --no-audit --no-fund || goto :fail
popd

echo == Запускаю сервер Олега в отдельном окне: http://localhost:3000
echo    Если в том окне ошибка - пришлите её текст.
start "Oleg server" cmd /k "cd /d ""%~dp0server"" && npm start"

echo == Открываю Олега в браузере: http://localhost:8081
echo    Первый вход: «Уже есть инвайт?» - поле инвайта пустое - ник и пароль.
echo    Остановить: закройте оба окна.
cd app
call npx expo start --web
exit /b 0

:fail
echo Не получилось установить зависимости. Проверьте интернет и запустите снова.
pause
exit /b 1
