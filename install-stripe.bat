@echo off
echo Installing Stripe package...
cd /d "%~dp0"
call npm install stripe
echo.
echo Installation complete!
pause
