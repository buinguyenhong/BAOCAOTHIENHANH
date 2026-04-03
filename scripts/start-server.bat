@echo off
chcp 65001 >nul

:: ============================================================
:: HIS Report Server - Start / Stop Launcher
:: ============================================================
:: Double-click de bat/tat server:
::   - Server dang chay  → Dung ca Backend + Frontend
::   - Server chua chay  → Khoi dong ca Backend + Frontend (ngam)
:: ============================================================

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "BACKEND_DIR=%SCRIPT_DIR%..\backend"
set "FRONTEND_DIR=%SCRIPT_DIR%..\frontend"
set "BACKEND_PORT=5000"
set "FRONTEND_PORT=5173"

:: --- Kiem tra port 5000 (Backend) ---
for /f "tokens=5" %%a in (
    'netstat -ano ^| findstr ":%BACKEND_PORT%.*LISTENING"'
) do set "BACKEND_PID=%%a"

:: --- Kiem tra port 5173 (Frontend) ---
for /f "tokens=5" %%b in (
    'netstat -ano ^| findstr ":%FRONTEND_PORT%.*LISTENING"'
) do set "FRONTEND_PID=%%b"

:: ============================================================
:: STOP - Server dang chay
:: ============================================================
if defined BACKEND_PID (
    echo [STOP] Backend (PID: %BACKEND_PID%)...
    taskkill /PID %BACKEND_PID% /F >nul 2>&1
)
if defined FRONTEND_PID (
    echo [STOP] Frontend (PID: %FRONTEND_PID%)...
    taskkill /PID %FRONTEND_PID% /F >nul 2>&1
)

:: Cho may tinh nghi thuc
timeout /t 2 >nul

if defined BACKEND_PID (
    echo Done. Server da dung.
    echo.
    echo De bat lai server, chay script nay.
    pause >nul
    exit /b
)

:: ============================================================
:: START - Khoi dong ngam ca Backend + Frontend
:: ============================================================

:: Xoa cua so hien tai (chay ngam)
cls

echo [START] Khoi dong HIS Report Server (chay ngam)...
echo.

:: Tao VBS helper de chay windowless
set "VBS=%TEMP%\his_run_%RANDOM%.vbs"

:: --- Backend (Node/tsx) ---
echo Set sh = CreateObject("WScript.Shell")                        > "%VBS%"
echo sh.CurrentDirectory = "%BACKEND_DIR%"                       >> "%VBS%"
echo sh.Run """npm"" run dev", 0, False                           >> "%VBS%"
cscript //nologo "%VBS%" >nul 2>&1
del "%VBS%" >nul 2>&1
echo [OK] Backend khoi dong (port %BACKEND_PORT%)

:: --- Frontend (Vite) ---
set "VBS=%TEMP%\his_run_%RANDOM%.vbs"
echo Set sh = CreateObject("WScript.Shell")                        > "%VBS%"
echo sh.CurrentDirectory = "%FRONTEND_DIR%"                      >> "%VBS%"
echo sh.Run """npm"" run dev", 0, False                           >> "%VBS%"
cscript //nologo "%VBS%" >nul 2>&1
del "%VBS%" >nul 2>&1
echo [OK] Frontend khoi dong (port %FRONTEND_PORT%)

echo.
echo ============================================
echo  HIS Report Server - DA CHAY NGAM
echo ============================================
echo.
echo   Backend:  http://localhost:%BACKEND_PORT%
echo   Frontend: http://localhost:%FRONTEND_PORT%
echo.
echo   De tat server, chay lai script nay.
echo.
timeout /t 5 >nul
exit /b
