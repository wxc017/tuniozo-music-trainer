@echo off
REM ── Tunizo launcher ───────────────────────────────────────────────
REM Starts the Vite dev server and opens the app in your browser.
REM Installs npm dependencies automatically the first time.

setlocal
cd /d "%~dp0"

REM Make sure Node.js is available.
where node >nul 2>nul
if errorlevel 1 (
    echo [Tunizo] Node.js was not found on your PATH.
    echo          Install it from https://nodejs.org/ then run this again.
    pause
    exit /b 1
)

REM Install dependencies on first run (or after they were wiped).
if not exist "node_modules" (
    echo [Tunizo] Installing dependencies, this can take a few minutes...
    call npm install
    if errorlevel 1 (
        echo [Tunizo] npm install failed. See the messages above.
        pause
        exit /b 1
    )
)

REM Open the browser once the server has had a moment to come up.
REM Use 127.0.0.1, not localhost: Vite binds 0.0.0.0 (IPv4 only), so Windows
REM resolves localhost to ::1 first, fails, then falls back to IPv4 -- ~240ms
REM vs ~26ms per request, paid on every one of the app's 100+ module loads.
start "" /b cmd /c "timeout /t 4 >nul & start "" http://127.0.0.1:3000"

echo [Tunizo] Starting dev server on http://127.0.0.1:3000
echo          Press Ctrl+C in this window to stop it.
call npm run dev

endlocal
