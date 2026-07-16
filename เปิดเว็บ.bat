@echo off
title Stock Rent WKT Server
echo ========================================
echo   Stock Rent WKT - Starting Server...
echo ========================================
echo.
echo Server running at: http://localhost:8080/
echo Press Ctrl+C to stop
echo.
start http://localhost:8080/
powershell -ExecutionPolicy Bypass -File "%~dp0start-server.ps1"
