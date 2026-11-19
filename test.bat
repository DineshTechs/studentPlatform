@echo off
setlocal EnableExtensions
rem ---------------------------------------------------------------------------
rem  test.bat  -  run the automated test suite
rem
rem    test.bat          fast run against the built-in in-memory database
rem    test.bat mongo    run the same tests against the MongoDB in .env
rem                      (uses a temporary database that is deleted afterwards)
rem    test.bat all      both of the above
rem
rem  Set NO_PAUSE=1 to skip the "press any key" at the end (for scripts/CI).
rem  Exit code is 0 when every test passes, 1 otherwise.
rem ---------------------------------------------------------------------------
cd /d "%~dp0"
title Pariksha tests

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed or not on PATH. Install Node.js 22 or newer from https://nodejs.org
  set "RESULT=1"
  goto :end
)

set "RESULT=0"
set "MODE=%~1"
if "%MODE%"=="" set "MODE=memory"

if /i "%MODE%"=="memory" goto :memory
if /i "%MODE%"=="mongo" goto :mongo
if /i "%MODE%"=="all" goto :memory
echo Unknown option "%MODE%". Use: test.bat, test.bat mongo or test.bat all
set "RESULT=1"
goto :end

:memory
echo.
echo === Tests: in-memory database ===
set "TEST_MONGODB_URI="
call npm test
if errorlevel 1 set "RESULT=1"
if /i "%MODE%"=="all" goto :mongo
goto :summary

:mongo
echo.
echo === Tests: MongoDB from .env (temporary database) ===
if not exist ".env" (
  echo No .env file found. Create one from .env.example with your MONGODB_URI.
  set "RESULT=1"
  goto :summary
)
set "TEST_MONGODB_URI="
for /f "usebackq tokens=1,* delims==" %%a in (".env") do if /i "%%a"=="MONGODB_URI" set "TEST_MONGODB_URI=%%b"
if not defined TEST_MONGODB_URI (
  echo MONGODB_URI is not set in .env.
  set "RESULT=1"
  goto :summary
)
if not exist "node_modules\mongodb" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    set "RESULT=1"
    goto :summary
  )
)
call npm test
if errorlevel 1 set "RESULT=1"

:summary
echo.
if "%RESULT%"=="0" (
  echo ALL TESTS PASSED
) else (
  echo SOME TESTS FAILED - see the output above.
)

:end
if not defined NO_PAUSE pause
endlocal & exit /b %RESULT%
