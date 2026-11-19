@echo off
setlocal EnableExtensions
rem ---------------------------------------------------------------------------
rem  push.bat  -  test, commit and push to GitHub (or any git remote)
rem
rem    push.bat                         asks for a commit message
rem    push.bat "Add payment module"    uses the given message
rem    push.bat "message" --skip-tests  commits without running tests first
rem
rem  First run: initialises the repository, connects it to DEFAULT_REMOTE below
rem  and pushes to branch "main". Your .env file (database password) is never committed.
rem ---------------------------------------------------------------------------
set "DEFAULT_REMOTE=https://github.com/DineshTechs/studentPlatform.git"
cd /d "%~dp0"
title Pariksha git push

where git >nul 2>&1
if errorlevel 1 (
  echo Git is not installed or not on PATH. Install it from https://git-scm.com/download/win
  goto :fail
)

set "MSG=%~1"
set "SKIP_TESTS="
if /i "%~1"=="--skip-tests" (
  set "MSG="
  set "SKIP_TESTS=1"
)
if /i "%~2"=="--skip-tests" set "SKIP_TESTS=1"

rem ---- repository setup on first run
if not exist ".git" (
  echo Initialising a new git repository...
  git init
  if errorlevel 1 goto :fail
  git branch -M main
)

git config user.name >nul 2>&1
if errorlevel 1 (
  set /p "GIT_NAME=Your name for commits: "
  call git config user.name "%%GIT_NAME%%"
)
git config user.email >nul 2>&1
if errorlevel 1 (
  set /p "GIT_EMAIL=Your email for commits: "
  call git config user.email "%%GIT_EMAIL%%"
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  set "REMOTE=%DEFAULT_REMOTE%"
  call :add_remote || goto :fail
)

rem ---- first commit on this computer: build on top of whatever is already on GitHub
git rev-parse --verify HEAD >nul 2>&1
if errorlevel 1 call :adopt_remote_history

rem ---- safety: secrets must never be committed
if not exist ".gitignore" (
  echo .gitignore is missing - refusing to push without it.
  goto :fail
)
findstr /x /c:".env" ".gitignore" >nul || (
  echo .env>>".gitignore"
  echo Added .env to .gitignore.
)
git ls-files --error-unmatch ".env" >nul 2>&1
if not errorlevel 1 (
  echo Removing .env from version control - it stays on your disk.
  git rm --cached --quiet ".env"
)

rem ---- tests
if defined SKIP_TESTS (
  echo Skipping tests as requested.
) else (
  echo.
  echo Running tests before pushing...
  set "NO_PAUSE=1"
  call test.bat
  if errorlevel 1 (
    echo.
    echo Tests failed - nothing was committed or pushed.
    echo Fix the failures, or run: push.bat "message" --skip-tests
    goto :fail
  )
)

rem ---- commit
git add -A
if errorlevel 1 goto :fail
git diff --cached --quiet
if not errorlevel 1 (
  echo.
  echo No changes to commit.
  goto :push
)
echo.
echo Changes to be committed:
git status --short
echo.
if "%MSG%"=="" set /p "MSG=Commit message: "
if "%MSG%"=="" (
  for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH:mm"') do set "MSG=Update %%d"
)
git commit -m "%MSG%"
if errorlevel 1 goto :fail

:push
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%b"
echo.
echo Pushing branch %BRANCH% to origin...
git push -u origin "%BRANCH%"
if errorlevel 1 (
  echo.
  echo Push failed. Common causes:
  echo   - not signed in: run "git push" once in a terminal to log in to GitHub
  echo   - the remote has commits you don't have: run "git pull --rebase origin %BRANCH%" and try again
  goto :fail
)
echo.
echo Done. Pushed to:
git remote get-url origin
goto :done

:add_remote
if "%REMOTE%"=="" (
  set /p "REMOTE=Remote URL, e.g. https://github.com/you/repo.git: "
)
if "%REMOTE%"=="" (
  echo No URL entered.
  exit /b 1
)
echo Connecting to %REMOTE%
git remote add origin "%REMOTE%"
exit /b %errorlevel%

:adopt_remote_history
rem If GitHub already has commits on main, start from them so the push is not rejected.
git fetch --quiet origin main >nul 2>&1
if errorlevel 1 exit /b 0
echo GitHub already has commits on main - your files will be committed on top of them.
git reset --quiet origin/main
git branch --set-upstream-to=origin/main main >nul 2>&1
exit /b 0

:fail
echo.
pause
endlocal & exit /b 1

:done
echo.
pause
endlocal & exit /b 0
