@echo off
cd /d "%~dp0"
echo Starting Windows Cleaner...
call npm start
if %errorlevel% neq 0 (
    echo.
    echo Error starting the app. attempting fallback...
    title Windows Cleaner (Fallback)
    call "node_modules\.bin\electron" .
)
pause
