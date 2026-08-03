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
REM Use localhost, not 127.0.0.1: Google OAuth rejects a bare loopback IP as a
REM JavaScript origin, so Drive sign-in fails with "400: origin_mismatch".
REM The old reason for preferring 127.0.0.1 (Windows resolves localhost to ::1
REM first, and an IPv4-only bind made that fail over -- ~240ms vs ~26ms per
REM request) is gone: the dev server now binds "::" dual-stack, so ::1 answers
REM directly. See the server.host note in vite.config.ts.
start "" /b cmd /c "timeout /t 4 >nul & start "" http://localhost:3000"

echo [Tunizo] Starting dev server on http://localhost:3000
echo          Press Ctrl+C in this window to stop it.
call npm run dev

endlocal
