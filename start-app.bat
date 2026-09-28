@echo off
title Adeeva Catalyst - Order Dispatch & FTP Suite
echo ========================================================
echo        Starting Adeeva Catalyst Application...
echo ========================================================
echo.

if not exist node_modules (
  echo Installing dependencies, please wait...
  npm install
)

echo Starting server on http://localhost:3000
start "" http://localhost:3000
node server.js

pause
