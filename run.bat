@echo off
setlocal EnableExtensions
rem ---------------------------------------------------------------------------
rem  run.bat  -  start the Pariksha platform
rem
rem    run.bat            show a menu
rem    run.bat demo       in-memory demo with sample data (no database needed)
rem    run.bat start      run against MongoDB (uses .env)
rem    run.bat dev        like start, restarts automatically when files change
rem    run.bat seed       load exams, syllabus, sample questions and tests into MongoDB
rem    run.bat reset      DELETE the MongoDB database and seed it again
rem    run.bat install    install / update dependencies
rem ---------------------------------------------------------------------------
cd /d "%~dp0"
title Pariksha

call :check_node || goto :fail

set "MODE=%~1"
if not "%MODE%"=="" goto :dispatch

echo.
echo   Pariksha - Competitive Exam Preparation Platform
echo   ------------------------------------------------
echo   1. Demo        (in-memory data, nothing to set up)
echo   2. Start       (MongoDB from .env)
echo   3. Dev         (MongoDB, auto-restart on file changes)
echo   4. Seed        (load sample data into MongoDB)
echo   5. Reset       (DELETE database and seed again)
echo   6. Install     (npm install)
echo   7. Exit
echo.
choice /c 1234567 /n /m "Choose 1-7: "
if errorlevel 7 goto :eof
if errorlevel 6 set "MODE=install" & goto :dispatch
if errorlevel 5 set "MODE=reset" & goto :dispatch
if errorlevel 4 set "MODE=seed" & goto :dispatch
if errorlevel 3 set "MODE=dev" & goto :dispatch
if errorlevel 2 set "MODE=start" & goto :dispatch
set "MODE=demo"

:dispatch
if /i "%MODE%"=="demo" goto :demo
if /i "%MODE%"=="start" goto :start
if /i "%MODE%"=="dev" goto :dev
if /i "%MODE%"=="seed" goto :seed
if /i "%MODE%"=="reset" goto :reset
if /i "%MODE%"=="install" goto :install
echo Unknown option "%MODE%". Use: demo, start, dev, seed, reset or install.
goto :fail

:demo
call :read_port
echo.
echo Starting the demo on http://localhost:%PORT%  (data resets when you stop it)
echo Press Ctrl+C to stop.
start "" "http://localhost:%PORT%"
call npm run demo
goto :end

:start
call :prepare || goto :fail
call :read_port
echo.
echo Starting on http://localhost:%PORT%   Press Ctrl+C to stop.
start "" "http://localhost:%PORT%"
call npm start
goto :end

:dev
call :prepare || goto :fail
call :read_port
echo.
echo Starting in watch mode on http://localhost:%PORT%   Press Ctrl+C to stop.
start "" "http://localhost:%PORT%"
call npm run dev
goto :end

:seed
call :prepare || goto :fail
call npm run seed
if errorlevel 1 goto :fail
goto :done

:reset
call :prepare || goto :fail
echo.
echo WARNING: this deletes every user, question, test and attempt in the database
echo configured in .env, then loads the sample data again.
set "CONFIRM="
set /p "CONFIRM=Type RESET to continue: "
if not "%CONFIRM%"=="RESET" (
  echo Cancelled.
  goto :done
)
call npm run seed -- --reset
if errorlevel 1 goto :fail
goto :done

:install
call npm install
if errorlevel 1 goto :fail
goto :done

rem ------------------------------------------------------------------ helpers
:check_node
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed or not on PATH. Install Node.js 22 or newer from https://nodejs.org
  exit /b 1
)
for /f "tokens=1 delims=." %%v in ('node -v') do set "NODE_MAJOR=%%v"
set "NODE_MAJOR=%NODE_MAJOR:v=%"
if %NODE_MAJOR% LSS 22 (
  echo Node.js 22 or newer is required. You have:
  node -v
  exit /b 1
)
exit /b 0

:prepare
if not exist ".env" (
  if exist ".env.example" copy ".env.example" ".env" >nul
  echo.
  echo A .env file was created from .env.example.
  echo Put your MongoDB connection string in it as MONGODB_URI, save, and run this again.
  start "" notepad ".env"
  exit /b 1
)
findstr /b /c:"MONGODB_URI=mongodb" ".env" >nul
if errorlevel 1 (
  echo MONGODB_URI is missing in .env. Add your connection string and try again.
  start "" notepad ".env"
  exit /b 1
)
if not exist "node_modules\mongodb" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)
exit /b 0

:read_port
set "PORT=3000"
if exist ".env" for /f "usebackq tokens=1,* delims==" %%a in (".env") do if /i "%%a"=="PORT" set "PORT=%%b"
exit /b 0

:fail
echo.
echo Something went wrong. See the messages above.
pause
exit /b 1

:done
echo.
pause
:end
endlocal
